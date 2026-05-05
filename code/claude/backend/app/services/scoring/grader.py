"""Scoring service - Grader for evaluating responses."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.status import ScoreRunStatus, TaskResponseStatus
from app.models.attempt import TaskResponse, Attempt, AttemptStatus
from app.models.artifact import ResponseArtifact
from app.models.rubric import Rubric, Criterion, PromptTemplate
from app.models.scenario import Task, Material
from app.services.llm import (
    LLMClient,
    LLMProvider,
    LLMResponse,
    OpenAIClient,
    AnthropicClient,
    MiniMaxClient,
    ZhipuClient,
    LLMError,
)
from app.services.asr import WhisperClient
from app.services.scoring.prompts import (
    WRITING_SYSTEM_PROMPT,
    SPEAKING_SYSTEM_PROMPT,
    get_writing_prompt,
    get_speaking_prompt,
    parse_score_response,
)

logger = logging.getLogger(__name__)


class Scorer:
    """Main scoring service for evaluating student responses.

    Supports:
    - Writing tasks: Direct LLM scoring
    - Speaking tasks: ASR transcription + LLM scoring
    - Listening tasks: LLM scoring
    - Reading tasks: LLM scoring
    """

    # Task type constants
    TASK_TYPE_READING = "reading"
    TASK_TYPE_WRITING = "writing"
    TASK_TYPE_LISTENING = "listening"
    TASK_TYPE_SPEAKING = "speaking"

    def __init__(self, session: AsyncSession):
        """Initialize scorer with database session.

        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def create_llm_client(
        self,
        provider: str = "openai",
        api_key: str | None = None,
    ) -> LLMClient:
        """Create LLM client based on provider.

        Args:
            provider: One of 'openai', 'anthropic', 'minimax', 'zhipu'
            api_key: Override API key (defaults to settings)

        Returns:
            Configured LLM client
        """
        api_key = api_key or settings.llm_api_key

        match provider.lower():
            case "openai":
                return OpenAIClient(
                    api_key=api_key,
                    base_url=settings.llm_base_url,
                    timeout=30,
                    max_retries=3,
                )
            case "anthropic":
                return AnthropicClient(
                    api_key=api_key,
                    timeout=30,
                    max_retries=3,
                )
            case "minimax":
                return MiniMaxClient(
                    api_key=api_key,
                    timeout=30,
                    max_retries=3,
                )
            case "zhipu":
                return ZhipuClient(
                    api_key=api_key,
                    timeout=30,
                    max_retries=3,
                )
            case _:
                raise ValueError(f"Unknown LLM provider: {provider}")

    async def score_task_response(
        self,
        task_response_id: str,
        provider: str = "openai",
    ) -> dict[str, Any]:
        """Score a single task response.

        Args:
            task_response_id: UUID of the task response
            provider: LLM provider to use

        Returns:
            Dict with score_run_id and results
        """
        from app.models.scoring import ScoreRun, ScoreDetail

        logger.info(f"Scoring task response {task_response_id}")

        # Get task response with eager-loaded task and its materials
        result = await self.session.execute(
            select(TaskResponse)
            .options(selectinload(TaskResponse.task).selectinload(Task.materials))
            .where(TaskResponse.id == uuid.UUID(task_response_id))
        )
        task_response = result.scalar_one_or_none()

        if not task_response:
            raise ValueError(f"Task response {task_response_id} not found")

        # Get the task to determine type
        task = task_response.task
        task_type = getattr(task, "task_type", "writing")

        # Create score run
        score_run = ScoreRun(
            task_response_id=task_response.id,
            status=ScoreRunStatus.RUNNING,
            run_started_at=datetime.now(timezone.utc),
        )
        self.session.add(score_run)
        await self.session.flush()

        try:
            # Get submission content
            content = await self._get_submission_content(task_response, task_type)

            # Get rubric and criteria
            rubric = await self._get_rubric(task.id)
            criteria = await self._get_criteria(rubric.id)

            # Get prompt template (optional) — prefer task-specific assignment
            prompt_template = await self._get_prompt_template(rubric.id, task_id=task.id) if rubric else None

            # Score based on task type
            llm_resp: LLMResponse | None = None
            rendered_sys: str | None = None
            rendered_usr: str | None = None
            async with await self.create_llm_client(provider) as llm:
                if task_type in [self.TASK_TYPE_WRITING, self.TASK_TYPE_READING]:
                    scores, llm_resp, rendered_sys, rendered_usr = await self._score_text(
                        llm, task, content, criteria, prompt_template
                    )
                elif task_type == self.TASK_TYPE_SPEAKING:
                    scores, llm_resp, rendered_sys, rendered_usr = await self._score_speaking(
                        llm, task, content, criteria, prompt_template
                    )
                elif task_type == self.TASK_TYPE_LISTENING:
                    scores, llm_resp, rendered_sys, rendered_usr = await self._score_text(
                        llm, task, content, criteria, prompt_template
                    )
                else:
                    raise ValueError(f"Unknown task type: {task_type}")

            # Persist all LLM interaction data
            score_run.prompt_template_name = (
                prompt_template.name if prompt_template else f"[default:{task_type}]"
            )
            score_run.rendered_system_prompt = rendered_sys
            score_run.rendered_user_prompt = rendered_usr
            if llm_resp:
                # Store the scoring text as raw_llm_response so review.py can parse it
                score_run.raw_llm_response = llm_resp.content
                score_run.llm_model = llm_resp.model
                score_run.llm_token_usage = (
                    json.dumps(llm_resp.usage, ensure_ascii=False) if llm_resp.usage else None
                )

            # Build a map from criterion_id → name for convenience
            criteria_by_id = {str(c.id): c.name for c in criteria}

            # Save score details
            score_details = []
            for criterion_id, score_data in scores.items():
                detail = ScoreDetail(
                    score_run_id=score_run.id,
                    task_response_id=task_response.id,
                    criterion_id=uuid.UUID(criterion_id),
                    criterion_name=criteria_by_id.get(criterion_id, score_data.get("feedback", "")),
                    score=score_data["score"],
                    max_score=score_data["max_score"],
                    feedback=score_data.get("feedback"),
                )
                self.session.add(detail)
                score_details.append(detail)

            # Update score run
            score_run.status = ScoreRunStatus.COMPLETED
            score_run.run_completed_at = datetime.now(timezone.utc)

            # Update task response
            task_response.status = TaskResponseStatus.SCORED
            task_response.scored_at = datetime.now(timezone.utc)

            await self.session.commit()

            logger.info(f"Scoring completed for task response {task_response_id}")

            return {
                "success": True,
                "score_run_id": str(score_run.id),
                "scores": scores,
            }

        except Exception as e:
            logger.exception(f"Scoring failed for task response {task_response_id}")
            score_run.status = ScoreRunStatus.FAILED
            score_run.error_message = str(e)
            score_run.run_completed_at = datetime.now(timezone.utc)
            await self.session.commit()

            return {
                "success": False,
                "score_run_id": str(score_run.id),
                "error": str(e),
            }

    async def _get_submission_content(
        self,
        task_response: TaskResponse,
        task_type: str,
    ) -> str:
        """Get submission content based on task type.

        Args:
            task_response: TaskResponse object
            task_type: Type of task

        Returns:
            Text content to score
        """
        if task_type == self.TASK_TYPE_SPEAKING:
            # For speaking, content is in artifacts (audio)
            artifacts = await self.session.execute(
                select(ResponseArtifact).where(
                    ResponseArtifact.task_response_id == task_response.id,
                    ResponseArtifact.status == "uploaded",
                )
            )
            audio_artifacts = artifacts.scalars().all()

            if not audio_artifacts:
                raise ValueError("No audio artifact found for speaking task")

            # Return the storage key (URL) for ASR processing
            return audio_artifacts[0].storage_key

        else:
            # For other tasks, text content is directly in task_response
            # Check if there's a text artifact
            artifacts = await self.session.execute(
                select(ResponseArtifact).where(
                    ResponseArtifact.task_response_id == task_response.id,
                    ResponseArtifact.status == "uploaded",
                )
            )

            text_artifact = artifacts.scalars().first()
            if text_artifact:
                # For now, assume text artifact has content in a related table
                # or we need to fetch from storage
                # This is a placeholder - actual implementation would fetch from S3
                return f"artifact:{text_artifact.id}"

            # Fall back to task_response content (if stored directly)
            return getattr(task_response, "content", "") or ""

    async def _get_rubric(self, task_id: uuid.UUID) -> Rubric | None:
        """Get rubric for a task."""
        result = await self.session.execute(
            select(Rubric).where(Rubric.task_id == task_id)
        )
        return result.scalar_one_or_none()

    async def _get_criteria(self, rubric_id: uuid.UUID) -> list[Criterion]:
        """Get all criteria for a rubric."""
        result = await self.session.execute(
            select(Criterion)
            .where(Criterion.rubric_id == rubric_id)
            .order_by(Criterion.sequence_order)
        )
        return list(result.scalars().all())

    async def _get_prompt_template(
        self,
        rubric_id: uuid.UUID,
        task_id: uuid.UUID | None = None,
        template_type: str = "scoring",
    ) -> PromptTemplate | None:
        """Get prompt template for a task.

        Prefers a template explicitly assigned to `task_id`. Falls back to
        first active template matching `template_type`.
        """
        result = await self.session.execute(
            select(PromptTemplate).where(PromptTemplate.is_active == True)
        )
        templates = result.scalars().all()

        if task_id:
            task_id_str = str(task_id)
            for t in templates:
                ids = t.task_ids if isinstance(t.task_ids, list) else []
                if task_id_str in ids:
                    return t

        # Fall back to first active template of matching type
        for t in templates:
            if t.template_type == template_type:
                return t
        return None

    def _build_template_vars(
        self,
        task,
        criteria: list[Criterion],
        submission: str = "",
        transcription: str = "",
    ) -> dict:
        """Build the full variable context for prompt template rendering.

        All keys are available as {variable_name} placeholders in templates.
        Missing keys in the template are left as-is (SafeDict behaviour).
        """
        # Task materials — plain text content joined by type
        materials = getattr(task, "materials", []) or []
        materials_text = "\n\n".join(
            f"[{m.material_type.upper()}]\n{m.content}"
            for m in materials if m.content
        )
        materials_by_type: dict[str, str] = {}
        for m in materials:
            if m.content:
                materials_by_type.setdefault(m.material_type, m.content)

        # Criteria — simple list
        criteria_lines = "\n".join(
            f"- {c.name} (max {c.max_score}): {c.description or ''}"
            for c in criteria
        )

        # Criteria with CEFR band descriptors
        cefr_lines_parts = []
        for c in criteria:
            part = f"Criterion: {c.name} (max {c.max_score})\n  Description: {c.description or ''}"
            if c.cefr_descriptors:
                try:
                    bands = json.loads(c.cefr_descriptors)
                    band_text = "\n".join(f"  {level}: {desc}" for level, desc in bands.items())
                    part += f"\n  CEFR bands:\n{band_text}"
                except Exception:
                    pass
            cefr_lines_parts.append(part)
        criteria_with_bands = "\n\n".join(cefr_lines_parts)

        max_score = max((c.max_score for c in criteria), default=10)
        total_max = sum(c.max_score for c in criteria)

        return {
            # Task info
            "task_title": getattr(task, "title", ""),
            "task_type": str(getattr(task, "task_type", "")),
            "task_description": getattr(task, "description", "") or "",
            # Materials
            "materials": materials_text,
            **{f"material_{k}": v for k, v in materials_by_type.items()},
            # Criteria
            "criteria": criteria_lines,
            "criteria_with_bands": criteria_with_bands,
            # Student response
            "submission": submission,
            "transcription": transcription,
            # Score hints
            "max_score": max_score,
            "total_max_score": total_max,
            # Output format reminder
            "json_format": (
                '{"scores": [{"criterion": "<name>", "score": <number>,'
                ' "max_score": <number>, "feedback": "<text>"}],'
                ' "overall_feedback": "<summary>", "cefr_level": "<A2|B1|B2|C1>"}'
            ),
        }

    @staticmethod
    def _render_template(template_str: str, vars: dict) -> str:
        """Render a prompt template, substituting {identifier} placeholders only."""
        import re
        def _replace(m: re.Match) -> str:
            key = m.group(1)
            return str(vars[key]) if key in vars else m.group(0)
        return re.sub(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', _replace, template_str)

    @staticmethod
    def _map_scores(parsed: dict, criteria: list[Criterion]) -> dict:
        """Map LLM score entries back to criterion IDs."""
        scores: dict[str, dict] = {}
        for c in criteria:
            for entry in parsed.get("scores", []):
                if entry.get("criterion") == c.name:
                    scores[str(c.id)] = {
                        "score": entry.get("score"),
                        "max_score": entry.get("max_score", c.max_score),
                        "feedback": entry.get("feedback"),
                    }
                    break

        # Positional fallback when names don't match
        if not scores and parsed.get("scores"):
            for i, c in enumerate(criteria):
                if i < len(parsed["scores"]):
                    entry = parsed["scores"][i]
                    scores[str(c.id)] = {
                        "score": entry.get("score"),
                        "max_score": entry.get("max_score", c.max_score),
                        "feedback": entry.get("feedback"),
                    }
        return scores

    async def _score_text(
        self,
        llm: LLMClient,
        task,
        content: str,
        criteria: list[Criterion],
        prompt_template: PromptTemplate | None = None,
    ) -> tuple[dict[str, dict], LLMResponse, str | None, str | None]:
        if content.startswith("artifact:"):
            content = "[Content fetched from artifact]"

        if prompt_template:
            vars = self._build_template_vars(task, criteria, submission=content)
            system_prompt = self._render_template(prompt_template.system_prompt, vars)
            user_prompt = self._render_template(prompt_template.user_prompt_template, vars)
            model = prompt_template.model
            temperature = prompt_template.temperature
        else:
            criteria_dicts = [
                {"name": c.name, "description": c.description or "", "max_score": c.max_score}
                for c in criteria
            ]
            system_prompt = WRITING_SYSTEM_PROMPT
            user_prompt = get_writing_prompt(
                task_title=getattr(task, "title", ""),
                criteria=criteria_dicts,
                submission=content,
            )
            model = None
            temperature = 0.3

        response = await llm.complete(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=2000,
            model=model,
        )

        parsed = parse_score_response(response.content)
        return self._map_scores(parsed, criteria), response, system_prompt, user_prompt

    async def _score_speaking(
        self,
        llm: LLMClient,
        task,
        audio_storage_key: str,
        criteria: list[Criterion],
        prompt_template: PromptTemplate | None = None,
    ) -> tuple[dict[str, dict], LLMResponse, str | None, str | None]:
        asr_client = WhisperClient(api_key=settings.asr_api_key or settings.llm_api_key)
        transcription = await asr_client.transcribe(audio_url=audio_storage_key, language="en")
        await asr_client.close()

        if not transcription:
            raise ValueError("ASR returned empty transcription")

        if prompt_template:
            vars = self._build_template_vars(task, criteria, transcription=transcription)
            system_prompt = self._render_template(prompt_template.system_prompt, vars)
            user_prompt = self._render_template(prompt_template.user_prompt_template, vars)
            model = prompt_template.model
            temperature = prompt_template.temperature
        else:
            criteria_dicts = [
                {"name": c.name, "description": c.description or "", "max_score": c.max_score}
                for c in criteria
            ]
            system_prompt = SPEAKING_SYSTEM_PROMPT
            user_prompt = get_speaking_prompt(
                task_title=getattr(task, "title", ""),
                question=getattr(task, "question", ""),
                transcription=transcription,
                criteria=criteria_dicts,
            )
            model = None
            temperature = 0.3

        response = await llm.complete(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=2000,
            model=model,
        )

        parsed = parse_score_response(response.content)
        return self._map_scores(parsed, criteria), response, system_prompt, user_prompt


def create_scorer(session: AsyncSession) -> Scorer:
    """Factory function to create a Scorer instance.

    Args:
        session: SQLAlchemy async session

    Returns:
        Configured Scorer instance
    """
    return Scorer(session)