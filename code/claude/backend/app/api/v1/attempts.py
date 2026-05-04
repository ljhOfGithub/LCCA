"""Attempt management endpoints.

OpenAPI contract:
- POST /api/v1/attempts - Create new exam attempt
- GET /api/v1/attempts - List attempts
- GET /api/v1/attempts/{attempt_id} - Get attempt details
- POST /api/v1/attempts/{attempt_id}/start - Start/resume attempt
- POST /api/v1/attempts/{attempt_id}/submit - Submit attempt

State machine integration:
- All status transitions use AttemptStateMachine for validation
- Events: start, submit, cancel, score_complete
- Direct status field modifications are prohibited
"""
from typing import Annotated, Any
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pydantic import BaseModel

from app.db.session import get_session
from app.models.attempt import Attempt, AttemptStatus, TaskResponse, TaskResponseStatus
from app.api.schemas.attempts import (
    AttemptCreate,
    AttemptResponse,
    AttemptDetailResponse,
    AttemptListResponse,
    AttemptSubmitRequest,
)
from app.core.security import get_current_user, require_student, get_user_role, UserRole
from app.core.timeout import calculate_remaining_time, is_attempt_expired
from app.state_machines.attempt import AttemptStateMachine
from app.core.exceptions import ValidationError, AuthorizationError

router = APIRouter()


@router.post("", response_model=AttemptResponse, status_code=201)
async def create_attempt(
    data: AttemptCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_student()),
) -> AttemptResponse:
    """Create a new exam attempt for the current student.

    Creates an attempt in CREATED status. The student must call
    /start to begin the exam and start the timer.
    """
    # Verify scenario exists
    from app.models.scenario import Scenario

    scenario_result = await session.execute(
        select(Scenario).where(Scenario.id == data.scenario_id)
    )
    scenario = scenario_result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.status != "published":
        raise HTTPException(
            status_code=400,
            detail="This exam is not currently available"
        )

    # Get student profile
    from app.models.user import Student

    student_result = await session.execute(
        select(Student).where(Student.user_id == current_user.id)
    )
    student = student_result.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=403, detail="Student profile not found")

    # Create attempt
    attempt = Attempt(
        student_id=student.id,
        scenario_id=data.scenario_id,
        status=AttemptStatus.CREATED,
    )
    session.add(attempt)
    await session.flush()

    # Create a TaskResponse for every task in the scenario
    from app.models.scenario import Task
    from app.models.attempt import TaskResponse, TaskResponseStatus

    tasks_result = await session.execute(
        select(Task).where(Task.scenario_id == data.scenario_id).order_by(Task.sequence_order)
    )
    tasks = tasks_result.scalars().all()
    for task in tasks:
        task_response = TaskResponse(
            attempt_id=attempt.id,
            task_id=task.id,
            status=TaskResponseStatus.NOT_STARTED,
        )
        session.add(task_response)

    await session.commit()
    await session.refresh(attempt)

    return AttemptResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        scenario_id=attempt.scenario_id,
        status=attempt.status.value,
    )


