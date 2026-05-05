"""Shared auth utilities — single source of truth for teacher/admin permission logic."""
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import Teacher, User


async def get_or_create_teacher_profile(user: User, session: AsyncSession) -> Teacher:
    """Return teacher profile for any authenticated user.

    Superusers (admin) get a profile auto-created on first call so they can own
    scenarios without a pre-existing teacher record.
    """
    result = await session.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        if user.is_superuser:
            teacher = Teacher(user_id=user.id)
            session.add(teacher)
            await session.flush()
            await session.refresh(teacher)
            return teacher
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a teacher",
        )
    return teacher


def is_admin(user: User) -> bool:
    return user.is_superuser


def assert_can_modify_scenario(user: User, scenario_created_by_id: UUID, teacher_id: UUID) -> None:
    """Raise 403 if non-admin user doesn't own the scenario."""
    if user.is_superuser:
        return
    if scenario_created_by_id != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this resource",
        )
