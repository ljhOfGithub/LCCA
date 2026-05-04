"""Human rater endpoints for manual scoring."""
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_teacher
from app.core.status import TaskResponseStatus
from app.db.session import get_session
from app.models.artifact import ResponseArtifact
from app.models.attempt import Attempt, TaskResponse
from app.models.rubric import Criterion, Rubric
from app.models.scenario import Scenario, Task
from app.models.scoring import ScoreDetail, ScoreRun, ScoreRunStatus
from app.models.user import Teacher, User

router = APIRouter()


# Pydantic schemas

class HumanScoreSubmission(BaseModel):
    criterion_id: UUID
    score: float = Field(..., ge=0)
    feedback: str | None = None


class ScoreSubmissionRequest(BaseModel):
    scores: List[HumanScoreSubmission]
    final_notes: str | None = None


class CriterionScoreDetail(BaseModel):
    criterion_id: str
    criterion_name: str
    max_score: float
    score: float
    feedback: str | None


class TaskDetailResponse(BaseModel):
    task_id: str
    task_title: str
    task_type: str
    description: str | None
    rubric: dict | None
    artifact_url: str | None


class PendingTaskResponse(BaseModel):
    task_response_id: str
    attempt_id: str
    student_id: str
    scenario_title: str
    task_title: str
    task_type: str
    submitted_at: str
    rubric_id: str | None


async def get_teacher_profile(user: User, session: AsyncSession) -> Teacher:
    """Get teacher's profile, raising 403 if not found."""
    result = await session.execute(
        select(Teacher).where(Teacher.user_id == user.id)
    )
    teacher = result.scalar_one_or_none()

    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a teacher",
        )

    return teacher


@router.get("/human/pending", response_model=List[PendingTaskResponse])
async def list_pending_tasks(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """
    List all task responses that need human scoring.
    Returns only tasks that belong to scenarios created by this teacher.
    """
    teacher = await get_teacher_profile(current_user, session)

    # Find task responses that are submitted but not yet scored, or need human review
    result = await session.execute(
        select(TaskResponse)
        .options(
            selectinload(TaskResponse.attempt).selectinload(Attempt.student),
            selectinload(TaskResponse.task).selectinload(Task.scenario),
            selectinload(TaskResponse.task).selectinload(Task.rubric),
        )
        .where(
            TaskResponse.status == TaskResponseStatus.SUBMITTED
        )
        .where(
            TaskResponse.task.has(
                scenario=Scenario.created_by_id == teacher.id
            )
        )
        .order_by(TaskResponse.submitted_at.asc())
    )
    task_responses = result.scalars().all()

    pending_list = []
    for tr in task_responses:
        # Check if already has a completed score run
        score_run_result = await session.execute(
            select(ScoreRun)
            .where(
                and_(
                    ScoreRun.task_response_id == tr.id,
                    ScoreRun.status == ScoreRunStatus.COMPLETED,
                )
            )
        )
        if score_run_result.scalar_one_or_none():
            continue  # Already scored

        pending_list.append(
            PendingTaskResponse(
                task_response_id=str(tr.id),
                attempt_id=str(tr.attempt_id),
                student_id=str(tr.attempt.student_id),
                scenario_title=tr.task.scenario.title,
                task_title=tr.task.title,
                task_type=tr.task.task_type.value,
                submitted_at=tr.submitted_at.isoformat() if tr.submitted_at else "",
                rubric_id=str(tr.task.rubric.id) if tr.task.rubric else None,
            )
        )

    return pending_list


@router.get("/human/task/{task_response_id}")
async def get_task_response_detail(
    task_response_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Get detailed information for a specific task response requiring human scoring."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(TaskResponse)
        .options(
            selectinload(TaskResponse.attempt).selectinload(Attempt.student),
            selectinload(TaskResponse.task).selectinload(Task.scenario),
            selectinload(TaskResponse.task).selectinload(Task.rubric).selectinload(Rubric.criteria),
            selectinload(TaskResponse.artifacts),
        )
        .where(TaskResponse.id == task_response_id)
    )
    task_response = result.scalar_one_or_none()

    if not task_response:
        raise HTTPException(status_code=404, detail="Task response not found")

    # Check ownership
    if task_response.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to score this task",
        )

    # Get primary artifact (transcript/audio/video)
    artifact_url = None
    for artifact in task_response.artifacts:
        if artifact.status.value == "uploaded":
            artifact_url = artifact.storage_key  # Could be S3 URL
            break

    # Build rubric info
    rubric_info = None
    if task_response.task.rubric:
        rubric_info = {
            "id": str(task_response.task.rubric.id),
            "name": task_response.task.rubric.name,
            "criteria": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "description": c.description,
                    "max_score": c.max_score,
                    "weight": c.weight,
                }
                for c in sorted(task_response.task.rubric.criteria, key=lambda x: x.sequence_order)
            ],
        }

    return {
        "task_response_id": str(task_response.id),
        "attempt_id": str(task_response.attempt_id),
        "student_id": str(task_response.attempt.student_id),
        "student_number": task_response.attempt.student.student_number,
        "scenario_title": task_response.task.scenario.title,
        "task": TaskDetailResponse(
            task_id=str(task_response.task.id),
            task_title=task_response.task.title,
            task_type=task_response.task.task_type.value,
            description=task_response.task.description,
            rubric=rubric_info,
            artifact_url=artifact_url,
        ),
        "status": task_response.status.value,
        "submitted_at": task_response.submitted_at.isoformat() if task_response.submitted_at else None,
    }


