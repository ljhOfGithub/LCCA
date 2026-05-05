"""Rubric and PromptTemplate models."""
import uuid

from sqlalchemy import String, Text, ForeignKey, Float, Integer, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class Rubric(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "rubrics"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    task: Mapped["Task"] = relationship("Task", back_populates="rubric")
    criteria: Mapped[list["Criterion"]] = relationship(
        "Criterion", back_populates="rubric", lazy="selectin"
    )


class Criterion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "criteria"

    rubric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rubrics.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain: Mapped[str | None] = mapped_column(String(100), nullable=True)
    competence: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cefr_descriptors: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    rubric: Mapped["Rubric"] = relationship("Rubric", back_populates="criteria")


class PromptTemplate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "prompt_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    template_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # scoring, feedback, evaluation
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="gpt-4o")
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    api_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


# Avoid circular import
from app.models.scenario import Task