"""Artifact-related schema definitions."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict


class ArtifactStatus(str, Enum):
    """Artifact status enumeration."""
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"


class ArtifactType(str, Enum):
    """Artifact type enumeration."""
    AUDIO = "audio"
    IMAGE = "image"
    VIDEO = "video"
    DOCUMENT = "document"
    TEXT = "text"


class ArtifactUploadRequest(BaseModel):
    """Request for initiating an artifact upload."""
    task_response_id: UUID = Field(..., description="Task response UUID")
    artifact_type: str = Field(..., description="Type: audio/image/video/document/text")
    filename: str = Field(..., description="Original filename")
    content_type: str = Field(..., description="MIME type")
    size_bytes: int = Field(..., description="File size in bytes")


class UploadUrlResponse(BaseModel):
    """Response with pre-signed upload URL."""
    upload_url: str = Field(..., description="Pre-signed S3/MinIO URL for upload")
    artifact_id: UUID = Field(..., description="Created artifact UUID")
    expires_at: datetime = Field(..., description="Upload URL expiration time")
    method: str = Field(default="PUT", description="HTTP method for upload")


class ArtifactUploadResponse(BaseModel):
    """Response for artifact upload completion."""
    id: UUID = Field(..., description="Artifact UUID")
    task_response_id: UUID = Field(..., description="Associated task response")
    status: str = Field(..., description="Upload status")
    s3_key: str = Field(..., description="S3 object key")
    filename: str = Field(..., description="Original filename")
    size_bytes: int = Field(..., description="File size")
    content_type: str = Field(..., description="MIME type")
    url: Optional[str] = Field(default=None, description="Access URL (for completed uploads)")
    created_at: datetime = Field(..., description="Upload initiation time")

    model_config = ConfigDict(from_attributes=True)


class ArtifactResponse(BaseModel):
    """Response for artifact details."""
    id: UUID = Field(..., description="Artifact UUID")
    task_response_id: UUID = Field(..., description="Task response UUID")
    type: str = Field(..., description="Artifact type")
    status: str = Field(..., description="Upload status")
    filename: str = Field(..., description="Original filename")
    size_bytes: int = Field(..., description="File size")
    s3_key: str = Field(..., description="S3 key")
    content_type: str = Field(..., description="MIME type")
    transcription: Optional[str] = Field(default=None, description="ASR transcription (for audio)")
    url: Optional[str] = Field(default=None, description="Access URL")
    created_at: datetime = Field(..., description="Creation time")
    updated_at: datetime = Field(..., description="Last update time")

    model_config = ConfigDict(from_attributes=True)


class ArtifactListResponse(BaseModel):
    """Response for listing artifacts."""
    items: List[ArtifactResponse] = Field(..., description="List of artifacts")
    total: int = Field(..., description="Total count")


class ArtifactDeleteResponse(BaseModel):
    """Response for artifact deletion."""
    id: UUID = Field(..., description="Deleted artifact UUID")
    message: str = Field(..., description="Deletion status message")


class AudioTranscriptionRequest(BaseModel):
    """Request for audio transcription."""
    artifact_id: UUID = Field(..., description="Audio artifact UUID")
    language: str = Field(default="en", description="Audio language code")


class AudioTranscriptionResponse(BaseModel):
    """Response for audio transcription."""
    artifact_id: UUID = Field(..., description="Artifact UUID")
    transcription: str = Field(..., description="Transcribed text")
    language: str = Field(..., description="Detected language")
    confidence: float = Field(..., description="Confidence score")
    duration_seconds: float = Field(..., description="Audio duration")