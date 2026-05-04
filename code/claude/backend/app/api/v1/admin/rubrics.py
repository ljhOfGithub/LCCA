"""Rubric and criterion management endpoints.

OpenAPI contract:
- GET /api/v1/admin/rubrics - List rubrics
- POST /api/v1/admin/rubrics - Create rubric
- GET /api/v1/admin/rubrics/{id} - Get rubric details
- PATCH /api/v1/admin/rubrics/{id} - Update rubric
- DELETE /api/v1/admin/rubrics/{id} - Delete rubric
- POST /api/v1/admin/rubrics/{id}/criteria - Add criterion
- PATCH /api/v1/admin/criteria/{id} - Update criterion
- DELETE /api/v1/admin/criteria/{id} - Delete criterion
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.models.rubric import Rubric, Criterion
from app.api.schemas.scenarios import (
    RubricResponse,
    RubricCriterion,
    RubricCreate,
    CriterionCreate,
)
from app.core.security import require_teacher

router = APIRouter()


@router.get("/rubrics", response_model=list[RubricResponse])
async def list_rubrics(
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
    task_id: UUID | None = Query(default=None, description="Filter by task ID"),
) -> list[RubricResponse]:
    """List all rubrics.

    Teachers see their rubrics. Admins see all.
    """
    query = select(Rubric)

    if task_id:
        query = query.where(Rubric.task_id == task_id)

    result = await session.execute(query)
    rubrics = result.scalars().all()

    return [
        RubricResponse(
            id=r.id,
            task_id=r.task_id,
            criteria=[
                RubricCriterion(
                    name=c.name,
                    description=c.description or "",
                    max_score=c.max_score,
                    levels={},  # TODO: Add levels
                )
                for c in (r.criteria or [])
            ],
        )
        for r in rubrics
    ]


@router.post("/rubrics", response_model=RubricResponse, status_code=201)
async def create_rubric(
    data: RubricCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> RubricResponse:
    """Create a new rubric for a task."""
    from app.models.scenario import Task

    # Verify task exists
    task_result = await session.execute(
        select(Task).where(Task.id == data.task_id)
    )
    task = task_result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if rubric already exists for this task
    existing = await session.execute(
        select(Rubric).where(Rubric.task_id == data.task_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Rubric already exists for this task"
        )

    rubric = Rubric(
        task_id=data.task_id,
        name=data.name,
    )
    session.add(rubric)
    await session.flush()
    await session.refresh(rubric)

    return RubricResponse(
        id=rubric.id,
        task_id=rubric.task_id,
        criteria=[],
    )


@router.get("/rubrics/{rubric_id}", response_model=RubricResponse)
async def get_rubric(
    rubric_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> RubricResponse:
    """Get rubric details with criteria."""
    result = await session.execute(
        select(Rubric).where(Rubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()

    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    return RubricResponse(
        id=rubric.id,
        task_id=rubric.task_id,
        criteria=[
            RubricCriterion(
                name=c.name,
                description=c.description or "",
                max_score=c.max_score,
                levels={},  # TODO: Add levels
            )
            for c in (rubric.criteria or [])
        ],
    )


@router.post("/rubrics/{rubric_id}/criteria", status_code=201)
async def add_criterion(
    rubric_id: UUID,
    data: CriterionCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> dict:
    """Add a criterion to a rubric."""
    result = await session.execute(
        select(Rubric).where(Rubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()

    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # Get next sequence order
    max_order_result = await session.execute(
        select(Criterion.sequence_order)
        .where(Criterion.rubric_id == rubric_id)
        .order_by(Criterion.sequence_order.desc())
        .limit(1)
    )
    max_order = max_order_result.scalar_one_or_none() or -1

    criterion = Criterion(
        rubric_id=rubric_id,
        name=data.name,
        description=data.description,
        max_score=data.max_score,
        weight=data.weight,
        sequence_order=max_order + 1,
    )
    session.add(criterion)
    await session.commit()
    await session.refresh(criterion)

    return {
        "id": str(criterion.id),
        "name": criterion.name,
        "description": criterion.description,
        "max_score": criterion.max_score,
        "weight": criterion.weight,
        "sequence_order": criterion.sequence_order,
    }


@router.patch("/criteria/{criterion_id}")
async def update_criterion(
    criterion_id: UUID,
    data: CriterionCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> dict:
    """Update a criterion."""
    result = await session.execute(
        select(Criterion).where(Criterion.id == criterion_id)
    )
    criterion = result.scalar_one_or_none()

    if not criterion:
        raise HTTPException(status_code=404, detail="Criterion not found")

    criterion.name = data.name
    criterion.description = data.description
    criterion.max_score = data.max_score
    criterion.weight = data.weight

    await session.commit()
    await session.refresh(criterion)

    return {
        "id": str(criterion.id),
        "name": criterion.name,
        "description": criterion.description,
        "max_score": criterion.max_score,
        "weight": criterion.weight,
        "sequence_order": criterion.sequence_order,
    }


@router.delete("/criteria/{criterion_id}", status_code=204)
async def delete_criterion(
    criterion_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
):
    """Delete a criterion."""
    result = await session.execute(
        select(Criterion).where(Criterion.id == criterion_id)
    )
    criterion = result.scalar_one_or_none()

    if not criterion:
        raise HTTPException(status_code=404, detail="Criterion not found")

    await session.delete(criterion)
    await session.commit()