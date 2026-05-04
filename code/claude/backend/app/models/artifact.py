"""ResponseArtifact model for uploaded files."""
import uuid

from sqlalchemy import String, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.status import ArtifactStatus
from app.models.base import Base, UUIDMixin, TimestampMixin


class ResponseArtifact(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "response_artifacts"

    task_response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_responses.id"), nullable=False, index=True
    )
    artifact_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # audio, document, image
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[ArtifactStatus] = mapped_column(
        SAEnum(ArtifactStatus, name="artifact_status", create_constraint=True),
        default=ArtifactStatus.UPLOADING,
        nullable=False,
        index=True,
    )

    task_response: Mapped["TaskResponse"] = relationship(
        "TaskResponse", back_populates="artifacts"
    )

# Avoid circular import
from app.models.attempt import TaskResponse