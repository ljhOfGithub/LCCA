"""Audit and Proctoring event models."""
import uuid

from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class AuditEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "audit_events"

    attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attempts.id"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    attempt: Mapped["Attempt | None"] = relationship("Attempt", back_populates="audit_events")


class ProctoringEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "proctoring_events"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attempts.id"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="low"
    )  # low, medium, high, critical
    event_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    screenshot_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    attempt: Mapped["Attempt"] = relationship("Attempt")

# Avoid circular import
from app.models.attempt import Attempt