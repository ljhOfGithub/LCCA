"""Direct LLM scoring endpoint using Claude API."""
import json
import re
from typing import Annotated
from uuid import UUID
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import get_current_user, require_teacher
from app.db.session import get_session
from app.models.attempt import Attempt, AttemptStatus, TaskResponse, TaskResponseStatus
from app.models.scoring import ScoreRun, ScoreDetail, AttemptResult
from app.models.scenario import Task, Material
from app.models.rubric import Rubric, Criterion
from app.core.status import ScoreRunStatus

router = APIRouter()

CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

TASK_SYSTEM_PROMPT = """You are an expert English language examiner specialising in CEFR-aligned assessments.
Evaluate the student's response strictly and fairly. Return ONLY valid JSON — no markdown, no extra text."""

TASK_PROMPTS = {
    "reading": """Evaluate this Task 1 (Reading & Note-taking) response.

Advertisement/Reading text:
{material}

Student notes:
{response}

Criteria:
{criteria}

Return JSON:
{{
  "scores": {{"<criterion_name>": {{"score": <number>, "max": <number>, "feedback": "<string>"}}}},
  "overall_feedback": "<2-3 sentence summary>",
  "cefr_level": "<A1|A2|B1|B2|C1|C2>"
}}""",

    "writing": """Evaluate this Task 2 (Cover Letter Writing) response.

Job description:
{material}

Student's cover letter:
{response}

Word count: {word_count}

Criteria:
{criteria}

Return JSON:
{{
  "scores": {{"<criterion_name>": {{"score": <number>, "max": <number>, "feedback": "<string>"}}}},
  "overall_feedback": "<2-3 sentence summary>",
  "cefr_level": "<A1|A2|B1|B2|C1|C2>"
}}""",

    "listening": """Evaluate this Task 3 (Listening & Note-taking) response.

Student notes:
{response}

Criteria:
{criteria}

Return JSON:
{{
  "scores": {{"<criterion_name>": {{"score": <number>, "max": <number>, "feedback": "<string>"}}}},
  "overall_feedback": "<2-3 sentence summary>",
  "cefr_level": "<A1|A2|B1|B2|C1|C2>"
}}""",

    "speaking": """Evaluate this Task 4 (Speaking) submission.

The student submitted {recording_count} audio recording(s).
Storage keys: {storage_keys}

Note: Without audio transcription, base your assessment on submission completeness and the rubric.

Criteria:
{criteria}

Return JSON:
{{
  "scores": {{"<criterion_name>": {{"score": <number>, "max": <number>, "feedback": "<string>"}}}},
  "overall_feedback": "<2-3 sentence summary>",
  "cefr_level": "<A1|A2|B1|B2|C1|C2>"
}}""",
}

DEFAULT_CRITERIA = {
    "reading": [
        {"name": "Key Information", "max_score": 5.0, "description": "Identifies main points and key details"},
        {"name": "Accuracy", "max_score": 5.0, "description": "Notes are accurate to the source text"},
        {"name": "Organisation", "max_score": 5.0, "description": "Notes are logically organised"},
        {"name": "Language", "max_score": 5.0, "description": "Appropriate vocabulary and grammar"},
    ],
    "writing": [
        {"name": "Task Achievement", "max_score": 10.0, "description": "Addresses the job requirements"},
        {"name": "Coherence & Cohesion", "max_score": 10.0, "description": "Logical flow and paragraphing"},
        {"name": "Lexical Resource", "max_score": 10.0, "description": "Range and accuracy of vocabulary"},
        {"name": "Grammatical Range & Accuracy", "max_score": 10.0, "description": "Grammar structures and accuracy"},
    ],
    "listening": [
        {"name": "Key Information", "max_score": 5.0, "description": "Captures main spoken content"},
        {"name": "Accuracy", "max_score": 5.0, "description": "Notes reflect what was heard"},
        {"name": "Organisation", "max_score": 5.0, "description": "Notes are logically organised"},
        {"name": "Language", "max_score": 5.0, "description": "Appropriate vocabulary"},
    ],
    "speaking": [
        {"name": "Fluency & Coherence", "max_score": 10.0, "description": "Speaks fluently with clear ideas"},
        {"name": "Lexical Resource", "max_score": 10.0, "description": "Range and accuracy of vocabulary"},
        {"name": "Grammatical Range & Accuracy", "max_score": 10.0, "description": "Grammar structures"},
        {"name": "Pronunciation", "max_score": 10.0, "description": "Clarity and intelligibility"},
    ],
}


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", _strip_html(text)) if w])


