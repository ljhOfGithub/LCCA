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
from app.models.scenario import Scenario, Task, Material
from app.models.rubric import Rubric, Criterion, PromptTemplate
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


async def _call_claude(prompt: str, system: str = SYSTEM_PROMPT) -> tuple[dict, str, dict | None]:
    """Call Anthropic Claude API. Returns (parsed, model, usage)."""
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
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    if resp.status_code != 200:
        raise HTTPException(502, f"Claude API error {resp.status_code}: {resp.text[:300]}")
    body = resp.json()
    usage = body.get("usage")
    if usage:
        usage = {"prompt_tokens": usage.get("input_tokens"), "completion_tokens": usage.get("output_tokens"), "total_tokens": (usage.get("input_tokens", 0) + usage.get("output_tokens", 0))}
    return _parse_llm_json(body["content"][0]["text"]), settings.anthropic_model, usage


async def _call_llm(
    prompt: str,
    system: str = SYSTEM_PROMPT,
    base_url: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> tuple[dict, str | None, dict | None]:
    """Route to the appropriate LLM provider. Returns (parsed, model_name, usage)."""
    effective_api_key = api_key or settings.llm_api_key or settings.anthropic_api_key
    effective_base_url = base_url or settings.llm_base_url
    effective_model = model or settings.llm_model

    if not base_url and settings.anthropic_api_key and not api_key:
        return await _call_claude(prompt, system=system)

    if effective_api_key and effective_base_url:
        url_base = effective_base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{url_base}/chat/completions",
                headers={"Authorization": f"Bearer {effective_api_key}", "Content-Type": "application/json"},
                json={
                    "model": effective_model,
                    "max_tokens": 2048,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
        if resp.status_code != 200:
            raise HTTPException(502, f"LLM API error {resp.status_code}: {resp.text[:300]}")
        body = resp.json()
        raw_usage = body.get("usage", {})
        usage = {
            "prompt_tokens": raw_usage.get("prompt_tokens"),
            "completion_tokens": raw_usage.get("completion_tokens"),
            "total_tokens": raw_usage.get("total_tokens"),
        } if raw_usage else None
        return _parse_llm_json(body["choices"][0]["message"]["content"]), effective_model, usage

    raise HTTPException(503, "No LLM API key configured. Set LLM_API_KEY and LLM_BASE_URL (e.g. MiniMax) or ANTHROPIC_API_KEY.")


async def _get_task_template(session: AsyncSession, task: Task) -> PromptTemplate | None:
    """Return the prompt template explicitly assigned to this task, or None."""
    task_id_str = str(task.id)
    result = await session.execute(
        select(PromptTemplate).where(PromptTemplate.is_active == True)
    )
    for t in result.scalars().all():
        ids = t.task_ids if isinstance(t.task_ids, list) else []
        if task_id_str in ids:
            return t
    return None


def _render_template(template_str: str, vars: dict) -> str:
    import re
    def _replace(m: re.Match) -> str:
        key = m.group(1)
        return str(vars[key]) if key in vars else m.group(0)
    return re.sub(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', _replace, template_str)


def _normalize_scores(llm: dict) -> dict:
    """Normalise both score formats to dict-of-dicts for uniform processing.

    Template format: {"scores": [{"criterion": "...", "score": X, "max_score": Y, "feedback": "..."}]}
    Legacy format:   {"scores": {"criterion_name": {"score": X, "max": Y, "feedback": "..."}}}
    """
    scores = llm.get("scores", {})
    if isinstance(scores, list):
        normalised = {}
        for entry in scores:
            name = entry.get("criterion", "")
            if name:
                normalised[name] = {
                    "score": entry.get("score", 0),
                    "max": entry.get("max_score", entry.get("max", 0)),
                    "feedback": entry.get("feedback", ""),
                }
        return {**llm, "scores": normalised}
    return llm


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
    mime = {"mp3": "audio/mpeg", "wav": "audio/wav", "webm": "audio/webm", "ogg": "audio/ogg", "m4a": "audio/mp4"}.get(ext, "audio/webm")
    asr_url = settings.asr_api_url or "https://api.openai.com/v1/audio/transcriptions"
    asr_model = settings.asr_model or "whisper-1"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                asr_url,
                headers={"Authorization": f"Bearer {settings.asr_api_key}"},
                files={"file": (f"audio.{ext}", audio_bytes, mime)},
                data={"model": asr_model, "response_format": "json", "language": "en"},
            )
        if resp.status_code == 200:
            body = resp.json()
            # Handle both {"text": "..."} and {"results": [{"transcript": "..."}]}
            return body.get("text") or body.get("transcript") or ""
        import logging
        logging.getLogger(__name__).warning(f"ASR {resp.status_code}: {resp.text[:200]}")
        return ""
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"ASR failed: {e}")
        return ""


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
            default_prompt = TASK_PROMPTS["reading"].format(
                material=material_text or task.description or "(no text provided)",
                response=content or "(no notes submitted)",
                criteria=criteria_text,
            )
            submission_for_vars = content or ""
        elif task_type == "writing":
            clean = _strip_html(content)
            default_prompt = TASK_PROMPTS["writing"].format(
                material=material_text or task.description or "(no job description)",
                response=clean or "(no response submitted)",
                word_count=_word_count(content),
                criteria=criteria_text,
            )
            submission_for_vars = clean
        elif task_type == "listening":
            notes = content
            try:
                notes = json.loads(content).get("notes", content)
            except Exception:
                pass

            # Retrieve the audio transcript stored at upload time
            audio_material = next(
                (m for m in (task.materials or []) if m.material_type == "audio"), None
            )
            audio_transcript = ""
            if audio_material:
                if audio_material.metadata_json:
                    try:
                        audio_transcript = json.loads(audio_material.metadata_json).get("transcript", "")
                    except Exception:
                        pass
                # Fallback: live-transcribe if no stored transcript (e.g. uploaded before this feature)
                if not audio_transcript and audio_material.storage_key:
                    audio_transcript = await _transcribe(audio_material.storage_key)

            default_prompt = TASK_PROMPTS["listening"].format(
                response=notes or "(no notes submitted)",
                criteria=criteria_text,
            )
            submission_for_vars = notes or ""
        else:  # speaking
            recording_map: dict = {}
            try:
                parsed_content = json.loads(content)
                recording_map = parsed_content.get("recordingMap", {})
                if not recording_map:
                    audio_keys = parsed_content.get("audioKeys", [])
                    for i, key in enumerate(audio_keys):
                        if key:
                            recording_map[f"q{i+1}"] = key
            except Exception:
                pass

            transcripts: list[str] = []
            for q_id, s_key in recording_map.items():
                t = await _transcribe(s_key)
                # Discard error strings from ASR (they start with '[')
                if t and not t.startswith('['):
                    transcripts.append(f"[Q{q_id}]: {t}")

            if transcripts:
                transcript = "\n".join(transcripts)
                default_prompt = TASK_PROMPTS["speaking"].format(
                    transcript=transcript,
                    criteria=criteria_text,
                )
            else:
                transcript = None
                default_prompt = TASK_PROMPTS["speaking_no_asr"].format(
                    recording_count=len(recording_map),
                    criteria=criteria_text,
                )
            submission_for_vars = transcript or ""

        # Blank submission: skip LLM entirely and assign minimum score (1) per criterion
        is_blank = (
            (task_type != "speaking" and not submission_for_vars.strip()) or
            (task_type == "speaking" and not recording_map)
        )
        if is_blank:
            task_score = 0.0
            task_max = 0.0
            criteria_scores = []
            old_runs = await session.execute(select(ScoreRun).where(ScoreRun.task_response_id == tr.id))
            for old_run in old_runs.scalars().all():
                await session.delete(old_run)
            await session.flush()
            run_time = datetime.now(timezone.utc)
            score_run = ScoreRun(
                task_response_id=tr.id,
                status=ScoreRunStatus.COMPLETED,
                run_started_at=run_time,
                run_completed_at=run_time,
                raw_llm_response=json.dumps({"overall_feedback": "No response submitted.", "cefr_level": "A1"}),
                prompt_template_name="[blank-submission]",
            )
            session.add(score_run)
            await session.flush()
            for crit in criteria:
                crit_name = crit["name"]
                crit_max = crit["max_score"]
                task_score += 1.0
                task_max += crit_max
                session.add(ScoreDetail(
                    score_run_id=score_run.id,
                    task_response_id=tr.id,
                    criterion_id=crit["obj"].id if crit["obj"] else None,
                    criterion_name=crit_name,
                    score=1.0,
                    max_score=crit_max,
                    feedback="No response provided.",
                ))
                criteria_scores.append({"name": crit_name, "score": 1.0, "max": crit_max, "feedback": "No response provided."})
            total_score += task_score
            total_max += task_max
            cefr_votes.append("A1")
            task_results.append(TaskScoreResult(
                task_id=str(task.id),
                task_type=task_type,
                task_title=task.title,
                score=task_score,
                max_score=task_max,
                cefr_level="A1",
                overall_feedback="No response submitted.",
                transcript=None,
                criteria_scores=criteria_scores,
            ))
            continue

        # Look up prompt template assigned to this task
        pt = await _get_task_template(session, task)
        if pt:
            materials_by_type = {m.material_type: m.content for m in (task.materials or []) if m.content}
            all_materials = "\n\n".join(
                f"[{k.upper()}]\n{v}" for k, v in materials_by_type.items()
            )
            crit_lines = "\n".join(
                f"- {c['name']} (max {c['max_score']}): {c.get('description', '')}"
                for c in criteria
            )
            # Build criteria_with_bands (same structure as grader.py _build_template_vars)
            crit_band_parts = []
            for c in criteria:
                part = f"Criterion: {c['name']} (max {c['max_score']})\n  Description: {c.get('description', '')}"
                cefr_descs = c.get('cefr_descriptors')
                if cefr_descs:
                    try:
                        bands = json.loads(cefr_descs) if isinstance(cefr_descs, str) else cefr_descs
                        band_text = "\n".join(f"  {level}: {desc}" for level, desc in bands.items())
                        part += f"\n  CEFR bands:\n{band_text}"
                    except Exception:
                        pass
                crit_band_parts.append(part)
            criteria_with_bands = "\n\n".join(crit_band_parts)

            total_max_score = sum(c["max_score"] for c in criteria)
            max_score_single = max((c["max_score"] for c in criteria), default=10)
            template_vars = {
                "task_title": task.title,
                "task_type": task_type,
                "task_description": task.description or "",
                "materials": all_materials,
                **{f"material_{k}": v for k, v in materials_by_type.items()},
                "material_audio_transcript": audio_transcript if task_type == "listening" else "",
                "criteria": crit_lines,
                "criteria_with_bands": criteria_with_bands,
                "submission": submission_for_vars,
                "transcription": transcript or "",
                "max_score": max_score_single,
                "total_max_score": total_max_score,
                "json_format": (
                    '{"scores": [{"criterion": "<name>", "score": <number>,'
                    ' "max_score": <number>, "feedback": "<text>"}],'
                    ' "overall_feedback": "<summary>", "cefr_level": "<A2|B1|B2|C1>"}'
                ),
            }
            rendered_system = _render_template(pt.system_prompt, template_vars)
            rendered_user = _render_template(pt.user_prompt_template, template_vars)
            prompt_template_name = pt.name
            llm_model_override = pt.model
        else:
            rendered_system = SYSTEM_PROMPT
            rendered_user = default_prompt
            prompt_template_name = None
            llm_model_override = None

        # Call LLM — record start/end times around the actual call
        run_started_at = datetime.now(timezone.utc)
        llm_raw, llm_model_used, llm_usage = await _call_llm(
            rendered_user, system=rendered_system, model=llm_model_override
        )
        run_completed_at = datetime.now(timezone.utc)
        llm = _normalize_scores(llm_raw)
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
            run_started_at=run_started_at,
            run_completed_at=run_completed_at,
            raw_llm_response=json.dumps(llm_raw),
            prompt_template_name=prompt_template_name,
            rendered_system_prompt=rendered_system,
            rendered_user_prompt=rendered_user,
            llm_model=llm_model_used,
            llm_token_usage=json.dumps(llm_usage) if llm_usage else None,
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
    cefr_descriptors: dict | None = None


class MaterialResult(BaseModel):
    material_type: str
    content: str | None
    storage_key: str | None


class TaskResult(BaseModel):
    task_id: str
    task_type: str
    task_title: str
    task_description: str | None
    sequence_order: int
    weight: float
    content: str | None
    score: float
    max_score: float
    cefr_level: str
    overall_feedback: str
    transcript: str | None
    criteria: list[CriterionScore]
    materials: list[MaterialResult] = []


class AttemptResultDetail(BaseModel):
    attempt_id: str
    scenario_id: str
    scenario_title: str
    status: str
    started_at: str | None
    submitted_at: str | None
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
        scenario = (await session.execute(
            select(Scenario).where(Scenario.id == attempt.scenario_id)
        )).scalar_one_or_none()
        return AttemptResultDetail(
            attempt_id=str(attempt_id),
            scenario_id=str(attempt.scenario_id),
            scenario_title=scenario.title if scenario else "—",
            status="pending",
            started_at=attempt.started_at.isoformat() if attempt.started_at else None,
            submitted_at=attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            cefr_level="—",
            overall_score=0.0,
            overall_score_max=0.0,
            band_score=None,
            is_finalized=False,
            teacher_notes=None,
            task_results=[],
        )

    scenario = (await session.execute(
        select(Scenario).where(Scenario.id == attempt.scenario_id)
    )).scalar_one_or_none()
    scenario_title = scenario.title if scenario else "Unknown Scenario"

    tasks_result = await session.execute(
        select(Task)
        .options(selectinload(Task.materials))
        .where(Task.scenario_id == attempt.scenario_id)
        .order_by(Task.sequence_order)
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
            .options(selectinload(ScoreRun.score_details).selectinload(ScoreDetail.criterion))
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

        def _cefr_dict(d: ScoreDetail) -> dict | None:
            if d.criterion and d.criterion.cefr_descriptors:
                try:
                    import json as _json
                    return _json.loads(d.criterion.cefr_descriptors)
                except Exception:
                    pass
            return None

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
                cefr_descriptors=_cefr_dict(d),
            )
            for d in details
        ]

        task_materials = [
            MaterialResult(
                material_type=m.material_type,
                content=m.content,
                storage_key=m.storage_key,
            )
            for m in (task.materials or [])
        ]

        task_results.append(TaskResult(
            task_id=str(task.id),
            task_type=task_type,
            task_title=task.title,
            task_description=task.description,
            sequence_order=task.sequence_order,
            weight=task.weight,
            content=tr.content,
            score=total_score,
            max_score=total_max,
            cefr_level=raw.get("cefr_level", "B1"),
            overall_feedback=raw.get("overall_feedback", ""),
            transcript=transcript,
            criteria=criteria,
            materials=task_materials,
        ))

    return AttemptResultDetail(
        attempt_id=str(attempt_id),
        scenario_id=str(attempt.scenario_id),
        scenario_title=scenario_title,
        status=attempt.status.value,
        started_at=attempt.started_at.isoformat() if attempt.started_at else None,
        submitted_at=attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        cefr_level=ar.cefr_level,
        overall_score=ar.overall_score,
        overall_score_max=ar.overall_score_max,
        band_score=ar.band_score,
        is_finalized=ar.is_finalized,
        teacher_notes=ar.teacher_notes,
        task_results=task_results,
    )


# ── Audio presigned URL (student + teacher) ────────────────────────────────────

@router.get("/audio-url")
async def get_audio_url(
    key: str,
    current_user=Depends(get_current_user),
):
    """Return a 1-hour presigned URL for a MinIO audio key. Accessible to any authenticated user."""
    import asyncio, os, boto3
    from app.core.config import settings

    def _gen() -> str:
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=3600,
        )
        public = os.environ.get("S3_PUBLIC_ENDPOINT", settings.s3_endpoint).replace("minio:9000", "localhost:9000")
        return url.replace(settings.s3_endpoint, public)

    loop = asyncio.get_event_loop()
    url = await loop.run_in_executor(None, _gen)
    return {"url": url}
