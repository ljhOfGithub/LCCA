"""Teacher review endpoints: view student attempts + edit AI scores."""
from typing import Annotated
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import require_teacher
from app.db.session import get_session
from app.models.user import Teacher, User
from app.models.attempt import Attempt, AttemptStatus
from app.models.scenario import Scenario, Task
from app.models.scoring import ScoreRun, ScoreDetail, AttemptResult
from app.core.status import ScoreRunStatus

router = APIRouter()


async def _get_teacher(user: User, session: AsyncSession) -> Teacher:
    r = await session.execute(select(Teacher).where(Teacher.user_id == user.id))
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(403, "Teacher profile not found")
    return t


# ── List attempts for a scenario ───────────────────────────────────────────────

class AttemptSummary(BaseModel):
    id: str
    scenario_id: str
    status: str
    started_at: datetime | None
    submitted_at: datetime | None
    has_result: bool
    is_finalized: bool
    cefr_level: str | None
    overall_score: float | None
    overall_score_max: float | None


@router.get("/scenarios/{scenario_id}/attempts", response_model=list[AttemptSummary])
async def list_scenario_attempts(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """List all attempts for a given scenario (any status)."""
    teacher = await _get_teacher(current_user, session)

    # Verify teacher owns this scenario
    sc_r = await session.execute(select(Scenario).where(Scenario.id == scenario_id))
    sc = sc_r.scalar_one_or_none()
    if not sc or sc.created_by_id != teacher.id:
        raise HTTPException(403, "Not your scenario")

    attempts_r = await session.execute(
        select(Attempt)
        .where(Attempt.scenario_id == scenario_id)
        .order_by(Attempt.created_at.desc())
    )
    attempts = attempts_r.scalars().all()

    results_r = await session.execute(
        select(AttemptResult).where(
            AttemptResult.attempt_id.in_([a.id for a in attempts])
        )
    )
    results_by_attempt = {r.attempt_id: r for r in results_r.scalars().all()}

    return [
        AttemptSummary(
            id=str(a.id),
            scenario_id=str(a.scenario_id),
            status=a.status.value,
            started_at=a.started_at,
            submitted_at=a.submitted_at,
            has_result=a.id in results_by_attempt,
            is_finalized=results_by_attempt[a.id].is_finalized if a.id in results_by_attempt else False,
            cefr_level=results_by_attempt[a.id].cefr_level if a.id in results_by_attempt else None,
            overall_score=results_by_attempt[a.id].overall_score if a.id in results_by_attempt else None,
            overall_score_max=results_by_attempt[a.id].overall_score_max if a.id in results_by_attempt else None,
        )
        for a in attempts
    ]


# ── Full attempt detail (responses + scores) ───────────────────────────────────

class CriterionDetail(BaseModel):
    detail_id: str
    criterion_name: str
    score: float
    max_score: float
    feedback: str
    teacher_score: float | None
    teacher_feedback: str | None
    is_teacher_reviewed: bool


class TaskDetail(BaseModel):
    task_id: str
    task_type: str
    task_title: str
    content: str | None
    score_run_id: str | None
    cefr_level: str
    overall_feedback: str
    transcript: str | None
    criteria: list[CriterionDetail]
    total_score: float
    total_max: float


class AttemptDetail(BaseModel):
    id: str
    status: str
    started_at: datetime | None
    submitted_at: datetime | None
    cefr_level: str | None
    overall_score: float | None
    overall_score_max: float | None
    band_score: float | None
    teacher_notes: str | None
    is_finalized: bool
    tasks: list[TaskDetail]


@router.get("/attempts/{attempt_id}", response_model=AttemptDetail)
async def get_attempt_detail(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Full attempt detail including student responses and AI scores."""
    teacher = await _get_teacher(current_user, session)

    attempt_r = await session.execute(
        select(Attempt).options(selectinload(Attempt.task_responses)).where(Attempt.id == attempt_id)
    )
    attempt = attempt_r.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")

    # Verify teacher owns the scenario
    sc_r = await session.execute(select(Scenario).where(Scenario.id == attempt.scenario_id))
    sc = sc_r.scalar_one_or_none()
    if not sc or sc.created_by_id != teacher.id:
        raise HTTPException(403, "Not your scenario")

    tasks_r = await session.execute(
        select(Task).where(Task.scenario_id == attempt.scenario_id).order_by(Task.sequence_order)
    )
    tasks = {str(t.id): t for t in tasks_r.scalars().all()}

    ar_r = await session.execute(select(AttemptResult).where(AttemptResult.attempt_id == attempt_id))
    ar = ar_r.scalar_one_or_none()

    import json
    task_details: list[TaskDetail] = []

    for tr in sorted(attempt.task_responses, key=lambda r: tasks[str(r.task_id)].sequence_order if str(r.task_id) in tasks else 99):
        task = tasks.get(str(tr.task_id))
        if not task:
            continue

        task_type = task.task_type.value if hasattr(task.task_type, "value") else str(task.task_type)

        runs_r = await session.execute(
            select(ScoreRun)
            .options(selectinload(ScoreRun.score_details))
            .where(ScoreRun.task_response_id == tr.id)
            .order_by(ScoreRun.created_at.desc())
        )
        runs = runs_r.scalars().all()

        if not runs:
            task_details.append(TaskDetail(
                task_id=str(task.id),
                task_type=task_type,
                task_title=task.title,
                content=tr.content,
                score_run_id=None,
                cefr_level="—",
                overall_feedback="Not yet scored",
                transcript=None,
                criteria=[],
                total_score=0,
                total_max=0,
            ))
            continue

        latest = runs[0]
        raw = {}
        try:
            raw = json.loads(latest.raw_llm_response or "{}")
        except Exception:
            pass

        details = sorted(latest.score_details, key=lambda d: d.created_at)
        total_score = sum(
            d.teacher_score if d.is_teacher_reviewed and d.teacher_score is not None else (d.score or 0)
            for d in details
        )
        total_max = sum(d.max_score for d in details)

        task_details.append(TaskDetail(
            task_id=str(task.id),
            task_type=task_type,
            task_title=task.title,
            content=tr.content,
            score_run_id=str(latest.id),
            cefr_level=raw.get("cefr_level", "B1"),
            overall_feedback=raw.get("overall_feedback", ""),
            transcript=raw.get("transcript"),
            criteria=[
                CriterionDetail(
                    detail_id=str(d.id),
                    criterion_name=d.criterion_name or "Unknown",
                    score=d.score or 0,
                    max_score=d.max_score,
                    feedback=d.feedback or "",
                    teacher_score=d.teacher_score,
                    teacher_feedback=d.teacher_feedback,
                    is_teacher_reviewed=d.is_teacher_reviewed,
                )
                for d in details
            ],
            total_score=total_score,
            total_max=total_max,
        ))

    return AttemptDetail(
        id=str(attempt.id),
        status=attempt.status.value,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        cefr_level=ar.cefr_level if ar else None,
        overall_score=ar.overall_score if ar else None,
        overall_score_max=ar.overall_score_max if ar else None,
        band_score=ar.band_score if ar else None,
        teacher_notes=ar.teacher_notes if ar else None,
        is_finalized=ar.is_finalized if ar else False,
        tasks=task_details,
    )


# ── Edit a single criterion score ──────────────────────────────────────────────

class ScoreDetailUpdate(BaseModel):
    teacher_score: float | None = None
    teacher_feedback: str | None = None
    is_teacher_reviewed: bool = True


@router.patch("/score-details/{detail_id}", response_model=CriterionDetail)
async def update_score_detail(
    detail_id: UUID,
    data: ScoreDetailUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Teacher overrides an AI criterion score/feedback."""
    detail_r = await session.execute(
        select(ScoreDetail)
        .options(selectinload(ScoreDetail.score_run))
        .where(ScoreDetail.id == detail_id)
    )
    detail = detail_r.scalar_one_or_none()
    if not detail:
        raise HTTPException(404, "Score detail not found")

    if data.teacher_score is not None:
        detail.teacher_score = max(0.0, min(data.teacher_score, detail.max_score))
    if data.teacher_feedback is not None:
        detail.teacher_feedback = data.teacher_feedback
    detail.is_teacher_reviewed = data.is_teacher_reviewed

    await session.commit()
    return CriterionDetail(
        detail_id=str(detail.id),
        criterion_name=detail.criterion_name or "Unknown",
        score=detail.score or 0,
        max_score=detail.max_score,
        feedback=detail.feedback or "",
        teacher_score=detail.teacher_score,
        teacher_feedback=detail.teacher_feedback,
        is_teacher_reviewed=detail.is_teacher_reviewed,
    )


# ── Finalize attempt result ────────────────────────────────────────────────────

class FinalizeRequest(BaseModel):
    cefr_level: str | None = None
    teacher_notes: str | None = None


@router.post("/attempts/{attempt_id}/finalize")
async def finalize_attempt(
    attempt_id: UUID,
    data: FinalizeRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Teacher finalizes the result (locks it and optionally overrides CEFR level)."""
    teacher = await _get_teacher(current_user, session)

    attempt_r = await session.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = attempt_r.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")

    sc_r = await session.execute(select(Scenario).where(Scenario.id == attempt.scenario_id))
    sc = sc_r.scalar_one_or_none()
    if not sc or sc.created_by_id != teacher.id:
        raise HTTPException(403, "Not your scenario")

    ar_r = await session.execute(select(AttemptResult).where(AttemptResult.attempt_id == attempt_id))
    ar = ar_r.scalar_one_or_none()
    if not ar:
        raise HTTPException(404, "No result to finalize — score first")

    if data.cefr_level:
        ar.cefr_level = data.cefr_level
    if data.teacher_notes is not None:
        ar.teacher_notes = data.teacher_notes
    ar.is_finalized = True

    await session.commit()
    return {"status": "finalized", "cefr_level": ar.cefr_level}
