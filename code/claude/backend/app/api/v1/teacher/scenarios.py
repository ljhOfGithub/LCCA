"""Scenario and Task management endpoints for teachers."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_teacher
from app.core.status import ScenarioStatus, TaskType
from app.db.session import get_session
from app.models.scenario import Scenario, Task
from app.models.user import Teacher, User

router = APIRouter()


# Pydantic schemas

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

    model_config = {"from_attributes": True}


class MaterialCreate(BaseModel):
    material_type: str = Field(..., min_length=1, max_length=50)
    content: str | None = None
    storage_key: str | None = None
    metadata_json: str | None = None


class MaterialResponse(BaseModel):
    id: str
    task_id: str
    material_type: str
    content: str | None
    storage_key: str | None
    metadata_json: str | None

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

    model_config = {"from_attributes": True}


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


@router.get("/published", response_model=List[ScenarioResponse])
async def list_published_scenarios(
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """List all published scenarios for any authenticated user."""
    result = await session.execute(
        select(Scenario)
        .options(selectinload(Scenario.tasks))
        .where(Scenario.status == ScenarioStatus.PUBLISHED.value)
        .order_by(Scenario.created_at.desc())
    )
    scenarios = result.scalars().all()
    return [
        ScenarioResponse(
            id=str(s.id),
            title=s.title,
            description=s.description,
            status=s.status,
            created_by_id=str(s.created_by_id),
            tasks=[
                TaskResponse(
                    id=str(t.id),
                    scenario_id=str(t.scenario_id),
                    title=t.title,
                    description=t.description,
                    task_type=t.task_type,
                    sequence_order=t.sequence_order,
                    time_limit_seconds=t.time_limit_seconds,
                )
                for t in sorted(s.tasks, key=lambda x: x.sequence_order)
            ],
        )
        for s in scenarios
    ]


@router.get("/scenarios", response_model=List[ScenarioResponse])
async def list_scenarios(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """List all scenarios created by the current teacher."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Scenario)
        .options(selectinload(Scenario.tasks))
        .where(Scenario.created_by_id == teacher.id)
        .order_by(Scenario.created_at.desc())
    )
    scenarios = result.scalars().all()

    return [
        ScenarioResponse(
            id=str(s.id),
            title=s.title,
            description=s.description,
            status=s.status,
            created_by_id=str(s.created_by_id),
            tasks=[
                TaskResponse(
                    id=str(t.id),
                    scenario_id=str(t.scenario_id),
                    title=t.title,
                    description=t.description,
                    task_type=t.task_type,
                    sequence_order=t.sequence_order,
                    time_limit_seconds=t.time_limit_seconds,
                )
                for t in sorted(s.tasks, key=lambda x: x.sequence_order)
            ],
        )
        for s in scenarios
    ]


@router.post("/scenarios", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    scenario_data: ScenarioCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Create a new scenario."""
    teacher = await get_teacher_profile(current_user, session)

    scenario = Scenario(
        title=scenario_data.title,
        description=scenario_data.description,
        status=scenario_data.status,
        created_by_id=teacher.id,
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
    current_user: User = Depends(get_current_user),
):
    """Get a specific scenario by ID."""
    result = await session.execute(
        select(Scenario)
        .options(selectinload(Scenario.tasks))
        .where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    return ScenarioResponse(
        id=str(scenario.id),
        title=scenario.title,
        description=scenario.description,
        status=scenario.status,
        created_by_id=str(scenario.created_by_id),
        tasks=[
            TaskResponse(
                id=str(t.id),
                scenario_id=str(t.scenario_id),
                title=t.title,
                description=t.description,
                task_type=t.task_type,
                sequence_order=t.sequence_order,
                time_limit_seconds=t.time_limit_seconds,
            )
            for t in sorted(scenario.tasks, key=lambda x: x.sequence_order)
        ],
    )


@router.put("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: UUID,
    scenario_data: ScenarioUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Update a scenario."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Scenario)
        .options(selectinload(Scenario.tasks))
        .where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this scenario",
        )

    if scenario_data.title is not None:
        scenario.title = scenario_data.title
    if scenario_data.description is not None:
        scenario.description = scenario_data.description
    if scenario_data.status is not None:
        # Validate status transition
        if not scenario.status.can_transition_to(scenario_data.status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition from {scenario.status.value} to {scenario_data.status.value}",
            )
        scenario.status = scenario_data.status

    await session.commit()

    return ScenarioResponse(
        id=str(scenario.id),
        title=scenario.title,
        description=scenario.description,
        status=scenario.status,
        created_by_id=str(scenario.created_by_id),
        tasks=[
            TaskResponse(
                id=str(t.id),
                scenario_id=str(t.scenario_id),
                title=t.title,
                description=t.description,
                task_type=t.task_type,
                sequence_order=t.sequence_order,
                time_limit_seconds=t.time_limit_seconds,
            )
            for t in sorted(scenario.tasks, key=lambda x: x.sequence_order)
        ],
    )


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Delete a scenario and all its tasks."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this scenario",
        )

    # Check if scenario has any attempts
    if scenario.attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete scenario with existing attempts",
        )

    await session.delete(scenario)
    await session.commit()


@router.get("/scenarios/{scenario_id}/tasks", response_model=List[TaskResponse])
async def list_tasks(
    scenario_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """List all tasks for a scenario."""
    result = await session.execute(
        select(Task)
        .where(Task.scenario_id == scenario_id)
        .order_by(Task.sequence_order)
    )
    tasks = result.scalars().all()
    return [
        TaskResponse(
            id=str(t.id),
            scenario_id=str(t.scenario_id),
            title=t.title,
            description=t.description,
            task_type=t.task_type,
            sequence_order=t.sequence_order,
            time_limit_seconds=t.time_limit_seconds,
        )
        for t in tasks
    ]


@router.get("/scenarios/{scenario_id}/tasks/{task_index}", response_model=TaskResponse)
async def get_task_by_index(
    scenario_id: UUID,
    task_index: int,
    session: AsyncSession = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """Get a task by its 0-based index (sequence order position)."""
    result = await session.execute(
        select(Task)
        .where(Task.scenario_id == scenario_id)
        .order_by(Task.sequence_order)
        .offset(task_index)
        .limit(1)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskResponse(
        id=str(task.id),
        scenario_id=str(task.scenario_id),
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        sequence_order=task.sequence_order,
        time_limit_seconds=task.time_limit_seconds,
    )


@router.post("/scenarios/{scenario_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def add_task(
    scenario_id: UUID,
    task_data: TaskCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Add a new task to a scenario."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to add tasks to this scenario",
        )

    if scenario.status != ScenarioStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only add tasks to draft scenarios",
        )

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

    return TaskResponse(
        id=str(task.id),
        scenario_id=str(task.scenario_id),
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        sequence_order=task.sequence_order,
        time_limit_seconds=task.time_limit_seconds,
    )