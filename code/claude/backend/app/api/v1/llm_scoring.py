"""LLM scoring endpoint — Task 1/2/3 via Claude, Task 4 via ASR+Claude."""
import json, re, asyncio
from collections import Counter
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
from app.models.attempt import Attempt, AttemptStatus, TaskResponse
from app.models.scoring import ScoreRun, ScoreDetail, AttemptResult
from app.models.scenario import Task, Material
from app.models.rubric import Rubric, Criterion
from app.core.status import ScoreRunStatus

router = APIRouter()

# ── Prompts ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You are an expert English language examiner specialising in CEFR-aligned assessments. "
    "Evaluate the student's response strictly and fairly. Return ONLY valid JSON — no markdown, no extra text."
)

JSON_SCHEMA = """\nReturn JSON:
{{
  "scores": {{"<criterion_name>": {{"score": <number>, "max": <number>, "feedback": "<string>"}}}},
  "overall_feedback": "<2-3 sentence summary>",
  "cefr_level": "<A1|A2|B1|B2|C1|C2>"
}}"""

TASK_PROMPTS = {
    "reading": (
        "Evaluate this Task 1 (Reading & Note-taking) response.\n\n"
        "Reading text:\n{material}\n\nStudent notes:\n{response}\n\nCriteria:\n{criteria}" + JSON_SCHEMA
    ),
    "writing": (
        "Evaluate this Task 2 (Cover Letter Writing) response.\n\n"
        "Job description:\n{material}\n\nStudent cover letter ({word_count} words):\n{response}\n\nCriteria:\n{criteria}" + JSON_SCHEMA
    ),
    "listening": (
        "Evaluate this Task 3 (Listening & Note-taking) response.\n\n"
        "Student notes:\n{response}\n\nCriteria:\n{criteria}" + JSON_SCHEMA
    ),
    "speaking": (
        "Evaluate this Task 4 (Speaking) response.\n\n"
        "Audio transcript:\n{transcript}\n\nCriteria:\n{criteria}" + JSON_SCHEMA
    ),
    "speaking_no_asr": (
        "Evaluate this Task 4 (Speaking) submission.\n\n"
        "Note: {recording_count} recording(s) submitted. Transcription unavailable — assess based on submission completeness.\n\n"
        "Criteria:\n{criteria}" + JSON_SCHEMA
    ),
}

DEFAULT_CRITERIA = {
    "reading": [
        {"name": "Key Information Capture", "max_score": 5.0, "description": "Identifies main points and key details from the text"},
        {"name": "Accuracy", "max_score": 5.0, "description": "Notes accurately reflect the source text"},
        {"name": "Organisation", "max_score": 5.0, "description": "Notes are logically organised and structured"},
        {"name": "Language Use", "max_score": 5.0, "description": "Appropriate vocabulary and grammar"},
    ],
    "writing": [
        {"name": "Task Achievement", "max_score": 10.0, "description": "Addresses job requirements and demonstrates suitability"},
        {"name": "Coherence & Cohesion", "max_score": 10.0, "description": "Logical flow, clear paragraphing, effective linking"},
        {"name": "Lexical Resource", "max_score": 10.0, "description": "Range, accuracy and appropriacy of vocabulary"},
        {"name": "Grammatical Range & Accuracy", "max_score": 10.0, "description": "Variety and accuracy of grammatical structures"},
    ],
    "listening": [
        {"name": "Key Information Capture", "max_score": 5.0, "description": "Captures main ideas and important details"},
        {"name": "Accuracy", "max_score": 5.0, "description": "Notes accurately reflect what was heard"},
        {"name": "Organisation", "max_score": 5.0, "description": "Notes are logically organised"},
        {"name": "Language Use", "max_score": 5.0, "description": "Appropriate vocabulary"},
    ],
    "speaking": [
        {"name": "Fluency & Coherence", "max_score": 10.0, "description": "Speaks fluently with logically organised ideas"},
        {"name": "Lexical Resource", "max_score": 10.0, "description": "Range, accuracy and appropriacy of vocabulary"},
        {"name": "Grammatical Range & Accuracy", "max_score": 10.0, "description": "Variety and accuracy of grammar"},
        {"name": "Pronunciation", "max_score": 10.0, "description": "Clarity and intelligibility of speech"},
    ],
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()

def _word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", _strip_html(text)) if w])

def _criteria_text(criteria: list) -> str:
    lines = []
    for c in criteria:
        meta = " | ".join(filter(None, [c.get('domain'), c.get('competence')]))
        header = f"- {c['name']} (max {c['max_score']})"
        if meta:
            header += f" [{meta}]"
        if c.get('description'):
            header += f": {c['description']}"
        lines.append(header)
        if c.get('cefr_descriptors'):
            try:
                descs = json.loads(c['cefr_descriptors']) if isinstance(c['cefr_descriptors'], str) else c['cefr_descriptors']
                for level in ["A1", "A2", "B1", "B2", "C1", "C2"]:
                    if level in descs:
                        lines.append(f"    {level}: {descs[level]}")
            except Exception:
                pass
    return "\n".join(lines)


def _parse_llm_json(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise HTTPException(502, f"Could not parse LLM response: {raw[:200]}")


async def _call_claude(prompt: str) -> dict:
    """Call Anthropic Claude API."""
    async with httpx.AsyncClient(timeout=90.0) as client:
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
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    if resp.status_code != 200:
        raise HTTPException(502, f"Claude API error {resp.status_code}: {resp.text[:300]}")
    return _parse_llm_json(resp.json()["content"][0]["text"])


async def _call_openai_compatible(prompt: str) -> dict:
    """Call any OpenAI-compatible LLM API (MiniMax, OpenAI, etc.)."""
    base = settings.llm_base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.llm_model,
                "max_tokens": 2048,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            },
        )
    if resp.status_code != 200:
        raise HTTPException(502, f"LLM API error {resp.status_code}: {resp.text[:300]}")
    return _parse_llm_json(resp.json()["choices"][0]["message"]["content"])


