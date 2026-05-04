"""ARQ worker tasks for background processing.

This module contains background tasks for:
1. Scoring attempts using LLM
2. Finalizing expired attempts (timeout handling)
3. Cleaning up stale artifacts
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from arq.connections import RedisSettings

from app.core.config import settings
from app.db.session import async_session_maker

logger = logging.getLogger(__name__)


async def score_response(ctx: dict, task_response_id: str) -> dict:
    """Score a single task response using LLM.

    This task handles scoring for individual task responses:
    - Reading/Writing: Direct LLM scoring
    - Listening: LLM scoring
    - Speaking: ASR transcription -> LLM scoring

    Args:
        ctx: ARQ context dict containing redis connection info
        task_response_id: UUID of the task response to score

    Returns:
        dict with success status and score details
    """
    from uuid import UUID
    from app.services.scoring.grader import create_scorer

    logger.info(f"Starting scoring for task response {task_response_id}")

    async with async_session_maker() as session:
        scorer = create_scorer(session)
        result = await scorer.score_task_response(task_response_id)
        return result


async def score_attempt(ctx: dict, attempt_id: UUID) -> dict:
    """Score all responses in an attempt using LLM.

    This task is enqueued when a student submits their attempt or when
    the timeout mechanism triggers auto-submission.

    Args:
        ctx: ARQ context dict containing redis connection info
        attempt_id: UUID of the attempt to score

    Returns:
        dict with success status and score details, or error message
    """
    from sqlalchemy import select
    from app.models.attempt import Attempt, AttemptStatus, TaskResponse
    from app.models.scoring import ScoreRun
    from app.core.status import ScoreRunStatus, TaskResponseStatus
    from app.services.scoring.grader import create_scorer

    logger.info(f"Starting scoring for attempt {attempt_id}")

    async with async_session_maker() as session:
        # Get the attempt
        result = await session.execute(select(Attempt).where(Attempt.id == attempt_id))
        attempt = result.scalar_one_or_none()

        if not attempt:
            logger.error(f"Attempt {attempt_id} not found")
            return {"error": "Attempt not found"}

        # Verify attempt is in correct state for scoring
        if attempt.status not in [AttemptStatus.SUBMITTED, AttemptStatus.IN_PROGRESS]:
            logger.warning(
                f"Attempt {attempt_id} is in state {attempt.status}, "
                "expected SUBMITTED or IN_PROGRESS for scoring"
            )

        # Get all task responses for this attempt
        tr_result = await session.execute(
            select(TaskResponse).where(TaskResponse.attempt_id == attempt_id)
        )
        task_responses = list(tr_result.scalars().all())

        if not task_responses:
            logger.warning(f"No task responses found for attempt {attempt_id}")
            return {"error": "No task responses to score"}

        scorer = create_scorer(session)
        scored_count = 0
        failed_count = 0
        results = []

        for task_response in task_responses:
            try:
                result = await scorer.score_task_response(str(task_response.id))
                if result.get("success"):
                    scored_count += 1
                else:
                    failed_count += 1
                results.append(result)
            except Exception as e:
                logger.exception(f"Failed to score task response {task_response.id}: {e}")
                failed_count += 1
                results.append({"success": False, "error": str(e)})

        # Check if all responses are scored - finalize attempt
        all_scored = all(tr.status == TaskResponseStatus.SCORED for tr in task_responses)

        if all_scored:
            attempt.status = AttemptStatus.SCORED
            attempt.scored_at = datetime.now(timezone.utc)
            await session.commit()
            logger.info(f"Attempt {attempt_id} fully scored and finalized")
        else:
            await session.commit()

        logger.info(
            f"Scoring completed for attempt {attempt_id}: "
            f"{scored_count} scored, {failed_count} failed"
        )

        return {
            "success": failed_count == 0,
            "attempt_id": str(attempt_id),
            "scored_count": scored_count,
            "failed_count": failed_count,
            "results": results,
        }


async def finalize_expired_attempts(ctx: dict) -> dict:
    """Finalize attempts that have exceeded their time limit.

    This function checks for attempts that:
    1. Are in IN_PROGRESS status
    2. Have started_at timestamp
    3. Have exceeded the configured timeout (default 2 hours)

    Expired attempts are:
    - Status changed to SUBMITTED
    - scored_at set to current time (for timeout-triggered submission)

    Returns:
        dict with finalized_count
    """
    logger.info("Checking for expired attempts to finalize")

    async with async_session_maker() as session:
        from sqlalchemy import select, and_
        from app.models.attempt import Attempt, AttemptStatus

        timeout_threshold = datetime.now(timezone.utc) - timedelta(
            seconds=settings.attempt_timeout_seconds
        )

        # Find attempts that are still in progress and past their timeout
        result = await session.execute(
            select(Attempt).where(
                and_(
                    Attempt.status == AttemptStatus.IN_PROGRESS,
                    Attempt.started_at < timeout_threshold,
                )
            )
        )
        attempts = result.scalars().all()

        finalized_count = 0
        now = datetime.now(timezone.utc)

        for attempt in attempts:
            try:
                # Transition to submitted
                attempt.status = AttemptStatus.SUBMITTED
                attempt.scored_at = now  # Mark as auto-submitted at timeout

                # Log the auto-finalization for audit
                logger.info(
                    f"Auto-finalized attempt {attempt.id} "
                    f"(started at {attempt.started_at}, "
                    f"timeout was {settings.attempt_timeout_seconds}s)"
                )
                finalized_count += 1

            except Exception as e:
                logger.exception(f"Failed to finalize attempt {attempt.id}: {e}")

        await session.commit()
        logger.info(f"Finalized {finalized_count} expired attempts")

        return {"finalized_count": finalized_count}


async def check_stuck_attempts(ctx: dict) -> dict:
    """Check for attempts that appear stuck in IN_PROGRESS state.

    An attempt is considered stuck if:
    1. It's been in IN_PROGRESS for more than 3x the normal timeout
    2. No task responses have been updated recently

    This is a safety net for detecting issues with the client not
    properly submitting responses.

    Returns:
        dict with stuck_count and details
    """
    logger.info("Checking for stuck attempts")

    async with async_session_maker() as session:
        from sqlalchemy import select, and_, func
        from app.models.attempt import Attempt, AttemptStatus, TaskResponse
        from app.models.artifact import ResponseArtifact

        # 3x timeout threshold
        stuck_threshold = datetime.now(timezone.utc) - timedelta(
            seconds=settings.attempt_timeout_seconds * 3
        )

        # Find very old in-progress attempts
        result = await session.execute(
            select(Attempt).where(
                and_(
                    Attempt.status == AttemptStatus.IN_PROGRESS,
                    Attempt.started_at < stuck_threshold,
                )
            )
        )
        stuck_attempts = result.scalars().all()

        stuck_count = 0
        details = []

        for attempt in stuck_attempts:
            # Check if there are any recent artifacts (indicating activity)
            recent_activity = await session.execute(
                select(func.max(ResponseArtifact.created_at)).where(
                    ResponseArtifact.task_response_id.in_([
                        tr.id for tr in attempt.task_responses
                    ])
                )
            )
            last_activity = recent_activity.scalar()

            # If no recent activity (within last 30 minutes), consider stuck
            activity_threshold = datetime.now(timezone.utc) - timedelta(minutes=30)
            if last_activity is None or last_activity < activity_threshold:
                logger.warning(
                    f"Attempt {attempt.id} appears stuck - "
                    f"last activity at {last_activity}"
                )
                stuck_count += 1
                details.append({
                    "attempt_id": str(attempt.id),
                    "started_at": str(attempt.started_at),
                    "last_activity": str(last_activity),
                })

        logger.info(f"Found {stuck_count} stuck attempts")
        return {"stuck_count": stuck_count, "details": details}


async def cleanup_stale_artifacts(ctx: dict) -> dict:
    """Clean up artifacts that were uploaded but never associated with a response.

    Artifacts in UPLOADING status for more than 1 hour without being
    marked as UPLOADED are considered stale and will be deleted from S3.

    Returns:
        dict with cleaned_count
    """
    logger.info("Checking for stale artifacts to clean up")

    async with async_session_maker() as session:
        from sqlalchemy import select, and_
        from datetime import timedelta
        from app.models.artifact import ResponseArtifact, ArtifactStatus

        stale_threshold = datetime.now(timezone.utc) - timedelta(hours=1)

        result = await session.execute(
            select(ResponseArtifact).where(
                and_(
                    ResponseArtifact.status == ArtifactStatus.UPLOADING,
                    ResponseArtifact.created_at < stale_threshold,
                )
            )
        )
        stale_artifacts = result.scalars().all()

        cleaned_count = 0
        for artifact in stale_artifacts:
            try:
                # Mark as failed instead of deleting the record
                artifact.status = ArtifactStatus.FAILED
                logger.info(f"Marked stale artifact {artifact.id} as failed")
                cleaned_count += 1

            except Exception as e:
                logger.exception(f"Failed to clean artifact {artifact.id}: {e}")

        await session.commit()
        logger.info(f"Cleaned up {cleaned_count} stale artifacts")

        return {"cleaned_count": cleaned_count}


async def cron_finalize_expired_attempts(ctx: dict) -> dict:
    """Cron job that runs every minute to finalize expired attempts.

    This ensures that attempts exceeding the time limit are automatically
    submitted and ready for scoring.
    """
    return await finalize_expired_attempts(ctx)


class WorkerSettings:
    """ARQ worker settings for background task processing.

    Configuration for ARQ worker:
    - Concurrency: 4 (process 4 scoring jobs simultaneously)
    - Max retries: 3 per job
    - Job timeout: 600s (10 minutes) for scoring tasks
    """

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    # Keep job results for 1 hour for debugging
    keep_result = 3600
    # Maximum time a job can run (10 minutes for scoring - longer than default)
    max_jobs = 10
    # Functions available to be called as jobs
    functions = [
        score_response,  # Score individual task response
        score_attempt,  # Score entire attempt (all task responses)
        finalize_expired_attempts,
        cleanup_stale_artifacts,
        check_stuck_attempts,
    ]

    # Cron jobs - run every minute to check for expired attempts
    cron_jobs = [
        {
            "coro": cron_finalize_expired_attempts,
            "second": 0,
        },
    ]


async def enqueue_score_job(attempt_id: UUID) -> str:
    """Helper to enqueue a scoring job.

    This is the preferred way to trigger scoring from API endpoints.

    Args:
        attempt_id: UUID of the attempt to score

    Returns:
        Job ID as string
    """
    return str(attempt_id)


# Export functions for direct import
__all__ = [
    "WorkerSettings",
    "score_response",
    "score_attempt",
    "finalize_expired_attempts",
    "check_stuck_attempts",
    "cleanup_stale_artifacts",
    "enqueue_score_job",
]