def _build_criteria_text(criteria: list) -> str:
    return "\n".join(
        f"- {c['name']} (max {c['max_score']}): {c.get('description', '')}"
        for c in criteria
    )


async def _call_claude(prompt: str) -> dict:
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured. Set ANTHROPIC_API_KEY in backend env.")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.anthropic_model,
                "max_tokens": 2048,
                "system": TASK_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Claude API error: {resp.text}")

        raw = resp.json()["content"][0]["text"]

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise HTTPException(status_code=502, detail=f"Could not parse Claude response: {raw[:200]}")


class ScoringResult(BaseModel):
    attempt_id: str
    status: str
    overall_score: float
    overall_score_max: float
    cefr_level: str
    task_results: list[dict]


@router.post("/attempt/{attempt_id}", response_model=ScoringResult)
async def score_attempt_with_llm(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> ScoringResult:
    """Score a submitted attempt using Claude. Creates ScoreRun/ScoreDetail/AttemptResult records."""

    # Load attempt
    result = await session.execute(
        select(Attempt)
        .options(selectinload(Attempt.task_responses))
        .where(Attempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.SCORED):
        raise HTTPException(status_code=400, detail="Attempt must be submitted before scoring")

    # Load tasks for this scenario (with materials and rubrics)
    tasks_result = await session.execute(
        select(Task)
        .options(selectinload(Task.materials), selectinload(Task.rubric).selectinload(Rubric.criteria))
        .where(Task.scenario_id == attempt.scenario_id)
        .order_by(Task.sequence_order)
    )
    tasks = {str(t.id): t for t in tasks_result.scalars().all()}

    task_results = []
    total_score = 0.0
    total_max = 0.0
    cefr_votes = []

    for task_response in attempt.task_responses:
        task = tasks.get(str(task_response.task_id))
        if not task:
            continue

        task_type = task.task_type.value if hasattr(task.task_type, "value") else str(task.task_type)
        content = task_response.content or ""

        # Build criteria list (from rubric if available, else defaults)
        if task.rubric and task.rubric.criteria:
            criteria = [
                {"name": c.name, "max_score": c.max_score, "description": c.description or ""}
                for c in sorted(task.rubric.criteria, key=lambda x: x.sequence_order)
            ]
        else:
            criteria = DEFAULT_CRITERIA.get(task_type, DEFAULT_CRITERIA["writing"])

        # Get relevant material text
        material_text = ""
        for m in (task.materials or []):
            if task_type == "reading" and m.material_type == "advertisement":
                material_text = m.content or ""
            elif task_type == "writing" and m.material_type == "job_description":
                material_text = m.content or ""

        # Build prompt
        criteria_text = _build_criteria_text(criteria)
        prompt_template = TASK_PROMPTS.get(task_type, TASK_PROMPTS["writing"])

        if task_type == "reading":
            prompt = prompt_template.format(
                material=material_text or task.description or "(no reading text provided)",
                response=content,
                criteria=criteria_text,
            )
        elif task_type == "writing":
            prompt = prompt_template.format(
                material=material_text or task.description or "(no job description provided)",
                response=_strip_html(content),
                word_count=_word_count(content),
                criteria=criteria_text,
            )
        elif task_type == "listening":
            notes = content
            try:
                parsed = json.loads(content)
                notes = parsed.get("notes", content)
            except Exception:
                pass
            prompt = prompt_template.format(response=notes, criteria=criteria_text)
        else:  # speaking
            recording_data = {}
            try:
                recording_data = json.loads(content)
            except Exception:
                pass
            recording_map = recording_data.get("recordingMap", {})
            prompt = prompt_template.format(
                recording_count=len(recording_map),
                storage_keys=", ".join(recording_map.values()) or "none",
                criteria=criteria_text,
            )

        # Call Claude
        try:
            llm_result = await _call_claude(prompt)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

        # Parse scores
        scores_raw = llm_result.get("scores", {})
        task_score = 0.0
        task_max = 0.0
        score_details_data = []

        # Build a quick lookup of criterion records by name
        criterion_by_name = {}
        if task.rubric and task.rubric.criteria:
            criterion_by_name = {c.name: c for c in task.rubric.criteria}

        for crit in criteria:
            crit_name = crit["name"]
            crit_max = crit["max_score"]
            entry = scores_raw.get(crit_name, {})
            score_val = float(entry.get("score", 0))
            score_val = max(0.0, min(score_val, crit_max))
            feedback = entry.get("feedback", "")

            task_score += score_val
            task_max += crit_max
            score_details_data.append({
                "name": crit_name, "score": score_val, "max": crit_max,
                "feedback": feedback, "criterion_obj": criterion_by_name.get(crit_name),
            })

        total_score += task_score
        total_max += task_max
        cefr_votes.append(llm_result.get("cefr_level", "B1"))

        # Persist ScoreRun + ScoreDetail
        score_run = ScoreRun(
            task_response_id=task_response.id,
            status=ScoreRunStatus.COMPLETED,
            run_started_at=datetime.now(timezone.utc),
            run_completed_at=datetime.now(timezone.utc),
            raw_llm_response=json.dumps(llm_result),
        )
        session.add(score_run)
        await session.flush()

        for sd in score_details_data:
            if sd["criterion_obj"]:
                detail = ScoreDetail(
                    score_run_id=score_run.id,
                    task_response_id=task_response.id,
                    criterion_id=sd["criterion_obj"].id,
                    score=sd["score"],
                    max_score=sd["max"],
                    feedback=sd["feedback"],
                )
                session.add(detail)

        task_results.append({
            "task_id": str(task.id),
            "task_type": task_type,
            "task_title": task.title,
            "score": task_score,
            "max_score": task_max,
            "cefr_level": llm_result.get("cefr_level", "B1"),
            "overall_feedback": llm_result.get("overall_feedback", ""),
            "criteria_scores": [
                {"name": sd["name"], "score": sd["score"], "max": sd["max"], "feedback": sd["feedback"]}
                for sd in score_details_data
            ],
        })

    # Determine overall CEFR level (most common vote, or highest)
    if cefr_votes:
        from collections import Counter
        vote_counts = Counter(cefr_votes)
        overall_cefr = vote_counts.most_common(1)[0][0]
    else:
        overall_cefr = "B1"

    # Remove existing AttemptResult if any
    existing_result_q = await session.execute(
        select(AttemptResult).where(AttemptResult.attempt_id == attempt_id)
    )
    existing_ar = existing_result_q.scalar_one_or_none()
    if existing_ar:
        await session.delete(existing_ar)

    attempt_result = AttemptResult(
        attempt_id=attempt_id,
        cefr_level=overall_cefr,
        overall_score=total_score,
        overall_score_max=total_max,
        band_score=round((total_score / total_max) * 9, 1) if total_max > 0 else 0.0,
    )
    session.add(attempt_result)
    attempt.status = AttemptStatus.SCORED
    await session.commit()

    return ScoringResult(
        attempt_id=str(attempt_id),
        status="scored",
        overall_score=total_score,
        overall_score_max=total_max,
        cefr_level=overall_cefr,
        task_results=task_results,
    )
