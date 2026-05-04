"""Results API endpoints."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.models.scoring import AttemptResult, ScoreRun, ScoreDetail
from app.models.attempt import Attempt, TaskResponse
from app.models.rubric import Criterion

router = APIRouter(prefix="/results", tags=["results"])


class CompetenceScoreSchema(BaseModel):
    competence: str
    score: float
    max_score: float
    percentage: float


class DetailedFeedbackSchema(BaseModel):
    task_type: str
    criteria: list[dict]
    overall_feedback: str


class ExamResultSchema(BaseModel):
    attempt_id: UUID
    cefr_level: str
    overall_score: float
    max_score: float
    band_score: float | None
    competence_scores: list[CompetenceScoreSchema]
    detailed_feedback: list[DetailedFeedbackSchema]
    completed_at: datetime


@router.get("/attempts/{attempt_id}")
async def get_attempt_result(
    attempt_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ExamResultSchema:
    """Get exam result for an attempt."""
    # Get attempt result
    result = await db.execute(
        select(AttemptResult)
        .where(AttemptResult.attempt_id == attempt_id)
        .options(
            selectinload(AttemptResult.attempt).selectinload(Attempt.task_responses)
        )
    )
    result = result.scalar_one_or_none()

    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    # Verify ownership
    attempt = result.attempt
    if attempt.student.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get score details
    task_responses = await db.execute(
        select(TaskResponse)
        .where(TaskResponse.attempt_id == attempt_id)
        .options(selectinload(TaskResponse.score_details))
    )
    task_responses = task_responses.scalars().all()

    # Build competence scores
    competence_map = {"reading": [], "writing": [], "listening": [], "speaking": []}
    for tr in task_responses:
        task_type = tr.task.task_type
        for sd in tr.score_details:
            competence_map[task_type].append(sd.score)

    competence_scores = []
    for comp, scores in competence_map.items():
        if scores:
            avg = sum(scores) / len(scores)
            competence_scores.append(CompetenceScoreSchema(
                competence=comp,
                score=avg,
                max_score=5.0,
                percentage=avg / 5.0 * 100
            ))

    return ExamResultSchema(
        attempt_id=attempt_id,
        cefr_level=result.cefr_level,
        overall_score=result.overall_score,
        max_score=result.overall_score_max,
        band_score=result.band_score,
        competence_scores=competence_scores,
        detailed_feedback=[],
        completed_at=result.created_at,
    )


@router.get("/me")
async def list_my_results(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ExamResultSchema]:
    """List current user's exam results."""
    from app.models.user import Student

    # Get student
    student = await db.execute(
        select(Student).where(Student.user_id == current_user.id)
    )
    student = student.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get results
    results = await db.execute(
        select(AttemptResult)
        .join(Attempt)
        .where(Attempt.student_id == student.id)
        .order_by(AttemptResult.created_at.desc())
    )
    results = results.scalars().all()

    return [
        ExamResultSchema(
            attempt_id=r.attempt_id,
            cefr_level=r.cefr_level,
            overall_score=r.overall_score,
            max_score=r.overall_score_max,
            band_score=r.band_score,
            competence_scores=[],
            detailed_feedback=[],
            completed_at=r.created_at,
        )
        for r in results
    ]