async def _call_llm(prompt: str) -> dict:
    """Route to Anthropic or OpenAI-compatible provider based on config."""
    if settings.anthropic_api_key:
        return await _call_claude(prompt)
    if settings.llm_api_key:
        return await _call_openai_compatible(prompt)
    raise HTTPException(503, "No LLM API key configured. Set ANTHROPIC_API_KEY or LLM_API_KEY.")


async def _transcribe(storage_key: str) -> str:
    """Download audio from MinIO and transcribe with Whisper-compatible ASR API."""
    if not settings.asr_api_key:
        return ""
    import boto3
    def do_download():
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        resp = s3.get_object(Bucket=settings.s3_bucket, Key=storage_key)
        return resp["Body"].read()

    try:
        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(None, do_download)
    except Exception as e:
        return f"[Download failed: {e}]"

    ext = storage_key.rsplit(".", 1)[-1] if "." in storage_key else "webm"
    mime = {"mp3": "audio/mpeg", "wav": "audio/wav", "webm": "audio/webm"}.get(ext, "audio/webm")
    asr_url = settings.asr_api_url or "https://api.openai.com/v1/audio/transcriptions"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                asr_url,
                headers={"Authorization": f"Bearer {settings.asr_api_key}"},
                files={"file": (f"audio.{ext}", audio_bytes, mime)},
                data={"model": "whisper-1"},
            )
        if resp.status_code == 200:
            return resp.json().get("text", "")
        return f"[ASR error {resp.status_code}]"
    except Exception as e:
        return f"[ASR failed: {e}]"


def _cefr_from_votes(votes: list[str]) -> str:
    return Counter(votes).most_common(1)[0][0] if votes else "B1"


# ── Score one attempt ──────────────────────────────────────────────────────────

class TaskScoreResult(BaseModel):
    task_id: str
    task_type: str
    task_title: str
    score: float
    max_score: float
    cefr_level: str
    overall_feedback: str
    transcript: str | None = None
    criteria_scores: list[dict]


class ScoringResult(BaseModel):
    attempt_id: str
    status: str
    overall_score: float
    overall_score_max: float
    cefr_level: str
    band_score: float
    task_results: list[TaskScoreResult]


