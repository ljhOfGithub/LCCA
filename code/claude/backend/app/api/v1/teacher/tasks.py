"""Task and material management. Admin-only CRUD."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_admin
from app.core.auth_helpers import assert_can_modify_scenario
from app.core.status import TaskType
from app.db.session import get_session
from app.models.scenario import Material, Scenario, Task
from app.models.user import User

router = APIRouter()


# ── Schemas ─────────────────────────────────────────────────────────────────────

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


# ── Helpers ─────────────────────────────────────────────────────────────────────

async def _get_task_for_admin(task_id: UUID, user: User, session: AsyncSession) -> Task:
    """Fetch task and verify admin owns the parent scenario (via user.id)."""
    result = await session.execute(
        select(Task).options(selectinload(Task.scenario)).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    assert_can_modify_scenario(user, task.scenario.created_by_id)
    return task


def _task_out(t: Task) -> TaskResponse:
    return TaskResponse(
        id=str(t.id),
        scenario_id=str(t.scenario_id),
        title=t.title,
        description=t.description,
        task_type=t.task_type,
        sequence_order=t.sequence_order,
        time_limit_seconds=t.time_limit_seconds,
        weight=getattr(t, 'weight', 1.0),
    )


def _mat_out(m: Material) -> MaterialResponse:
    return MaterialResponse(
        id=str(m.id),
        task_id=str(m.task_id),
        material_type=m.material_type,
        content=m.content,
        storage_key=m.storage_key,
        metadata_json=m.metadata_json,
    )


# ── Task endpoints ───────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    scenario_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """List all admin-owned tasks."""
    query = select(Task).options(selectinload(Task.scenario))
    query = query.where(Task.scenario.has(created_by_id=current_user.id))
    if scenario_id:
        query = query.where(Task.scenario_id == scenario_id)
    query = query.order_by(Task.sequence_order)
    result = await session.execute(query)
    return [_task_out(t) for t in result.scalars().all()]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    task = await _get_task_for_admin(task_id, current_user, session)
    return _task_out(task)


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    task_data: TaskUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    task = await _get_task_for_admin(task_id, current_user, session)

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
    return _task_out(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    task = await _get_task_for_admin(task_id, current_user, session)
    if hasattr(task, 'task_responses') and task.task_responses:
        raise HTTPException(400, "Cannot delete task with existing responses")
    await session.delete(task)
    await session.commit()


# ── Material endpoints ────────────────────────────────────────────────────────────

async def _get_material_for_admin(material_id: UUID, user: User, session: AsyncSession) -> Material:
    result = await session.execute(
        select(Material)
        .options(selectinload(Material.task).selectinload(Task.scenario))
        .where(Material.id == material_id)
    )
    mat = result.scalar_one_or_none()
    if not mat:
        raise HTTPException(404, "Material not found")
    assert_can_modify_scenario(user, mat.task.scenario.created_by_id)
    return mat


async def _transcribe_bytes(audio_bytes: bytes, ext: str, settings) -> str:
    """Call the configured Whisper-compatible ASR API with raw bytes. Returns empty string on failure."""
    if not getattr(settings, "asr_api_key", None):
        return ""
    import httpx, logging
    mime = {
        "mp3": "audio/mpeg", "wav": "audio/wav", "webm": "audio/webm",
        "ogg": "audio/ogg", "m4a": "audio/mp4", "mp4": "audio/mp4",
    }.get(ext, "audio/mpeg")
    asr_url = getattr(settings, "asr_api_url", None) or "https://api.openai.com/v1/audio/transcriptions"
    asr_model = getattr(settings, "asr_model", None) or "whisper-1"
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                asr_url,
                headers={"Authorization": f"Bearer {settings.asr_api_key}"},
                files={"file": (f"audio.{ext}", audio_bytes, mime)},
                data={"model": asr_model, "response_format": "json", "language": "en"},
            )
        if resp.status_code == 200:
            body = resp.json()
            return body.get("text") or body.get("transcript") or ""
        logging.getLogger(__name__).warning("ASR upload-time transcription %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logging.getLogger(__name__).warning("ASR upload-time transcription failed: %s", exc)
    return ""


@router.post("/tasks/{task_id}/materials/upload-audio", response_model=MaterialResponse, status_code=201)
async def upload_audio_material(
    task_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Upload an audio file (MP3/WAV/WebM/OGG) and attach it as a material."""
    from app.core.config import settings
    import boto3, uuid as uuid_lib, asyncio, os

    task = await _get_task_for_admin(task_id, current_user, session)

    allowed = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4"}
    if file.content_type and file.content_type.split(";")[0] not in allowed:
        raise HTTPException(400, f"Unsupported audio type: {file.content_type}")

    ext = (file.filename or "audio").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "mp3"
    storage_key = f"materials/{task_id}/{uuid_lib.uuid4()}.{ext}"
    body = await file.read()

    def do_upload():
        boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        ).put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=body,
                     ContentType=file.content_type or "audio/mpeg")

    try:
        await asyncio.get_event_loop().run_in_executor(None, do_upload)
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {e}")

    for old in (await session.execute(
        select(Material).where(Material.task_id == task_id, Material.material_type == "audio")
    )).scalars().all():
        await session.delete(old)

    pub = os.environ.get("S3_PUBLIC_ENDPOINT", settings.s3_endpoint).replace("minio:9000", "localhost:9000")
    audio_url = f"{pub}/{settings.s3_bucket}/{storage_key}"

    # Transcribe the audio at upload time so scoring has a text reference
    transcript = await _transcribe_bytes(body, ext, settings)
    import json as _json
    metadata = _json.dumps({"transcript": transcript}) if transcript else None

    mat = Material(
        task_id=task.id,
        material_type="audio",
        content=audio_url,
        storage_key=storage_key,
        metadata_json=metadata,
    )
    session.add(mat)
    await session.commit()
    return _mat_out(mat)