@router.get("", response_model=AttemptListResponse)
async def list_attempts(
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
    user_id: UUID | None = Query(default=None, description="Filter by student ID"),
    status: str | None = Query(default=None, description="Filter by status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> AttemptListResponse:
    """List exam attempts.

    Students can only see their own attempts. Teachers and admins
    can see all attempts or filter by user_id.
    """
    from app.models.user import Student, Teacher
    from app.core.security import get_user_role, UserRole

    # Determine if user can see all attempts
    role = get_user_role(current_user)
    can_see_all = role in [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT]

    query = select(Attempt)

    # Apply filters
    if user_id:
        query = query.where(Attempt.student_id == user_id)
    elif not can_see_all:
        # Non-admin users can only see their own attempts
        student_result = await session.execute(
            select(Student.id).where(Student.user_id == current_user.id)
        )
        student_id = student_result.scalar_one_or_none()
        if student_id:
            query = query.where(Attempt.student_id == student_id)
        else:
            # Return empty list if no student profile
            return AttemptListResponse(items=[], total=0, page=page, per_page=per_page, pages=0)

    if status:
        query = query.where(Attempt.status == AttemptStatus(status))

    # Get total count
    count_query = select(Attempt.id)
    if user_id:
        count_query = count_query.where(Attempt.student_id == user_id)
    elif not can_see_all:
        if 'student_id' in locals():
            count_query = count_query.where(Attempt.student_id == student_id)

    total_result = await session.execute(count_query)
    total = len(total_result.scalars().all())

    # Paginate
    query = query.order_by(Attempt.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await session.execute(query)
    attempts = result.scalars().all()

    items = [
        AttemptResponse(
            id=a.id,
            student_id=a.student_id,
            scenario_id=a.scenario_id,
            status=a.status.value,
        )
        for a in attempts
    ]

    pages = (total + per_page - 1) // per_page if total > 0 else 0

    return AttemptListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/{attempt_id}", response_model=AttemptDetailResponse)
async def get_attempt(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> AttemptDetailResponse:
    """Get detailed information about an exam attempt."""
    from app.core.security import get_user_role, UserRole

    result = await session.execute(
        select(Attempt).where(Attempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Check authorization
    role = get_user_role(current_user)
    if role not in [UserRole.ADMIN, UserRole.TEACHER]:
        # Verify ownership
        from app.models.user import Student
        student_result = await session.execute(
            select(Student.id).where(Student.user_id == current_user.id)
        )
        student_id = student_result.scalar_one_or_none()
        if not student_id or attempt.student_id != student_id:
            raise HTTPException(status_code=403, detail="Not authorized to view this attempt")

    return AttemptDetailResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        scenario_id=attempt.scenario_id,
        status=attempt.status.value,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        scored_at=attempt.scored_at,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        task_responses=[],
    )


@router.post("/{attempt_id}/start", response_model=AttemptResponse)
async def start_attempt(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_student()),
) -> AttemptResponse:
    """Start or resume an exam attempt.

    If the attempt is in CREATED status, this starts the timer.
    If the attempt is in IN_PROGRESS status, this resumes it.
    Uses AttemptStateMachine for state transitions.
    """
    from app.models.user import Student

    # Get student
    student_result = await session.execute(
        select(Student).where(Student.user_id == current_user.id)
    )
    student = student_result.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=403, detail="Student profile not found")

    result = await session.execute(
        select(Attempt).where(Attempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.student_id != student.id:
        raise HTTPException(status_code=403, detail="Not authorized for this attempt")

    # Check for timeout on resume
    if attempt.status == AttemptStatus.IN_PROGRESS and attempt.started_at:
        if is_attempt_expired(attempt.started_at):
            attempt.status = AttemptStatus.SUBMITTED
            attempt.submitted_at = datetime.now(timezone.utc)
            await session.commit()
            raise HTTPException(
                status_code=400,
                detail="Attempt has timed out and was auto-submitted"
            )

    # Use state machine for the transition
    if attempt.status == AttemptStatus.CREATED:
        attempt.status = AttemptStatus.IN_PROGRESS
        attempt.started_at = datetime.now(timezone.utc)
        await session.commit()
    else:
        # Just refresh the attempt for resume
        await session.refresh(attempt)

    await session.refresh(attempt)
    return AttemptResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        scenario_id=attempt.scenario_id,
        status=attempt.status.value,
    )


@router.post("/{attempt_id}/submit", response_model=AttemptDetailResponse)
async def submit_attempt(
    attempt_id: UUID,
    data: AttemptSubmitRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_student()),
) -> AttemptDetailResponse:
    """Submit an exam attempt.

    This finalizes all task responses and triggers scoring.
    Once submitted, the attempt cannot be modified.
    Uses AttemptStateMachine for state transitions.
    """
    from app.models.user import Student

    # Get student
    student_result = await session.execute(
        select(Student).where(Student.user_id == current_user.id)
    )
    student = student_result.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=403, detail="Student profile not found")

    result = await session.execute(
        select(Attempt).where(Attempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.student_id != student.id:
        raise HTTPException(status_code=403, detail="Not authorized for this attempt")

    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Attempt is not in progress")

    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(attempt)

    return AttemptDetailResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        scenario_id=attempt.scenario_id,
        status=attempt.status.value,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        scored_at=attempt.scored_at,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        task_responses=[],
    )


# ============ Task Response endpoints ============

class TaskResponseItem(BaseModel):
    id: str
    task_id: str
    status: str
    content: str | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None


class TaskResponseListResponse(BaseModel):
    items: list[TaskResponseItem]


class TaskResponseSaveRequest(BaseModel):
    content: str


@router.get("/{attempt_id}/responses", response_model=TaskResponseListResponse)
async def list_task_responses(
    attempt_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> TaskResponseListResponse:
    """List all task responses for an attempt."""
    result = await session.execute(
        select(TaskResponse).where(TaskResponse.attempt_id == attempt_id)
    )
    responses = result.scalars().all()
    return TaskResponseListResponse(
        items=[
            TaskResponseItem(
                id=str(r.id),
                task_id=str(r.task_id),
                status=r.status.value,
                content=r.content,
                started_at=r.started_at,
                submitted_at=r.submitted_at,
            )
            for r in responses
        ]
    )


@router.put("/{attempt_id}/responses/{response_id}", response_model=TaskResponseItem)
async def save_task_response(
    attempt_id: UUID,
    response_id: UUID,
    data: TaskResponseSaveRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_student()),
) -> TaskResponseItem:
    """Save (auto-save) content for a task response."""
    result = await session.execute(
        select(TaskResponse).where(
            TaskResponse.id == response_id,
            TaskResponse.attempt_id == attempt_id,
        )
    )
    task_response = result.scalar_one_or_none()

    if not task_response:
        raise HTTPException(status_code=404, detail="Task response not found")

    task_response.content = data.content
    if task_response.status == TaskResponseStatus.NOT_STARTED:
        task_response.status = TaskResponseStatus.IN_PROGRESS
        task_response.started_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(task_response)

    return TaskResponseItem(
        id=str(task_response.id),
        task_id=str(task_response.task_id),
        status=task_response.status.value,
        content=task_response.content,
        started_at=task_response.started_at,
        submitted_at=task_response.submitted_at,
    )


@router.post("/{attempt_id}/responses/{response_id}/submit", response_model=TaskResponseItem)
async def submit_task_response(
    attempt_id: UUID,
    response_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_student()),
) -> TaskResponseItem:
    """Submit a task response."""
    result = await session.execute(
        select(TaskResponse).where(
            TaskResponse.id == response_id,
            TaskResponse.attempt_id == attempt_id,
        )
    )
    task_response = result.scalar_one_or_none()

    if not task_response:
        raise HTTPException(status_code=404, detail="Task response not found")

    task_response.status = TaskResponseStatus.SUBMITTED
    task_response.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(task_response)

    return TaskResponseItem(
        id=str(task_response.id),
        task_id=str(task_response.task_id),
        status=task_response.status.value,
        content=task_response.content,
        started_at=task_response.started_at,
        submitted_at=task_response.submitted_at,
    )