@router.post("/human/task/{task_response_id}/score", status_code=status.HTTP_201_CREATED)
async def submit_human_score(
    task_response_id: UUID,
    score_data: ScoreSubmissionRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Submit human scores for a task response."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(TaskResponse)
        .options(
            selectinload(TaskResponse.task).selectinload(Task.rubric).selectinload(Rubric.criteria),
        )
        .where(TaskResponse.id == task_response_id)
    )
    task_response = result.scalar_one_or_none()

    if not task_response:
        raise HTTPException(status_code=404, detail="Task response not found")

    # Check ownership
    if task_response.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to score this task",
        )

    # Verify task response is in correct state
    if task_response.status != TaskResponseStatus.SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task response is in '{task_response.status.value}' state, cannot score",
        )

    # Verify rubric exists
    if not task_response.task.rubric:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No rubric defined for this task",
        )

    # Validate all criterion IDs
    valid_criterion_ids = {c.id for c in task_response.task.rubric.criteria}
    submitted_criterion_ids = {s.criterion_id for s in score_data.scores}

    missing_criteria = valid_criterion_ids - submitted_criterion_ids
    if missing_criteria:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing scores for criteria: {missing_criteria}",
        )

    invalid_criteria = submitted_criterion_ids - valid_criterion_ids
    if invalid_criteria:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid criterion IDs: {invalid_criteria}",
        )

    # Create score run
    score_run = ScoreRun(
        task_response_id=task_response_id,
        status=ScoreRunStatus.COMPLETED,
        run_started_at=datetime.now(timezone.utc),
        run_completed_at=datetime.now(timezone.utc),
    )
    session.add(score_run)
    await session.flush()

    # Create score details
    score_details = []
    for score_submission in score_data.scores:
        criterion = next(c for c in task_response.task.rubric.criteria if c.id == score_submission.criterion_id)

        # Validate score against max
        if score_submission.score > criterion.max_score:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Score {score_submission.score} exceeds max score {criterion.max_score} for criterion '{criterion.name}'",
            )

        score_detail = ScoreDetail(
            score_run_id=score_run.id,
            task_response_id=task_response_id,
            criterion_id=score_submission.criterion_id,
            score=score_submission.score,
            max_score=criterion.max_score,
            feedback=score_submission.feedback,
        )
        session.add(score_detail)
        score_details.append(score_detail)

    # Update task response status
    task_response.status = TaskResponseStatus.SCORED
    task_response.scored_at = datetime.now(timezone.utc)

    await session.commit()

    return {
        "message": "Scores submitted successfully",
        "score_run_id": str(score_run.id),
        "scores": [
            CriterionScoreDetail(
                criterion_id=str(sd.criterion_id),
                criterion_name=next(c.name for c in task_response.task.rubric.criteria if c.id == sd.criterion_id),
                max_score=sd.max_score,
                score=sd.score,
                feedback=sd.feedback,
            )
            for sd in score_details
        ],
        "final_notes": score_data.final_notes,
    }


@router.get("/human/scored", response_model=List[dict])
async def list_scored_tasks(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """List task responses scored by the current teacher."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(ScoreRun)
        .options(
            selectinload(ScoreRun.score_details),
            selectinload(ScoreRun.task_response).selectinload(TaskResponse.task).selectinload(Task.scenario),
            selectinload(ScoreRun.task_response).selectinload(TaskResponse.attempt).selectinload(Attempt.student),
        )
        .join(TaskResponse)
        .where(TaskResponse.task.has(scenario=Scenario.created_by_id == teacher.id))
        .where(ScoreRun.status == ScoreRunStatus.COMPLETED)
        .order_by(ScoreRun.created_at.desc())
        .limit(limit)
    )
    score_runs = result.scalars().all()

    return [
        {
            "score_run_id": str(sr.id),
            "task_response_id": str(sr.task_response_id),
            "student_id": str(sr.task_response.attempt.student_id),
            "scenario_title": sr.task_response.task.scenario.title,
            "task_title": sr.task_response.task.title,
            "scored_at": sr.run_completed_at.isoformat() if sr.run_completed_at else None,
            "scores": [
                {
                    "criterion_id": str(sd.criterion_id),
                    "score": sd.score,
                    "max_score": sd.max_score,
                    "feedback": sd.feedback,
                }
                for sd in sr.score_details
            ],
        }
        for sr in score_runs
    ]


# Import Task for type hinting in loadin
from app.models.scenario import Scenario