@router.post("/attempt/{attempt_id}", response_model=ScoringResult)
async def score_attempt(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> ScoringResult:
    """Score all tasks in a submitted attempt. Callable by the student who owns it or any teacher."""

    result = await session.execute(
        select(Attempt)
        .options(selectinload(Attempt.task_responses))
        .where(Attempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.SCORED):
        raise HTTPException(400, "Attempt must be submitted before scoring")

    tasks_result = await session.execute(
        select(Task)
        .options(
            selectinload(Task.materials),
            selectinload(Task.rubric).selectinload(Rubric.criteria),
        )
        .where(Task.scenario_id == attempt.scenario_id)
        .order_by(Task.sequence_order)
    )
    tasks = {str(t.id): t for t in tasks_result.scalars().all()}

    task_results: list[TaskScoreResult] = []
    total_score = 0.0
    total_max = 0.0
    cefr_votes: list[str] = []

    for tr in attempt.task_responses:
        task = tasks.get(str(tr.task_id))
        if not task:
            continue

        task_type = task.task_type.value if hasattr(task.task_type, "value") else str(task.task_type)
        content = tr.content or ""

        # Build criteria
        if task.rubric and task.rubric.criteria:
            criteria = [
                {
                    "name": c.name,
                    "max_score": c.max_score,
                    "description": c.description or "",
                    "domain": c.domain,
                    "competence": c.competence,
                    "cefr_descriptors": c.cefr_descriptors,
                    "obj": c,
                }
                for c in sorted(task.rubric.criteria, key=lambda x: x.sequence_order)
            ]
        else:
            criteria = [dict(c, obj=None) for c in DEFAULT_CRITERIA.get(task_type, DEFAULT_CRITERIA["writing"])]

        criteria_text = _criteria_text(criteria)

        # Build material context
        material_text = ""
        for m in (task.materials or []):
            if task_type == "reading" and m.material_type == "advertisement":
                material_text = m.content or ""
            elif task_type == "writing" and m.material_type == "job_description":
                material_text = m.content or ""

        # Build prompt per task type
        transcript: str | None = None

        if task_type == "reading":
            prompt = TASK_PROMPTS["reading"].format(
                material=material_text or task.description or "(no text provided)",
                response=content or "(no notes submitted)",
                criteria=criteria_text,
            )
        elif task_type == "writing":
            clean = _strip_html(content)
            prompt = TASK_PROMPTS["writing"].format(
                material=material_text or task.description or "(no job description)",
                response=clean or "(no response submitted)",
                word_count=_word_count(content),
                criteria=criteria_text,
            )
        elif task_type == "listening":
            notes = content
            try:
                notes = json.loads(content).get("notes", content)
            except Exception:
                pass
            prompt = TASK_PROMPTS["listening"].format(
                response=notes or "(no notes submitted)",
                criteria=criteria_text,
            )
        else:  # speaking
            recording_map: dict = {}
            try:
                recording_map = json.loads(content).get("recordingMap", {})
            except Exception:
                pass

            transcripts: list[str] = []
            for q_id, s_key in recording_map.items():
                t = await _transcribe(s_key)
                if t:
                    transcripts.append(f"[Q{q_id[:4]}]: {t}")

            if transcripts:
                transcript = "\n".join(transcripts)
                prompt = TASK_PROMPTS["speaking"].format(
                    transcript=transcript,
                    criteria=criteria_text,
                )
            else:
                transcript = None
                prompt = TASK_PROMPTS["speaking_no_asr"].format(
                    recording_count=len(recording_map),
                    criteria=criteria_text,
                )

        # Call LLM
        llm = await _call_llm(prompt)
        scores_raw = llm.get("scores", {})
        task_score = 0.0
        task_max = 0.0
        criteria_scores = []

        # Delete old score runs for this task response to avoid duplicates
        old_runs = await session.execute(
            select(ScoreRun).where(ScoreRun.task_response_id == tr.id)
        )
        for old_run in old_runs.scalars().all():
            await session.delete(old_run)
        await session.flush()

        score_run = ScoreRun(
            task_response_id=tr.id,
            status=ScoreRunStatus.COMPLETED,
            run_started_at=datetime.now(timezone.utc),
            run_completed_at=datetime.now(timezone.utc),
            raw_llm_response=json.dumps(llm),
        )
        session.add(score_run)
        await session.flush()

        for crit in criteria:
            crit_name = crit["name"]
            crit_max = crit["max_score"]
            entry = scores_raw.get(crit_name, {})
            score_val = max(0.0, min(float(entry.get("score", 0)), crit_max))
            feedback = entry.get("feedback", "")

            task_score += score_val
            task_max += crit_max

            detail = ScoreDetail(
                score_run_id=score_run.id,
                task_response_id=tr.id,
                criterion_id=crit["obj"].id if crit["obj"] else None,
                criterion_name=crit_name,
                score=score_val,
                max_score=crit_max,
                feedback=feedback,
            )
            session.add(detail)
            criteria_scores.append({
                "name": crit_name,
                "score": score_val,
                "max": crit_max,
                "feedback": feedback,
            })

        total_score += task_score
        total_max += task_max
        cefr_votes.append(llm.get("cefr_level", "B1"))

        task_results.append(TaskScoreResult(
            task_id=str(task.id),
            task_type=task_type,
            task_title=task.title,
            score=task_score,
            max_score=task_max,
            cefr_level=llm.get("cefr_level", "B1"),
            overall_feedback=llm.get("overall_feedback", ""),
            transcript=transcript,
            criteria_scores=criteria_scores,
        ))

    overall_cefr = _cefr_from_votes(cefr_votes)
    band = round((total_score / total_max) * 9, 1) if total_max > 0 else 0.0

    # Upsert AttemptResult
    existing_ar = await session.execute(
        select(AttemptResult).where(AttemptResult.attempt_id == attempt_id)
    )
    ar = existing_ar.scalar_one_or_none()
    if ar:
        ar.cefr_level = overall_cefr
        ar.overall_score = total_score
        ar.overall_score_max = total_max
        ar.band_score = band
        ar.is_finalized = False
    else:
        ar = AttemptResult(
            attempt_id=attempt_id,
            cefr_level=overall_cefr,
            overall_score=total_score,
            overall_score_max=total_max,
            band_score=band,
            is_finalized=False,
        )
        session.add(ar)

    attempt.status = AttemptStatus.SCORED
    await session.commit()

    return ScoringResult(
        attempt_id=str(attempt_id),
        status="scored",
        overall_score=total_score,
        overall_score_max=total_max,
        cefr_level=overall_cefr,
        band_score=band,
        task_results=task_results,
    )


# ── GET result ─────────────────────────────────────────────────────────────────

class CriterionScore(BaseModel):
    detail_id: str
    criterion_name: str
    score: float
    max_score: float
    feedback: str
    teacher_score: float | None
    teacher_feedback: str | None
    is_teacher_reviewed: bool
    effective_score: float  # teacher_score if reviewed, else score


class TaskResult(BaseModel):
    task_id: str
    task_type: str
    task_title: str
    content: str | None
    score: float
    max_score: float
    cefr_level: str
    overall_feedback: str
    transcript: str | None
    criteria: list[CriterionScore]


class AttemptResultDetail(BaseModel):
    attempt_id: str
    status: str
    cefr_level: str
    overall_score: float
    overall_score_max: float
    band_score: float | None
    is_finalized: bool
    teacher_notes: str | None
    task_results: list[TaskResult]


@router.get("/attempt/{attempt_id}/result", response_model=AttemptResultDetail)
async def get_attempt_result(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> AttemptResultDetail:
    """Get full scoring result for an attempt."""

    attempt = (await session.execute(
        select(Attempt).options(selectinload(Attempt.task_responses)).where(Attempt.id == attempt_id)
    )).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.SCORED):
        raise HTTPException(400, "Attempt not yet scored")

    ar = (await session.execute(
        select(AttemptResult).where(AttemptResult.attempt_id == attempt_id)
    )).scalar_one_or_none()
    if not ar:
        raise HTTPException(404, "No scoring result yet — trigger scoring first")

    tasks_result = await session.execute(
        select(Task).where(Task.scenario_id == attempt.scenario_id).order_by(Task.sequence_order)
    )
    tasks = {str(t.id): t for t in tasks_result.scalars().all()}

    task_results: list[TaskResult] = []

    for tr in sorted(attempt.task_responses, key=lambda r: tasks[str(r.task_id)].sequence_order if str(r.task_id) in tasks else 99):
        task = tasks.get(str(tr.task_id))
        if not task:
            continue

        task_type = task.task_type.value if hasattr(task.task_type, "value") else str(task.task_type)

        score_runs = (await session.execute(
            select(ScoreRun)
            .options(selectinload(ScoreRun.score_details))
            .where(ScoreRun.task_response_id == tr.id)
            .order_by(ScoreRun.created_at.desc())
        )).scalars().all()

        if not score_runs:
            continue

        latest_run = score_runs[0]
        raw = {}
        if latest_run.raw_llm_response:
            try:
                raw = json.loads(latest_run.raw_llm_response)
            except Exception:
                pass

        details = sorted(latest_run.score_details, key=lambda d: d.created_at)
        total_score = sum(d.teacher_score if d.is_teacher_reviewed and d.teacher_score is not None else (d.score or 0) for d in details)
        total_max = sum(d.max_score for d in details)
        transcript = raw.get("transcript")  # may not exist

        criteria = [
            CriterionScore(
                detail_id=str(d.id),
                criterion_name=d.criterion_name or (d.criterion.name if d.criterion else "Unknown"),
                score=d.score or 0,
                max_score=d.max_score,
                feedback=d.feedback or "",
                teacher_score=d.teacher_score,
                teacher_feedback=d.teacher_feedback,
                is_teacher_reviewed=d.is_teacher_reviewed,
                effective_score=d.teacher_score if d.is_teacher_reviewed and d.teacher_score is not None else (d.score or 0),
            )
            for d in details
        ]

        task_results.append(TaskResult(
            task_id=str(task.id),
            task_type=task_type,
            task_title=task.title,
            content=tr.content,
            score=total_score,
            max_score=total_max,
            cefr_level=raw.get("cefr_level", "B1"),
            overall_feedback=raw.get("overall_feedback", ""),
            transcript=transcript,
            criteria=criteria,
        ))

    return AttemptResultDetail(
        attempt_id=str(attempt_id),
        status=attempt.status.value,
        cefr_level=ar.cefr_level,
        overall_score=ar.overall_score,
        overall_score_max=ar.overall_score_max,
        band_score=ar.band_score,
        is_finalized=ar.is_finalized,
        teacher_notes=ar.teacher_notes,
        task_results=task_results,
    )
