"""Timeout-related API endpoints.

OpenAPI contract:
- GET /api/v1/attempts/{attempt_id}/time-status - Get time status
- POST /api/v1/attempts/{attempt_id}/finalize - Force finalize
- GET /api/v1/timeout/stats - Get finalization stats
- GET /api/v1/timeout/config - Get timeout config
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.schemas.timeout import (
    TimeStatusResponse,
    FinalizeResponse,
    FinalizeStatsResponse,
    TimeoutConfigResponse,
)
from app.core.timeout import (
    get_attempt_time_status,
    force_finalize_attempt,
)
from app.core.security import get_current_user, require_teacher
from app.core.config import settings

router = APIRouter()


@router.get("/attempts/{attempt_id}/time-status", response_model=TimeStatusResponse)
async def get_time_status(
    attempt_id: UUID,
    current_user: Annotated = Depends(get_current_user),
) -> TimeStatusResponse:
    """Get current time status for an attempt.

    Returns the remaining time and expiration status for the exam.
    Students can only check their own attempts.
    """
    try:
        status = await get_attempt_time_status(attempt_id)
        return TimeStatusResponse(**status)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/attempts/{attempt_id}/finalize", response_model=FinalizeResponse)
async def finalize_attempt(
    attempt_id: UUID,
    reason: str = Query(
        default="manual",
        description="Reason: manual|timeout|admin"
    ),
    current_user: Annotated = Depends(get_current_user),
) -> FinalizeResponse:
    """Force finalization of an attempt.

    Reasons:
    - "manual": Manual submission by student
    - "timeout": Auto-submitted due to timeout (system)
    - "admin": Admin-forced finalization

    Only teachers and admins can use this endpoint.
    """
    try:
        attempt = await force_finalize_attempt(attempt_id, reason)
        return FinalizeResponse(
            id=str(attempt.id),
            status=attempt.status.value,
            message=f"Attempt finalized successfully: {reason}",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/timeout/stats", response_model=FinalizeStatsResponse)
async def get_finalization_stats(
    since_hours: int = Query(default=24, ge=1, le=168),
    current_user: Annotated = Depends(require_teacher()),
) -> FinalizeStatsResponse:
    """Get statistics on timeout-triggered finalizations.

    Returns the count of attempts finalized in the specified time window.
    Only accessible to teachers and admins.
    """
    from app.core.timeout import get_finalized_count
    from datetime import datetime, timedelta, timezone

    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    count = await get_finalized_count(since=since)

    return FinalizeStatsResponse(
        finalized_count=count,
        since_hours=since_hours,
    )


@router.get("/timeout/config", response_model=TimeoutConfigResponse)
async def get_timeout_config() -> TimeoutConfigResponse:
    """Get current timeout configuration.

    Returns the configured timeout values. Publicly accessible.
    """
    return TimeoutConfigResponse(
        attempt_timeout_seconds=settings.attempt_timeout_seconds,
        attempt_timeout_minutes=settings.attempt_timeout_seconds // 60,
        scoring_timeout_seconds=settings.scoring_timeout_seconds,
    )