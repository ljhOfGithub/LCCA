"""Rubric management endpoints for teachers."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_teacher
from app.db.session import get_session
from app.models.rubric import Criterion, Rubric
from app.models.scenario import Task
from app.models.user import Teacher, User

router = APIRouter()


# Pydantic schemas for request/response

class CriterionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    max_score: float = Field(..., gt=0)
    weight: float = Field(default=1.0, gt=0)
    sequence_order: int = Field(default=0, ge=0)


class CriterionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    max_score: float | None = Field(None, gt=0)
    weight: float | None = Field(None, gt=0)
    sequence_order: int | None = Field(None, ge=0)


class CriterionResponse(BaseModel):
    id: str
    rubric_id: str
    name: str
    description: str | None
    max_score: float
    weight: float
    sequence_order: int

    model_config = {"from_attributes": True}


class RubricCreate(BaseModel):
    task_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    criteria: List[CriterionCreate] = Field(default_factory=list)


class RubricUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


class RubricResponse(BaseModel):
    id: str
    task_id: str
    name: str
    criteria: List[CriterionResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


async def get_teacher_profile(user: User, session: AsyncSession) -> Teacher:
    """Get teacher's profile, raising 404 if not found."""
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


async def verify_teacher_owns_task(task_id: UUID, teacher_id: UUID, session: AsyncSession) -> Task:
    """Verify the task belongs to a scenario created by this teacher."""
    result = await session.execute(
        select(Task)
        .options(selectinload(Task.scenario))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.scenario.created_by_id != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage this task's rubric",
        )

    return task


