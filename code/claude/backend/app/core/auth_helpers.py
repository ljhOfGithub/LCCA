"""Shared auth utilities.

Design:
  Admin  (is_superuser=True) — owns scenarios directly via user.id; no teacher profile.
  Teacher (teacher table row) — reviews/scores; can see all scenarios but cannot create/edit.
  Student (student table row) — takes exams.
"""
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import Teacher, User


async def get_teacher_profile(user: User, session: AsyncSession) -> Teacher:
    """Return teacher profile. Raises 403 for non-teacher users (including admin)."""
    result = await session.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a teacher",
        )
    return teacher


def assert_can_modify_scenario(user: User, scenario_created_by_user_id: UUID) -> None:
    """Raise 403 unless user is admin or owns the scenario.

    After the 003 migration, scenarios.created_by_id references users.id directly.
    Admin (is_superuser) bypasses the check entirely.
    """
    if user.is_superuser:
        return
    if scenario_created_by_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this resource",
        )
