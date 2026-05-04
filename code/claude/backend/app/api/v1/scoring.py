"""Scoring-related API endpoints.

OpenAPI contract:
- POST /api/v1/scoring/trigger - Trigger scoring job
- GET /api/v1/scoring/runs - List score runs
- GET /api/v1/scoring/runs/{run_id} - Get score run details
- POST /api/v1/scoring/manual - Submit manual scores
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.models.scoring import ScoreRun
from app.api.schemas.scoring import (
    ScoreRunResponse,
    ScoreRunListResponse,
    TriggerScoringRequest,
    TriggerScoringResponse,
    ManualScoringRequest,
    ManualScoringResponse,
)
from app.core.security import get_current_user, require_teacher
from app.workers.tasks import WorkerSettings

router = APIRouter()


@router.post("/trigger", response_model=TriggerScoringResponse)
async def trigger_scoring(
    data: TriggerScoringRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> TriggerScoringResponse:
    """Trigger a scoring job for an attempt.

    Can be triggered automatically on submission or manually by teachers.
    Scoring jobs are processed by the ARQ worker asynchronously.
    """
    from app.models.attempt import Attempt, AttemptStatus

    # Verify attempt exists and is in correct state
    result = await session.execute(
        select(Attempt).where(Attempt.id == data.attempt_id)
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.status != AttemptStatus.SUBMITTED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot score attempt in {attempt.status} status"
        )

    # Queue the scoring job
    from arq import run_inline
    from arq.connections import RedisSettings
    from app.core.config import settings

    try:
        # Enqueue the scoring task via Redis
        redis = await RedisSettings.from_dsn(settings.redis_url).connect()
        job = await redis.enqueue_job(
            "score_attempt",
            data.attempt_id,
            _job_id=None,  # Let ARQ generate ID
            _priority=data.priority,
        )
        await redis.aclose()

        return TriggerScoringResponse(
            job_id=job.job_id,
            attempt_id=data.attempt_id,
            status="queued",
            message=f"Scoring job queued for attempt {data.attempt_id}",
            estimated_wait_seconds=60,  # Estimate
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue scoring job: {str(e)}"
        )


@router.get("/runs", response_model=ScoreRunListResponse)
async def list_score_runs(
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
    attempt_id: UUID | None = Query(default=None, description="Filter by attempt"),
    status: str | None = Query(default=None, description="Filter by status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> ScoreRunListResponse:
    """List score runs with optional filtering.

    Teachers and admins can view all score runs.
    """
    from app.core.status import ScoreRunStatus

    query = select(ScoreRun)

    if attempt_id:
        query = query.where(ScoreRun.attempt_id == attempt_id)
    if status:
        try:
            status_enum = ScoreRunStatus(status)
            query = query.where(ScoreRun.status == status_enum)
        except ValueError:
            pass  # Ignore invalid status

    # Count total
    count_result = await session.execute(
        select(ScoreRun.id).where(ScoreRun.id.in_([r.id for r in (await session.execute(query)).scalars().all()]))
        if False else select(ScoreRun.id)  # Simpler count
    )
    # Get all matching IDs first for count
    all_results = await session.execute(query)
    all_ids = [r.id for r in all_results.scalars().all()]
    total = len(all_ids)

    # Paginate
    query = query.order_by(ScoreRun.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await session.execute(query)
    runs = result.scalars().all()

    items = [
        ScoreRunResponse(
            id=r.id,
            attempt_id=r.attempt_id,
            status=r.status.value,
            scoring_type="auto",
            error_message=r.error_message,
            created_at=r.created_at,
            completed_at=r.completed_at,
        )
        for r in runs
    ]

    pages = (total + per_page - 1) // per_page if total > 0 else 0

    return ScoreRunListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/runs/{run_id}", response_model=ScoreRunResponse)
async def get_score_run(
    run_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> ScoreRunResponse:
    """Get details of a specific score run.

    Teachers/admins can view all. Students can view their own.
    """
    from app.core.security import get_user_role, UserRole

    result = await session.execute(
        select(ScoreRun).where(ScoreRun.id == run_id)
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Score run not found")

    # Check authorization for students
    role = get_user_role(current_user)
    if role == UserRole.STUDENT:
        from app.models.attempt import Attempt
        from app.models.user import Student

        attempt_result = await session.execute(
            select(Attempt).where(Attempt.id == run.attempt_id)
        )
        attempt = attempt_result.scalar_one_or_none()

        if attempt:
            student_result = await session.execute(
                select(Student.id).where(Student.user_id == current_user.id)
            )
            student_id = student_result.scalar_one_or_none()

            if not student_id or attempt.student_id != student_id:
                raise HTTPException(status_code=403, detail="Not authorized")

    return ScoreRunResponse(
        id=run.id,
        attempt_id=run.attempt_id,
        status=run.status.value,
        scoring_type="auto",
        error_message=run.error_message,
        created_at=run.created_at,
        completed_at=run.completed_at,
        score_details=[],
    )


@router.post("/manual", response_model=ManualScoringResponse)
async def submit_manual_scores(
    data: ManualScoringRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> ManualScoringResponse:
    """Submit manual/human scores for an attempt.

    Teachers and admins can provide manual scoring for specific tasks.
    """
    from sqlalchemy import select
    from app.models.scoring import ScoreRun, ScoreDetail
    from app.core.status import ScoreRunStatus

    # Get the score run
    result = await session.execute(
        select(ScoreRun).where(ScoreRun.id == data.score_run_id)
    )
    score_run = result.scalar_one_or_none()

    if not score_run:
        raise HTTPException(status_code=404, detail="Score run not found")

    # Create score details for each provided score
    for score_data in data.scores:
        score_detail = ScoreDetail(
            score_run_id=data.score_run_id,
            task_response_id=score_data["task_response_id"],
            criterion=score_data.get("criterion", "overall"),
            score=score_data["score"],
            max_score=score_data.get("max_score", 10.0),
            feedback=score_data.get("feedback"),
        )
        session.add(score_detail)

    # Mark score run as completed
    score_run.status = ScoreRunStatus.COMPLETED
    score_run.completed_at = datetime.now(timezone.utc)

    await session.commit()

    return ManualScoringResponse(
        score_run_id=data.score_run_id,
        status="completed",
        message="Manual scores submitted successfully",
    )


# Import datetime at module level for use in submit_manual_scores
from datetime import datetime, timezone