@router.get("/rubrics", response_model=List[RubricResponse])
async def list_rubrics(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """List all rubrics created by the current teacher."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Rubric)
        .options(selectinload(Rubric.criteria), selectinload(Rubric.task))
        .join(Task)
        .where(Task.scenario.has(created_by_id=teacher.id))
        .order_by(Rubric.created_at.desc())
    )
    rubrics = result.scalars().all()

    return [
        RubricResponse(
            id=str(r.id),
            task_id=str(r.task_id),
            name=r.name,
            criteria=[
                CriterionResponse(
                    id=str(c.id),
                    rubric_id=str(c.rubric_id),
                    name=c.name,
                    description=c.description,
                    max_score=c.max_score,
                    weight=c.weight,
                    sequence_order=c.sequence_order,
                )
                for c in sorted(r.criteria, key=lambda x: x.sequence_order)
            ],
        )
        for r in rubrics
    ]


@router.post("/rubrics", response_model=RubricResponse, status_code=status.HTTP_201_CREATED)
async def create_rubric(
    rubric_data: RubricCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Create a new rubric for a task."""
    teacher = await get_teacher_profile(current_user, session)

    # Verify teacher owns the task
    task = await verify_teacher_owns_task(rubric_data.task_id, teacher.id, session)

    # Check if rubric already exists for this task
    existing = await session.execute(
        select(Rubric).where(Rubric.task_id == rubric_data.task_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rubric already exists for this task. Use PUT to update.",
        )

    # Create rubric
    rubric = Rubric(task_id=rubric_data.task_id, name=rubric_data.name)
    session.add(rubric)
    await session.flush()

    # Create criteria
    criteria = []
    for i, crit_data in enumerate(rubric_data.criteria):
        criterion = Criterion(
            rubric_id=rubric.id,
            name=crit_data.name,
            description=crit_data.description,
            max_score=crit_data.max_score,
            weight=crit_data.weight,
            sequence_order=crit_data.sequence_order if crit_data.sequence_order else i,
        )
        session.add(criterion)
        criteria.append(criterion)

    await session.commit()

    return RubricResponse(
        id=str(rubric.id),
        task_id=str(rubric.task_id),
        name=rubric.name,
        criteria=[
            CriterionResponse(
                id=str(c.id),
                rubric_id=str(c.rubric_id),
                name=c.name,
                description=c.description,
                max_score=c.max_score,
                weight=c.weight,
                sequence_order=c.sequence_order,
            )
            for c in criteria
        ],
    )


@router.put("/rubrics/{rubric_id}", response_model=RubricResponse)
async def update_rubric(
    rubric_id: UUID,
    rubric_data: RubricUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Update a rubric's name."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Rubric)
        .options(selectinload(Rubric.criteria), selectinload(Rubric.task))
        .where(Rubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()

    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # Check ownership
    if rubric.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this rubric",
        )

    if rubric_data.name is not None:
        rubric.name = rubric_data.name

    await session.commit()

    return RubricResponse(
        id=str(rubric.id),
        task_id=str(rubric.task_id),
        name=rubric.name,
        criteria=[
            CriterionResponse(
                id=str(c.id),
                rubric_id=str(c.rubric_id),
                name=c.name,
                description=c.description,
                max_score=c.max_score,
                weight=c.weight,
                sequence_order=c.sequence_order,
            )
            for c in sorted(rubric.criteria, key=lambda x: x.sequence_order)
        ],
    )


@router.delete("/rubrics/{rubric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rubric(
    rubric_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Delete a rubric and all its criteria."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Rubric)
        .options(selectinload(Rubric.task))
        .where(Rubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()

    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # Check ownership
    if rubric.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this rubric",
        )

    await session.delete(rubric)
    await session.commit()


@router.post("/rubrics/{rubric_id}/criteria", response_model=CriterionResponse, status_code=status.HTTP_201_CREATED)
async def add_criterion(
    rubric_id: UUID,
    criterion_data: CriterionCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Add a new criterion to a rubric."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Rubric)
        .options(selectinload(Rubric.task))
        .where(Rubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()

    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # Check ownership
    if rubric.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this rubric",
        )

    criterion = Criterion(
        rubric_id=rubric.id,
        name=criterion_data.name,
        description=criterion_data.description,
        max_score=criterion_data.max_score,
        weight=criterion_data.weight,
        sequence_order=criterion_data.sequence_order,
    )
    session.add(criterion)
    await session.commit()

    return CriterionResponse(
        id=str(criterion.id),
        rubric_id=str(criterion.rubric_id),
        name=criterion.name,
        description=criterion.description,
        max_score=criterion.max_score,
        weight=criterion.weight,
        sequence_order=criterion.sequence_order,
    )


@router.put("/criteria/{criterion_id}", response_model=CriterionResponse)
async def update_criterion(
    criterion_id: UUID,
    criterion_data: CriterionUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Update a criterion."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Criterion)
        .options(selectinload(Criterion.rubric).selectinload(Rubric.task))
        .where(Criterion.id == criterion_id)
    )
    criterion = result.scalar_one_or_none()

    if not criterion:
        raise HTTPException(status_code=404, detail="Criterion not found")

    # Check ownership
    if criterion.rubric.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this criterion",
        )

    # Update fields
    if criterion_data.name is not None:
        criterion.name = criterion_data.name
    if criterion_data.description is not None:
        criterion.description = criterion_data.description
    if criterion_data.max_score is not None:
        criterion.max_score = criterion_data.max_score
    if criterion_data.weight is not None:
        criterion.weight = criterion_data.weight
    if criterion_data.sequence_order is not None:
        criterion.sequence_order = criterion_data.sequence_order

    await session.commit()

    return CriterionResponse(
        id=str(criterion.id),
        rubric_id=str(criterion.rubric_id),
        name=criterion.name,
        description=criterion.description,
        max_score=criterion.max_score,
        weight=criterion.weight,
        sequence_order=criterion.sequence_order,
    )


@router.delete("/criteria/{criterion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_criterion(
    criterion_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Delete a criterion."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Criterion)
        .options(selectinload(Criterion.rubric).selectinload(Rubric.task))
        .where(Criterion.id == criterion_id)
    )
    criterion = result.scalar_one_or_none()

    if not criterion:
        raise HTTPException(status_code=404, detail="Criterion not found")

    # Check ownership
    if criterion.rubric.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this criterion",
        )

    await session.delete(criterion)
    await session.commit()