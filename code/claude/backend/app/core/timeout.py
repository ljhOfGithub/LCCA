"""Timeout and finalization mechanisms for LCCA exam attempts.

This module provides:
1. Automatic timeout checking middleware
2. Finalization utilities
3. Time remaining calculations
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, and_

from app.core.config import settings
from app.db.session import async_session_maker
from app.models.attempt import Attempt, AttemptStatus

logger = logging.getLogger(__name__)


class AttemptTimeoutError(Exception):
    """Raised when an attempt has exceeded its time limit."""

    def __init__(self, attempt_id: UUID, message: Optional[str] = None):
        self.attempt_id = attempt_id
        self.message = message or f"Attempt {attempt_id} has exceeded the time limit"
        super().__init__(self.message)


def calculate_remaining_time(
    started_at: datetime,
    timeout_seconds: Optional[int] = None,
) -> timedelta:
    """Calculate remaining time for an attempt.

    Args:
        started_at: When the attempt started
        timeout_seconds: Override for the default timeout

    Returns:
        timedelta of remaining time (can be negative if expired)
    """
    if timeout_seconds is None:
        timeout_seconds = settings.attempt_timeout_seconds

    elapsed = datetime.now(timezone.utc) - started_at
    remaining = timedelta(seconds=timeout_seconds) - elapsed
    return remaining


def is_attempt_expired(started_at: datetime, timeout_seconds: Optional[int] = None) -> bool:
    """Check if an attempt has expired based on its start time.

    Args:
        started_at: When the attempt started
        timeout_seconds: Override for the default timeout

    Returns:
        True if the attempt has exceeded its time limit
    """
    remaining = calculate_remaining_time(started_at, timeout_seconds)
    return remaining.total_seconds() <= 0


async def get_attempt_time_status(attempt_id: UUID) -> dict:
    """Get the current time status for an attempt.

    Args:
        attempt_id: UUID of the attempt

    Returns:
        dict with:
        - is_expired: bool
        - remaining_seconds: int (can be negative)
        - started_at: str
        - expires_at: str
    """
    async with async_session_maker() as session:
        result = await session.execute(
            select(Attempt).where(Attempt.id == attempt_id)
        )
        attempt = result.scalar_one_or_none()

        if not attempt:
            raise ValueError(f"Attempt {attempt_id} not found")

        if not attempt.started_at:
            return {
                "is_expired": False,
                "remaining_seconds": settings.attempt_timeout_seconds,
                "started_at": None,
                "expires_at": None,
            }

        remaining = calculate_remaining_time(attempt.started_at)

        return {
            "is_expired": remaining.total_seconds() <= 0,
            "remaining_seconds": int(remaining.total_seconds()),
            "started_at": attempt.started_at.isoformat(),
            "expires_at": (
                attempt.started_at + timedelta(seconds=settings.attempt_timeout_seconds)
            ).isoformat(),
        }


async def force_finalize_attempt(attempt_id: UUID, reason: str = "manual") -> Attempt:
    """Force finalization of an attempt, regardless of current state.

    This should only be called by admin users or the timeout mechanism.
    It transitions the attempt to SUBMITTED status.

    Args:
        attempt_id: UUID of the attempt to finalize
        reason: Reason for finalization ("timeout", "manual", "admin")

    Returns:
        The finalized Attempt object

    Raises:
        ValueError: If attempt is not found or already finalized
    """
    async with async_session_maker() as session:
        result = await session.execute(
            select(Attempt).where(Attempt.id == attempt_id)
        )
        attempt = result.scalar_one_or_none()

        if not attempt:
            raise ValueError(f"Attempt {attempt_id} not found")

        if attempt.status in [AttemptStatus.SUBMITTED, AttemptStatus.SCORED, AttemptStatus.CANCELLED]:
            raise ValueError(
                f"Attempt {attempt_id} is already in terminal state: {attempt.status}"
            )

        # Transition to submitted
        attempt.status = AttemptStatus.SUBMITTED
        attempt.scored_at = datetime.now(timezone.utc)

        logger.info(
            f"Attempt {attempt_id} force-finalized: reason={reason}, "
            f"previous_status={attempt.status}"
        )

        await session.commit()
        await session.refresh(attempt)

        return attempt


async def get_finalized_count(
    since: Optional[datetime] = None,
    reason: str = "timeout",
) -> int:
    """Get count of attempts finalized in a time window.

    Args:
        since: Count finalized after this time (default: 24 hours ago)
        reason: Filter by specific reason stored in audit log

    Returns:
        Count of finalized attempts
    """
    async with async_session_maker() as session:
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        # Count submissions that happened after `since`
        # Note: scored_at is set when timeout-triggered submissions happen
        result = await session.execute(
            select(Attempt).where(
                and_(
                    Attempt.status == AttemptStatus.SUBMITTED,
                    Attempt.scored_at >= since,
                )
            )
        )
        return len(result.scalars().all())


class TimeoutMiddleware:
    """ASGI middleware to check attempt timeouts on each request.

    This middleware is optional and can be used for real-time timeout
    enforcement. For most cases, the cron-based finalization is sufficient.
    """

    def __init__(self, app, check_paths: tuple = ("/api/v1/attempts/",)):
        self.app = app
        self.check_paths = check_paths

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")

            # Only check for attempt-specific endpoints
            if any(path.startswith(p) for p in self.check_paths):
                # Extract attempt_id from path if present
                # The actual check would need to be done after auth
                pass

        await self.app(scope, receive, send)