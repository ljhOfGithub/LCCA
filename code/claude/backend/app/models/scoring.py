"""Scoring models: ScoreRun, ScoreDetail, AttemptResult."""
import uuid
from datetime import datetime

from sqlalchemy import String, Text, ForeignKey, Float, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.status import ScoreRunStatus
from app.models.base import Base, UUIDMixin, TimestampMixin


class ScoreRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "score_runs"

    task_response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_responses.id"), nullable=False, index=True
    )
    status: Mapped[ScoreRunStatus] = mapped_column(
        SAEnum(ScoreRunStatus, name="score_run_status", native_enum=False),
        default=ScoreRunStatus.PENDING,
        nullable=False,
        index=True,
    )
    run_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    run_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_llm_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_template_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    task_response: Mapped["TaskResponse"] = relationship("TaskResponse")
    score_details: Mapped[list["ScoreDetail"]] = relationship(
        "ScoreDetail", back_populates="score_run", lazy="selectin"
    )


class ScoreDetail(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "score_details"

    score_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("score_runs.id"), nullable=False, index=True
    )
    task_response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_responses.id"), nullable=False, index=True
    )
    criterion_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("criteria.id"), nullable=True, index=True
    )
    criterion_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Teacher override fields
    is_teacher_reviewed: Mapped[bool] = mapped_column(default=False, nullable=False)
    teacher_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    teacher_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    score_run: Mapped["ScoreRun"] = relationship("ScoreRun", back_populates="score_details")
    task_response: Mapped["TaskResponse"] = relationship("TaskResponse", back_populates="score_details")
    criterion: Mapped["Criterion | None"] = relationship("Criterion")


class AttemptResult(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "attempt_results"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attempts.id"), unique=True, nullable=False, index=True
    )
    cefr_level: Mapped[str] = mapped_column(String(10), nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False)
    overall_score_max: Mapped[float] = mapped_column(Float, nullable=False)
    band_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    teacher_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_finalized: Mapped[bool] = mapped_column(default=False, nullable=False)

    attempt: Mapped["Attempt"] = relationship("Attempt", back_populates="result")


# Avoid circular import
from app.models.attempt import TaskResponse
from app.models.rubric import Criterion