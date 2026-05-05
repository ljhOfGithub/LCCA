"""Task-level management endpoints for teachers."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_admin
from app.core.auth_helpers import get_or_create_teacher_profile as _get_or_create_teacher
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
    weight: float | None = Field(None, gt=0)


class TaskResponse(BaseModel):
    id: str
    scenario_id: str
    title: str
    description: str | None
    task_type: TaskType
    sequence_order: int
    time_limit_seconds: int | None
    weight: float = 1.0

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
    """Get teacher's profile; auto-creates one for superusers."""
    result = await session.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        if user.is_superuser:
            teacher = Teacher(user_id=user.id)
            session.add(teacher)
            await session.flush()
            await session.refresh(teacher)
            return teacher
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a teacher")
    return teacher


async def verify_teacher_owns_task(task_id: UUID, teacher_id: UUID, session: AsyncSession, user: User | None = None) -> Task:
    """Verify the task belongs to a scenario created by this teacher. Admin skips ownership check."""
    result = await session.execute(
        select(Task)
        .options(selectinload(Task.scenario))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if user and user.is_superuser:
        return task

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
    current_user: User = Depends(require_admin()),
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
    current_user: User = Depends(require_admin()),
):
    """Get a specific task by ID."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session, current_user)

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
    current_user: User = Depends(require_admin()),
):
    """Update a task."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session, current_user)

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
    if task_data.weight is not None:
        task.weight = task_data.weight

    await session.commit()

    return TaskResponse(
        id=str(task.id),
        scenario_id=str(task.scenario_id),
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        sequence_order=task.sequence_order,
        time_limit_seconds=task.time_limit_seconds,
        weight=task.weight,
    )


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Delete a task and its materials."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session, current_user)

    # Check if task has responses
    if task.task_responses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete task with existing responses",
        )

    await session.delete(task)
    await session.commit()


# Material endpoints

@router.post("/tasks/{task_id}/materials/upload-audio", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio_material(
    task_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Upload an audio file (MP3/WAV/WebM) and attach it as a material to a task."""
    from app.core.config import settings
    import boto3, uuid as uuid_lib, asyncio, os

    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session, current_user)

    # Accept any audio content type
    allowed_types = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4"}
    if file.content_type and file.content_type.split(";")[0] not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {file.content_type}")

    ext = (file.filename or "audio").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "mp3"
    storage_key = f"materials/{task_id}/{uuid_lib.uuid4()}.{ext}"
    content = await file.read()

    def do_upload():
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        s3.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=content,
                      ContentType=file.content_type or "audio/mpeg")

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, do_upload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    # Remove existing audio material if any
    existing_result = await session.execute(
        select(Material).where(Material.task_id == task_id, Material.material_type == "audio")
    )
    for old in existing_result.scalars().all():
        await session.delete(old)

    public_endpoint = os.environ.get("S3_PUBLIC_ENDPOINT", settings.s3_endpoint).replace("minio:9000", "localhost:9000")
    public_url = f"{public_endpoint}/{settings.s3_bucket}/{storage_key}"

    material = Material(
        task_id=task.id,
        material_type="audio",
        content=public_url,
        storage_key=storage_key,
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


@router.post("/tasks/{task_id}/materials/upload-document", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_document_material(
    task_id: UUID,
    file: UploadFile = File(...),
    material_type: str = "resume",
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Upload a PDF or DOCX file and attach it as a material to a task."""
    from app.core.config import settings
    import boto3, uuid as uuid_lib, asyncio, os

    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session, current_user)

    allowed_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }
    ct = (file.content_type or "").split(";")[0]
    if ct and ct not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}. Only PDF and DOCX are accepted.")

    filename = file.filename or "document"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "pdf"
    storage_key = f"materials/{task_id}/{uuid_lib.uuid4()}.{ext}"
    content_bytes = await file.read()

    def do_upload():
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        s3.put_object(
            Bucket=settings.s3_bucket,
            Key=storage_key,
            Body=content_bytes,
            ContentType=ct or "application/octet-stream",
        )

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, do_upload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    public_endpoint = os.environ.get("S3_PUBLIC_ENDPOINT", settings.s3_endpoint).replace("minio:9000", "localhost:9000")
    public_url = f"{public_endpoint}/{settings.s3_bucket}/{storage_key}"

    import json as _json
    meta = _json.dumps({"filename": filename})

    material = Material(
        task_id=task.id,
        material_type=material_type,
        content=public_url,
        storage_key=storage_key,
        metadata_json=meta,
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


@router.post("/tasks/{task_id}/materials", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def add_material(
    task_id: UUID,
    material_data: MaterialCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Add a material to a task."""
    teacher = await get_teacher_profile(current_user, session)
    task = await verify_teacher_owns_task(task_id, teacher.id, session, current_user)

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
    current_user: User = Depends(require_admin()),
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
    current_user: User = Depends(require_admin()),
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