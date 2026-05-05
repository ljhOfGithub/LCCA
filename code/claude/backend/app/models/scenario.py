"""Scenario, Task, Material models."""
import uuid

from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Float
from sqlalchemy import ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.status import TaskType, ScenarioStatus
from app.models.base import Base, UUIDMixin, TimestampMixin


class Scenario(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "scenarios"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ScenarioStatus] = mapped_column(
        SAEnum(ScenarioStatus, name="scenario_status", create_constraint=True),
        default=ScenarioStatus.DRAFT,
        nullable=False,
        index=True,
    )

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=False
    )

    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="scenario", lazy="selectin")
    created_by: Mapped["Teacher"] = relationship("Teacher", back_populates="scenarios")


class Task(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tasks"

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scenarios.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_type: Mapped[TaskType] = mapped_column(
        SAEnum(TaskType, name="task_type", create_constraint=True),
        nullable=False,
    )
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    scenario: Mapped["Scenario"] = relationship("Scenario", back_populates="tasks")
    materials: Mapped[list["Material"]] = relationship(
        "Material", back_populates="task", lazy="selectin"
    )
    rubric: Mapped["Rubric | None"] = relationship(
        "Rubric", back_populates="task", uselist=False, lazy="selectin"
    )


class Material(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "materials"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False, index=True
    )
    material_type: Mapped[str] = mapped_column(String(50), nullable=False)  # reading_passage, audio, etc.
    content: Mapped[str | None] = mapped_column(Text, nullable=True)  # text content or URL
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)  # S3 key for files
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON metadata

    task: Mapped["Task"] = relationship("Task", back_populates="materials")