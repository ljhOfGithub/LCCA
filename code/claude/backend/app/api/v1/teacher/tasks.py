"""Task-level management endpoints for teachers."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_teacher
from app.core.status import TaskType
from app.db.session import get_session
from app.models.scenario import Material, Task
from app.models.user import Teacher, User

router = APIRouter()


# Pydantic schemas

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


class MaterialUpdate(BaseModel):
    material_type: str | None = Field(None, min_length=1, max_length=50)
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
            detail="You do not have permission to modify this task",
        )

    return task


@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    scenario_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """List tasks, optionally filtered by scenario."""
    teacher = await get_teacher_profile(current_user, session)

    query = select(Task).options(selectinload(Task.scenario))
    if scenario_id:
        query = query.where(Task.scenario_id == scenario_id)

    # Only return tasks owned by this teacher
    query = query.where(Task.scenario.has(created_by_id=teacher.id))
    query = query.order_by(Task.sequence_order)

    result = await session.execute(query)
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


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Get a specific task by ID."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session)

    return TaskResponse(
        id=str(task.id),
        scenario_id=str(task.scenario_id),
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        sequence_order=task.sequence_order,
        time_limit_seconds=task.time_limit_seconds,
    )


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    task_data: TaskUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Update a task."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session)

    if task_data.title is not None:
        task.title = task_data.title
    if task_data.description is not None:
        task.description = task_data.description
    if task_data.task_type is not None:
        task.task_type = task_data.task_type
    if task_data.sequence_order is not None:
        task.sequence_order = task_data.sequence_order
    if task_data.time_limit_seconds is not None:
        task.time_limit_seconds = task_data.time_limit_seconds

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


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Delete a task and its materials."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session)

    # Check if task has responses
    if task.task_responses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete task with existing responses",
        )

    await session.delete(task)
    await session.commit()


# Material endpoints

@router.post("/tasks/{task_id}/materials", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def add_material(
    task_id: UUID,
    material_data: MaterialCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Add a material to a task."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session)

    material = Material(
        task_id=task.id,
        material_type=material_data.material_type,
        content=material_data.content,
        storage_key=material_data.storage_key,
        metadata_json=material_data.metadata_json,
    )
    session.add(material)
    await session.commit()

    return MaterialResponse(
        id=str(material.id),
        task_id=str(material.task_id),
        material_type=material.material_type,
        content=material.content,
        storage_key=material.storage_key,
        metadata_json=material.metadata_json,
    )


@router.put("/materials/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: UUID,
    material_data: MaterialUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Update a material."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Material)
        .options(selectinload(Material.task).selectinload(Task.scenario))
        .where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()

    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if material.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this material",
        )

    if material_data.material_type is not None:
        material.material_type = material_data.material_type
    if material_data.content is not None:
        material.content = material_data.content
    if material_data.storage_key is not None:
        material.storage_key = material_data.storage_key
    if material_data.metadata_json is not None:
        material.metadata_json = material_data.metadata_json

    await session.commit()

    return MaterialResponse(
        id=str(material.id),
        task_id=str(material.task_id),
        material_type=material.material_type,
        content=material.content,
        storage_key=material.storage_key,
        metadata_json=material.metadata_json,
    )


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    material_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_teacher()),
):
    """Delete a material."""
    teacher = await get_teacher_profile(current_user, session)

    result = await session.execute(
        select(Material)
        .options(selectinload(Material.task).selectinload(Task.scenario))
        .where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()

    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if material.task.scenario.created_by_id != teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this material",
        )

    await session.delete(material)
    await session.commit()