@router.post("/tasks/{task_id}/materials/upload-document", response_model=MaterialResponse, status_code=201)
async def upload_document_material(
    task_id: UUID,
    file: UploadFile = File(...),
    material_type: str = "resume",
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Upload a PDF or DOCX file and attach it as a material."""
    from app.core.config import settings
    import boto3, uuid as uuid_lib, asyncio, os, json

    task = await _get_task_for_admin(task_id, current_user, session)

    allowed = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }
    ct = (file.content_type or "").split(";")[0]
    if ct and ct not in allowed:
        raise HTTPException(400, f"Only PDF and DOCX are accepted, got: {file.content_type}")

    filename = file.filename or "document"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "pdf"
    storage_key = f"materials/{task_id}/{uuid_lib.uuid4()}.{ext}"
    body = await file.read()

    def do_upload():
        boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        ).put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=body,
                     ContentType=ct or "application/octet-stream")

    try:
        await asyncio.get_event_loop().run_in_executor(None, do_upload)
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {e}")

    pub = os.environ.get("S3_PUBLIC_ENDPOINT", settings.s3_endpoint).replace("minio:9000", "localhost:9000")
    mat = Material(
        task_id=task.id,
        material_type=material_type,
        content=f"{pub}/{settings.s3_bucket}/{storage_key}",
        storage_key=storage_key,
        metadata_json=json.dumps({"filename": filename}),
    )
    session.add(mat)
    await session.commit()
    return _mat_out(mat)


@router.post("/tasks/{task_id}/materials", response_model=MaterialResponse, status_code=201)
async def add_material(
    task_id: UUID,
    data: MaterialCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    task = await _get_task_for_admin(task_id, current_user, session)
    mat = Material(task_id=task.id, material_type=data.material_type, content=data.content,
                   storage_key=data.storage_key, metadata_json=data.metadata_json)
    session.add(mat)
    await session.commit()
    return _mat_out(mat)


@router.put("/materials/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: UUID,
    data: MaterialUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    mat = await _get_material_for_admin(material_id, current_user, session)
    if data.material_type is not None:
        mat.material_type = data.material_type
    if data.content is not None:
        mat.content = data.content
    if data.storage_key is not None:
        mat.storage_key = data.storage_key
    if data.metadata_json is not None:
        mat.metadata_json = data.metadata_json
    await session.commit()
    return _mat_out(mat)


@router.post("/materials/{material_id}/transcribe", response_model=MaterialResponse)
async def transcribe_audio_material(
    material_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """(Re-)transcribe an audio material using the configured ASR service and store the result."""
    from app.core.config import settings
    import boto3, asyncio, json as _json

    mat = await _get_material_for_admin(material_id, current_user, session)
    if mat.material_type != "audio":
        raise HTTPException(400, "Only audio materials can be transcribed")
    if not mat.storage_key:
        raise HTTPException(400, "Material has no storage key — cannot download for transcription")

    # Download from S3
    def do_download():
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        resp = s3.get_object(Bucket=settings.s3_bucket, Key=mat.storage_key)
        return resp["Body"].read()

    try:
        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(None, do_download)
    except Exception as e:
        raise HTTPException(500, f"Failed to download audio from storage: {e}")

    ext = mat.storage_key.rsplit(".", 1)[-1] if "." in mat.storage_key else "mp3"
    transcript = await _transcribe_bytes(audio_bytes, ext, settings)
    if not transcript:
        raise HTTPException(502, "ASR service returned no transcript — check ASR_API_KEY and ASR_API_URL settings")

    existing_meta: dict = {}
    if mat.metadata_json:
        try:
            existing_meta = _json.loads(mat.metadata_json)
        except Exception:
            pass
    existing_meta["transcript"] = transcript
    mat.metadata_json = _json.dumps(existing_meta)
    await session.commit()
    return _mat_out(mat)


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    material_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    mat = await _get_material_for_admin(material_id, current_user, session)
    await session.delete(mat)
    await session.commit()
