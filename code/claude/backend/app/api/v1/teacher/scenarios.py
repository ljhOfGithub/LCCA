"""Scenario and Task management endpoints.

Who can do what:
  Admin  (is_superuser) — full CRUD, owns scenarios via user.id
  Teacher                — list published scenarios only; no create/edit
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_admin, require_teacher
from app.core.status import ScenarioStatus, TaskType
from app.core.auth_helpers import assert_can_modify_scenario
from app.db.session import get_session
from app.models.scenario import Material, Scenario, Task
from app.models.user import User

router = APIRouter()


# ── Pydantic schemas ────────────────────────────────────────────────────────────

class MaterialResponse(BaseModel):
    id: str
    task_id: str
    material_type: str
    content: str | None
    storage_key: str | None
    metadata_json: str | None
    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    task_type: TaskType
    sequence_order: int = Field(default=0, ge=0)
    time_limit_seconds: int | None = Field(None, gt=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    task_type: TaskType | None = None
    sequence_order: int | None = Field(None, ge=0)
    time_limit_seconds: int | None = Field(None, gt=0)


class TaskResponse(BaseModel):
    id: str
    scenario_id: str
    title: str
    description: str | None
    task_type: TaskType
    sequence_order: int
    time_limit_seconds: int | None
    weight: float = 1.0
    materials: List[MaterialResponse] = Field(default_factory=list)
    model_config = {"from_attributes": True}


class ScenarioCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: ScenarioStatus = ScenarioStatus.DRAFT


class ScenarioUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: ScenarioStatus | None = None


class ScenarioResponse(BaseModel):
    id: str
    title: str
    description: str | None
    status: ScenarioStatus
    created_by_id: str
    tasks: List[TaskResponse] = Field(default_factory=list)
    duration_minutes: int = 0
    total_tasks: int = 0
    model_config = {"from_attributes": True}


# ── Helpers ─────────────────────────────────────────────────────────────────────

_TASKS_WITH_MATERIALS = selectinload(Scenario.tasks).selectinload(Task.materials)


def _task_response(t: Task) -> TaskResponse:
    return TaskResponse(
        id=str(t.id),
        scenario_id=str(t.scenario_id),
        title=t.title,
        description=t.description,
        task_type=t.task_type,
        sequence_order=t.sequence_order,
        time_limit_seconds=t.time_limit_seconds,
        weight=getattr(t, 'weight', 1.0),
        materials=[
            MaterialResponse(
                id=str(m.id),
                task_id=str(m.task_id),
                material_type=m.material_type,
                content=m.content,
                storage_key=m.storage_key,
                metadata_json=m.metadata_json,
            )
            for m in (t.materials or [])
        ],
    )


def _scenario_response(s: Scenario) -> ScenarioResponse:
    import math
    tasks = sorted(s.tasks, key=lambda x: x.sequence_order)
    total_s = sum(t.time_limit_seconds or 0 for t in tasks)
    duration_minutes = max(1, math.ceil(total_s / 60)) if total_s > 0 else 60
    return ScenarioResponse(
        id=str(s.id),
        title=s.title,
        description=s.description,
        status=s.status,
        created_by_id=str(s.created_by_id),
        tasks=[_task_response(t) for t in tasks],
        duration_minutes=duration_minutes,
        total_tasks=len(tasks),
    )


# ── Public (any authenticated user) ────────────────────────────────────────────

@router.get("/published", response_model=List[ScenarioResponse])
async def list_published_scenarios(
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """List all published scenarios for any authenticated user."""
    result = await session.execute(
        select(Scenario)
        .options(_TASKS_WITH_MATERIALS)
        .where(Scenario.status == ScenarioStatus.PUBLISHED)
        .order_by(Scenario.created_at.desc())
    )
    return [_scenario_response(s) for s in result.scalars().all()]


# ── Admin-only CRUD ─────────────────────────────────────────────────────────────

@router.get("/scenarios", response_model=List[ScenarioResponse])
async def list_scenarios(
    session: AsyncSession = Depends(get_session),
    _: User = Depends(require_teacher()),
):
    """List all scenarios. Visible to both admin and teachers (no ownership filter)."""
    result = await session.execute(
        select(Scenario)
        .options(_TASKS_WITH_MATERIALS)
        .order_by(Scenario.created_at.desc())
    )
    return [_scenario_response(s) for s in result.scalars().all()]


@router.post("/scenarios", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    scenario_data: ScenarioCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Create a new scenario. Admin only. Ownership = admin's user.id."""
    scenario = Scenario(
        title=scenario_data.title,
        description=scenario_data.description,
        status=scenario_data.status,
        created_by_id=current_user.id,
    )
    session.add(scenario)
    await session.commit()
    return ScenarioResponse(
        id=str(scenario.id),
        title=scenario.title,
        description=scenario.description,
        status=scenario.status,
        created_by_id=str(scenario.created_by_id),
        tasks=[],
    )


@router.get("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """Get a specific scenario by ID (any authenticated user)."""
    result = await session.execute(
        select(Scenario).options(_TASKS_WITH_MATERIALS).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _scenario_response(scenario)


@router.put("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: UUID,
    scenario_data: ScenarioUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Update a scenario. Admin only."""
    result = await session.execute(
        select(Scenario).options(_TASKS_WITH_MATERIALS).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    # Non-superuser admin check (if we ever add non-super admins later)
    assert_can_modify_scenario(current_user, scenario.created_by_id)

    if scenario_data.title is not None:
        scenario.title = scenario_data.title
    if scenario_data.description is not None:
        scenario.description = scenario_data.description
    if scenario_data.status is not None:
        if not scenario.status.can_transition_to(scenario_data.status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition from {scenario.status.value} to {scenario_data.status.value}",
            )
        scenario.status = scenario_data.status

    await session.commit()
    return _scenario_response(scenario)


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Delete a scenario. Admin only."""
    result = await session.execute(select(Scenario).where(Scenario.id == scenario_id))
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    assert_can_modify_scenario(current_user, scenario.created_by_id)
    await session.delete(scenario)
    await session.commit()


@router.get("/scenarios/{scenario_id}/tasks", response_model=List[TaskResponse])
async def list_tasks(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """List all tasks for a scenario (any authenticated user)."""
    result = await session.execute(
        select(Task)
        .options(selectinload(Task.materials))
        .where(Task.scenario_id == scenario_id)
        .order_by(Task.sequence_order)
    )
    return [_task_response(t) for t in result.scalars().all()]


@router.post("/scenarios/{scenario_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def add_task(
    scenario_id: UUID,
    task_data: TaskCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Add a new task to a scenario. Admin only."""
    result = await session.execute(select(Scenario).where(Scenario.id == scenario_id))
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    assert_can_modify_scenario(current_user, scenario.created_by_id)
    if scenario.status != ScenarioStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Can only add tasks to draft scenarios")

    task = Task(
        scenario_id=scenario.id,
        title=task_data.title,
        description=task_data.description,
        task_type=task_data.task_type,
        sequence_order=task_data.sequence_order,
        time_limit_seconds=task_data.time_limit_seconds,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    task.materials = []
    return _task_response(task)
