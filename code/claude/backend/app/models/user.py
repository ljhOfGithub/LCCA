"""User, Admin, Student, Teacher models."""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security import hash_password, verify_password
from app.models.base import Base, UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.attempt import Attempt


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    admin: Mapped["Admin | None"] = relationship("Admin", back_populates="user", uselist=False)
    student: Mapped["Student | None"] = relationship("Student", back_populates="user", uselist=False)
    teacher: Mapped["Teacher | None"] = relationship("Teacher", back_populates="user", uselist=False)

    def verify_password(self, plain_password: str) -> bool:
        return verify_password(plain_password, self.hashed_password)

    def set_password(self, password: str) -> None:
        self.hashed_password = hash_password(password)


class Admin(Base, UUIDMixin, TimestampMixin):
    """Admin profile — exists for every user that has admin role."""
    __tablename__ = "admins"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True
    )

    user: Mapped["User"] = relationship("User", back_populates="admin")


class Student(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "students"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    student_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="student")
    attempts: Mapped[list["Attempt"]] = relationship("Attempt", back_populates="student")


class Teacher(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "teachers"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    employee_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="teacher")
