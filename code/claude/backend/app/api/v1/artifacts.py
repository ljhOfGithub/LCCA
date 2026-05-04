"""S3 artifact upload endpoints.

OpenAPI contract:
- POST /api/v1/artifacts/upload-url - Get presigned upload URL
- POST /api/v1/artifacts/{id}/confirm - Confirm upload completion
- GET /api/v1/artifacts/{id} - Get artifact details
- DELETE /api/v1/artifacts/{id} - Delete artifact
"""
from typing import Annotated
from uuid import UUID
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.models.artifact import ResponseArtifact
from app.api.schemas.artifacts import (
    ArtifactUploadRequest,
    UploadUrlResponse,
    ArtifactResponse,
    ArtifactUploadResponse,
    ArtifactDeleteResponse,
)
from app.core.security import get_current_user
from app.core.status import ArtifactStatus

router = APIRouter()


def generate_s3_key(task_response_id: UUID, filename: str, artifact_type: str) -> str:
    """Generate S3 key for an artifact."""
    import uuid
    ext = filename.split(".")[-1] if "." in filename else ""
    unique_id = str(uuid.uuid4())
    return f"responses/{task_response_id}/{unique_id}.{ext}"


@router.post("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    data: ArtifactUploadRequest,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> UploadUrlResponse:
    """Get a presigned URL for uploading an artifact to S3.

    The client should:
    1. Call this endpoint to get a presigned URL
    2. PUT the file directly to S3 using the presigned URL
    3. Call /confirm to mark the upload as complete
    """
    from app.core.config import settings

    # Verify task response exists and belongs to user
    from app.models.attempt import TaskResponse, Attempt
    from app.models.user import Student

    tr_result = await session.execute(
        select(TaskResponse).where(TaskResponse.id == data.task_response_id)
    )
    task_response = tr_result.scalar_one_or_none()

    if not task_response:
        raise HTTPException(status_code=404, detail="Task response not found")

    # Get attempt and verify ownership
    attempt_result = await session.execute(
        select(Attempt).where(Attempt.id == task_response.attempt_id)
    )
    attempt = attempt_result.scalar_one_or_none()

    if attempt:
        student_result = await session.execute(
            select(Student.id).where(Student.user_id == current_user.id)
        )
        student_id = student_result.scalar_one_or_none()

        # Check authorization (admin/teacher can also upload for any response)
        from app.core.security import get_user_role, UserRole
        role = get_user_role(current_user)
        if role == UserRole.STUDENT and student_id != attempt.student_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Generate S3 key
    s3_key = generate_s3_key(data.task_response_id, data.filename, data.artifact_type)

    # Create artifact record
    artifact = ResponseArtifact(
        task_response_id=data.task_response_id,
        artifact_type=data.artifact_type,
        storage_key=s3_key,
        filename=data.filename,
        mime_type=data.content_type,
        file_size_bytes=data.size_bytes,
        status=ArtifactStatus.UPLOADING,
    )
    session.add(artifact)
    await session.flush()
    await session.refresh(artifact)

    # Generate presigned URL (placeholder - implement with boto3)
    # In production, use boto3:
    # import boto3
    # s3_client = boto3.client(
    #     's3',
    #     endpoint_url=settings.s3_endpoint,
    #     aws_access_key_id=settings.s3_access_key,
    #     aws_secret_access_key=settings.s3_secret_key,
    # )
    # presigned_url = s3_client.generate_presigned_url(
    #     'put_object',
    #     Params={
    #         'Bucket': settings.s3_bucket,
    #         'Key': s3_key,
    #         'ContentType': data.content_type,
    #     },
    #     ExpiresIn=3600,
    # )

    upload_url = f"{settings.s3_endpoint}/{settings.s3_bucket}/{s3_key}"
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    return UploadUrlResponse(
        upload_url=upload_url,
        artifact_id=artifact.id,
        expires_at=expires_at,
        method="PUT",
    )


@router.post("/{artifact_id}/confirm", response_model=ArtifactResponse)
async def confirm_upload(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> ArtifactResponse:
    """Confirm that an upload has been completed.

    After the client successfully uploads to S3, they call this
    to mark the artifact as uploaded.
    """
    result = await session.execute(
        select(ResponseArtifact).where(ResponseArtifact.id == artifact_id)
    )
    artifact = result.scalar_one_or_none()

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    # Verify ownership
    from app.models.attempt import TaskResponse, Attempt
    from app.models.user import Student

    tr_result = await session.execute(
        select(TaskResponse).where(TaskResponse.id == artifact.task_response_id)
    )
    task_response = tr_result.scalar_one_or_none()

    if task_response:
        attempt_result = await session.execute(
            select(Attempt).where(Attempt.id == task_response.attempt_id)
        )
        attempt = attempt_result.scalar_one_or_none()

        if attempt:
            student_result = await session.execute(
                select(Student.id).where(Student.user_id == current_user.id)
            )
            student_id = student_result.scalar_one_or_none()

            from app.core.security import get_user_role, UserRole
            role = get_user_role(current_user)
            if role == UserRole.STUDENT and student_id != attempt.student_id:
                raise HTTPException(status_code=403, detail="Not authorized")

    artifact.status = ArtifactStatus.UPLOADED
    await session.commit()
    await session.refresh(artifact)

    return ArtifactResponse(
        id=artifact.id,
        task_response_id=artifact.task_response_id,
        type=artifact.artifact_type,
        status=artifact.status.value,
        filename=artifact.filename,
        size_bytes=artifact.file_size_bytes or 0,
        s3_key=artifact.storage_key,
        content_type=artifact.mime_type or "",
        url=f"https://{artifact.storage_key}",  # TODO: Generate signed URL
        created_at=artifact.created_at,
        updated_at=artifact.updated_at,
    )


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> ArtifactResponse:
    """Get artifact details."""
    result = await session.execute(
        select(ResponseArtifact).where(ResponseArtifact.id == artifact_id)
    )
    artifact = result.scalar_one_or_none()

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    return ArtifactResponse(
        id=artifact.id,
        task_response_id=artifact.task_response_id,
        type=artifact.artifact_type,
        status=artifact.status.value,
        filename=artifact.filename,
        size_bytes=artifact.file_size_bytes or 0,
        s3_key=artifact.storage_key,
        content_type=artifact.mime_type or "",
        url=f"https://{artifact.storage_key}",
        created_at=artifact.created_at,
        updated_at=artifact.updated_at,
    )


@router.delete("/{artifact_id}", response_model=ArtifactDeleteResponse)
async def delete_artifact(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Annotated = Depends(get_current_user),
) -> ArtifactDeleteResponse:
    """Delete an artifact.

    Only the owner or admin can delete artifacts.
    """
    result = await session.execute(
        select(ResponseArtifact).where(ResponseArtifact.id == artifact_id)
    )
    artifact = result.scalar_one_or_none()

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    # Verify ownership
    from app.models.attempt import TaskResponse, Attempt
    from app.models.user import Student

    tr_result = await session.execute(
        select(TaskResponse).where(TaskResponse.id == artifact.task_response_id)
    )
    task_response = tr_result.scalar_one_or_none()

    if task_response:
        attempt_result = await session.execute(
            select(Attempt).where(Attempt.id == task_response.attempt_id)
        )
        attempt = attempt_result.scalar_one_or_none()

        if attempt:
            student_result = await session.execute(
                select(Student.id).where(Student.user_id == current_user.id)
            )
            student_id = student_result.scalar_one_or_none()

            from app.core.security import get_user_role, UserRole
            role = get_user_role(current_user)
            if role == UserRole.STUDENT and student_id != attempt.student_id:
                raise HTTPException(status_code=403, detail="Not authorized")

    # TODO: Delete from S3

    await session.delete(artifact)
    await session.commit()

    return ArtifactDeleteResponse(
        id=artifact_id,
        message="Artifact deleted successfully",
    )