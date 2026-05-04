"""Attempt and TaskResponse models."""
import uuid
from datetime import datetime

from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.status import AttemptStatus, TaskResponseStatus
from app.models.base import Base, UUIDMixin, TimestampMixin


class Attempt(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "attempts"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scenarios.id"), nullable=False, index=True
    )
    status: Mapped[AttemptStatus] = mapped_column(
        SAEnum(AttemptStatus, name="attempt_status", create_constraint=True),
        default=AttemptStatus.CREATED,
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped["Student"] = relationship("Student", back_populates="attempts")
    scenario: Mapped["Scenario"] = relationship("Scenario")
    task_responses: Mapped[list["TaskResponse"]] = relationship(
        "TaskResponse", back_populates="attempt", lazy="selectin"
    )
    result: Mapped["AttemptResult | None"] = relationship(
        "AttemptResult", back_populates="attempt", uselist=False
    )
    audit_events: Mapped[list["AuditEvent"]] = relationship("AuditEvent", back_populates="attempt")


class TaskResponse(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "task_responses"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attempts.id"), nullable=False, index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False, index=True
    )
    status: Mapped[TaskResponseStatus] = mapped_column(
        SAEnum(TaskResponseStatus, name="task_response_status", create_constraint=True),
        default=TaskResponseStatus.NOT_STARTED,
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    attempt: Mapped["Attempt"] = relationship("Attempt", back_populates="task_responses")
    task: Mapped["Task"] = relationship("Task")
    artifacts: Mapped[list["ResponseArtifact"]] = relationship(
        "ResponseArtifact", back_populates="task_response"
    )
    score_details: Mapped[list["ScoreDetail"]] = relationship(
        "ScoreDetail", back_populates="task_response"
    )