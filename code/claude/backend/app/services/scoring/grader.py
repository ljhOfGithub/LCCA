"""Scoring service - Grader for evaluating responses."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.status import ScoreRunStatus, TaskResponseStatus
from app.models.attempt import TaskResponse, Attempt, AttemptStatus
from app.models.artifact import ResponseArtifact, ArtifactStatus
from app.models.rubric import Rubric, Criterion, PromptTemplate
from app.services.llm import (
    LLMClient,
    LLMProvider,
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

        # Get task response and related data
        result = await self.session.execute(
            select(TaskResponse).where(TaskResponse.id == uuid.UUID(task_response_id))
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

            # Get prompt template (optional)
            prompt_template = await self._get_prompt_template(rubric.id) if rubric else None

            # Score based on task type
            raw_llm_response = None
            async with await self.create_llm_client(provider) as llm:
                if task_type in [self.TASK_TYPE_WRITING, self.TASK_TYPE_READING]:
                    scores, raw_llm_response = await self._score_text(
                        llm, task, content, criteria, prompt_template
                    )
                elif task_type == self.TASK_TYPE_SPEAKING:
                    scores, raw_llm_response = await self._score_speaking(
                        llm, task, content, criteria, prompt_template
                    )
                elif task_type == self.TASK_TYPE_LISTENING:
                    scores, raw_llm_response = await self._score_text(
                        llm, task, content, criteria, prompt_template
                    )
                else:
                    raise ValueError(f"Unknown task type: {task_type}")

            # Save score run with raw LLM response
            if raw_llm_response:
                score_run.raw_llm_response = str(raw_llm_response)

            # Save score details
            score_details = []
            for criterion_id, score_data in scores.items():
                detail = ScoreDetail(
                    score_run_id=score_run.id,
                    task_response_id=task_response.id,
                    criterion_id=uuid.UUID(criterion_id),
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
                    ResponseArtifact.status == ArtifactStatus.UPLOADED,
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
                    ResponseArtifact.status == ArtifactStatus.UPLOADED,
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
        template_type: str = "scoring",
    ) -> PromptTemplate | None:
        """Get prompt template for rubric.

        Args:
            rubric_id: Rubric UUID
            template_type: Template type (scoring, feedback, etc.)

        Returns:
            PromptTemplate if found, None otherwise
        """
        result = await self.session.execute(
            select(PromptTemplate).where(
                PromptTemplate.template_type == template_type,
                PromptTemplate.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def _score_text(
        self,
        llm: LLMClient,
        task,
        content: str,
        criteria: list[Criterion],
        prompt_template: PromptTemplate | None = None,
    ) -> tuple[dict[str, dict], str | None]:
        """Score text-based responses.

        Args:
            llm: LLM client
            task: Task object
            content: Text content
            criteria: List of criteria
            prompt_template: Optional custom prompt template from DB

        Returns:
            Tuple of (scores dict, raw LLM response or None)
        """
        if content.startswith("artifact:"):
            # Need to fetch artifact content from storage
            # Placeholder - actual implementation would fetch from S3
            content = "[Content fetched from artifact]"

        criteria_dicts = [
            {
                "name": c.name,
                "description": c.description or "",
                "max_score": c.max_score,
            }
            for c in criteria
        ]

        # Use custom prompt template if available, otherwise default
        if prompt_template:
            system_prompt = prompt_template.system_prompt
            user_prompt = prompt_template.user_prompt_template.format(
                task_title=getattr(task, "title", "Unknown Task"),
                criteria="\n".join(
                    f"- {c['name']} (max {c['max_score']}): {c['description']}"
                    for c in criteria_dicts
                ),
                submission=content,
            )
            model = prompt_template.model
            temperature = prompt_template.temperature
        else:
            system_prompt = WRITING_SYSTEM_PROMPT
            user_prompt = get_writing_prompt(
                task_title=getattr(task, "title", "Unknown Task"),
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

        # Get raw response for storage
        raw_response = None
        if hasattr(response, 'raw_response') and response.raw_response:
            raw_response = str(response.raw_response)

        parsed = parse_score_response(response.content)

        # Map back to criterion IDs
        scores = {}
        for c in criteria:
            for score_entry in parsed.get("scores", []):
                if score_entry.get("criterion") == c.name:
                    scores[str(c.id)] = {
                        "score": score_entry.get("score"),
                        "max_score": score_entry.get("max_score", c.max_score),
                        "feedback": score_entry.get("feedback"),
                    }
                    break

        # Handle case where criterion names don't match exactly
        if not scores and parsed.get("scores"):
            for i, c in enumerate(criteria):
                if i < len(parsed["scores"]):
                    entry = parsed["scores"][i]
                    scores[str(c.id)] = {
                        "score": entry.get("score"),
                        "max_score": entry.get("max_score", c.max_score),
                        "feedback": entry.get("feedback"),
                    }

        return scores, raw_response

    async def _score_speaking(
        self,
        llm: LLMClient,
        task,
        audio_storage_key: str,
        criteria: list[Criterion],
        prompt_template: PromptTemplate | None = None,
    ) -> tuple[dict[str, dict], str | None]:
        """Score speaking responses (requires ASR first).

        Args:
            llm: LLM client
            task: Task object
            audio_storage_key: S3 storage key for audio
            criteria: List of criteria
            prompt_template: Optional custom prompt template from DB

        Returns:
            Tuple of (scores dict, raw LLM response or None)
        """
        # Transcribe audio using ASR
        asr_client = WhisperClient(
            api_key=settings.asr_api_key or settings.llm_api_key,
        )

        transcription = await asr_client.transcribe(
            audio_url=audio_storage_key,
            language="en",
        )

        await asr_client.close()

        if not transcription:
            raise ValueError("ASR returned empty transcription")

        criteria_dicts = [
            {
                "name": c.name,
                "description": c.description or "",
                "max_score": c.max_score,
            }
            for c in criteria
        ]

        # Use custom prompt template if available, otherwise default
        if prompt_template:
            system_prompt = prompt_template.system_prompt
            user_prompt = prompt_template.user_prompt_template.format(
                task_title=getattr(task, "title", "Unknown Task"),
                question=getattr(task, "question", ""),
                transcription=transcription,
                criteria="\n".join(
                    f"- {c['name']} (max {c['max_score']}): {c['description']}"
                    for c in criteria_dicts
                ),
            )
            model = prompt_template.model
            temperature = prompt_template.temperature
        else:
            system_prompt = SPEAKING_SYSTEM_PROMPT
            user_prompt = get_speaking_prompt(
                task_title=getattr(task, "title", "Unknown Task"),
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

        # Get raw response for storage
        raw_response = None
        if hasattr(response, 'raw_response') and response.raw_response:
            raw_response = str(response.raw_response)

        parsed = parse_score_response(response.content)

        # Map back to criterion IDs
        scores = {}
        for c in criteria:
            for score_entry in parsed.get("scores", []):
                if score_entry.get("criterion") == c.name:
                    scores[str(c.id)] = {
                        "score": score_entry.get("score"),
                        "max_score": score_entry.get("max_score", c.max_score),
                        "feedback": score_entry.get("feedback"),
                    }
                    break

        return scores, raw_response


def create_scorer(session: AsyncSession) -> Scorer:
    """Factory function to create a Scorer instance.

    Args:
        session: SQLAlchemy async session

    Returns:
        Configured Scorer instance
    """
    return Scorer(session)