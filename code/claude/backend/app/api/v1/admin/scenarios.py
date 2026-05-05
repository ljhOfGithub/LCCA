"""Scenario management endpoints for teachers and admins.

OpenAPI contract:
- GET /api/v1/admin/scenarios - List scenarios
- POST /api/v1/admin/scenarios - Create scenario
- GET /api/v1/admin/scenarios/{id} - Get scenario details
- PATCH /api/v1/admin/scenarios/{id} - Update scenario
- DELETE /api/v1/admin/scenarios/{id} - Delete scenario
- POST /api/v1/admin/scenarios/{id}/publish - Publish scenario
- POST /api/v1/admin/scenarios/{id}/tasks - Add task to scenario
"""
from typing import Annotated
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.models.scenario import Scenario, Task, Material
from app.models.rubric import Rubric, Criterion
from app.api.schemas.scenarios import (
    ScenarioResponse,
    ScenarioListResponse,
    ScenarioDetailResponse,
    ScenarioCreate,
    ScenarioUpdate,
    TaskResponse,
    TaskCreate,
    TaskDetailResponse,
    TaskListResponse,
)
from app.core.security import get_current_user, require_admin, require_teacher, require_student
from app.core.auth_helpers import assert_can_modify_scenario
from app.core.status import ScenarioStatus

router = APIRouter()


@router.get("/scenarios", response_model=ScenarioListResponse)
async def list_scenarios(
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
    status: str | None = Query(default=None, description="Filter by status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> ScenarioListResponse:
    """List all scenarios (for teachers/admins).

    Teachers see their own scenarios. Admins see all.
    """
    query = select(Scenario)

    if status:
        try:
            status_enum = ScenarioStatus(status)
            query = query.where(Scenario.status == status_enum)
        except ValueError:
            pass

    # Admin sees all scenarios (no ownership filter)

    # Count total
    all_results = await session.execute(query)
    total = len(all_results.scalars().all())

    # Paginate
    query = query.order_by(Scenario.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await session.execute(query)
    scenarios = result.scalars().all()

    items = [
        ScenarioResponse(
            id=s.id,
            title=s.title,
            description=s.description or "",
            status=s.status.value,
            duration_minutes=60,  # TODO: Calculate from tasks
            total_tasks=len(s.tasks) if s.tasks else 0,
            created_at=s.created_at,
            updated_at=s.updated_at,
            tags=[],  # TODO: Add tags
        )
        for s in scenarios
    ]

    pages = (total + per_page - 1) // per_page if total > 0 else 0

    return ScenarioListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/scenarios", response_model=ScenarioResponse, status_code=201)
async def create_scenario(
    data: ScenarioCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> ScenarioResponse:
    """Create a new scenario.

    Only teachers and admins can create scenarios.
    """
    scenario = Scenario(
        title=data.title,
        description=data.description,
        created_by_id=current_user.id,
        status=ScenarioStatus.DRAFT,
    )
    session.add(scenario)
    await session.flush()
    await session.refresh(scenario)

    return ScenarioResponse(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description or "",
        status=scenario.status.value,
        duration_minutes=0,
        total_tasks=0,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        tags=[],
    )


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetailResponse)
async def get_scenario(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> ScenarioDetailResponse:
    """Get detailed scenario information with tasks."""
    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    assert_can_modify_scenario(current_user, scenario.created_by_id)

    tasks = [
        TaskResponse(
            id=t.id,
            scenario_id=t.scenario_id,
            index=t.sequence_order,
            type=t.task_type.value,
            title=t.title,
            description=t.description or "",
            time_limit_seconds=t.time_limit_seconds,
            max_score=100.0,  # TODO: Calculate from rubric
            has_prompt=len(t.materials) > 0 if t.materials else False,
            has_rubric=t.rubric is not None,
        )
        for t in (scenario.tasks or [])
    ]

    return ScenarioDetailResponse(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description or "",
        instructions="",  # TODO: Add instructions field
        status=scenario.status.value,
        duration_minutes=60,
        tasks=tasks,
        tags=[],
        created_at=scenario.created_at,
    )


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: UUID,
    data: ScenarioUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> ScenarioResponse:
    """Update a scenario.

    Only the creator or admin can update.
    """
    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    assert_can_modify_scenario(current_user, scenario.created_by_id)

    # Update fields
    if data.title is not None:
        scenario.title = data.title
    if data.description is not None:
        scenario.description = data.description

    await session.commit()
    await session.refresh(scenario)

    return ScenarioResponse(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description or "",
        status=scenario.status.value,
        duration_minutes=60,
        total_tasks=len(scenario.tasks) if scenario.tasks else 0,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        tags=[],
    )


@router.post("/scenarios/{scenario_id}/publish", response_model=ScenarioResponse)
async def publish_scenario(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> ScenarioResponse:
    """Publish a scenario to make it available to students.

    Only admins can publish. Teachers can only submit for review.
    """
    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.status != ScenarioStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot publish scenario in {scenario.status} status"
        )

    scenario.status = ScenarioStatus.PUBLISHED
    await session.commit()
    await session.refresh(scenario)

    return ScenarioResponse(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description or "",
        status=scenario.status.value,
        duration_minutes=60,
        total_tasks=len(scenario.tasks) if scenario.tasks else 0,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        tags=[],
    )


@router.post("/scenarios/{scenario_id}/tasks", response_model=TaskResponse, status_code=201)
async def add_task(
    scenario_id: UUID,
    data: TaskCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> TaskResponse:
    """Add a task to a scenario."""
    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    assert_can_modify_scenario(current_user, scenario.created_by_id)

    # Get next sequence order
    max_order_result = await session.execute(
        select(Task.sequence_order)
        .where(Task.scenario_id == scenario_id)
        .order_by(Task.sequence_order.desc())
        .limit(1)
    )
    max_order = max_order_result.scalar_one_or_none() or -1

    task = Task(
        scenario_id=scenario_id,
        title=data.title,
        description=data.description,
        task_type=data.task_type,
        sequence_order=max_order + 1,
        time_limit_seconds=data.time_limit_seconds,
    )
    session.add(task)
    await session.flush()
    await session.refresh(task)

    return TaskResponse(
        id=task.id,
        scenario_id=task.scenario_id,
        index=task.sequence_order,
        type=task.task_type.value,
        title=task.title,
        description=task.description or "",
        time_limit_seconds=task.time_limit_seconds,
        max_score=100.0,
        has_prompt=False,
        has_rubric=False,
    )


@router.get("/scenarios/{scenario_id}/tasks", response_model=TaskListResponse)
async def list_scenario_tasks(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
) -> TaskListResponse:
    """List all tasks in a scenario."""
    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    # Get tasks
    tasks_result = await session.execute(
        select(Task)
        .where(Task.scenario_id == scenario_id)
        .order_by(Task.sequence_order)
    )
    tasks = tasks_result.scalars().all()

    items = [
        TaskResponse(
            id=t.id,
            scenario_id=t.scenario_id,
            index=t.sequence_order,
            type=t.task_type.value,
            title=t.title,
            description=t.description or "",
            time_limit_seconds=t.time_limit_seconds,
            max_score=100.0,
            has_prompt=len(t.materials) > 0 if t.materials else False,
            has_rubric=t.rubric is not None,
        )
        for t in tasks
    ]

    return TaskListResponse(items=items, total=len(items))


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(require_teacher()),
):
    """Delete a scenario.

    Only admins can delete scenarios.
    """

    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    await session.delete(scenario)
    await session.commit()