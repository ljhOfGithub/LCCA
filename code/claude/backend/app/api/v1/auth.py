"""Authentication endpoints: login, register, password management."""
from datetime import datetime, timedelta
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import (
    UserRole,
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    require_teacher,
    verify_password,
)
from app.db.session import get_session
from app.models.user import Student, Teacher, User

router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str | None = None
    role: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # "student" or "teacher"
    student_number: str | None = None
    employee_number: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    is_superuser: bool
    role: str
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    session: AsyncSession = Depends(get_session),
):
    """Authenticate user and return JWT token."""
    # Find user by email
    result = await session.execute(
        select(User).where(User.email == login_data.email).options(
            selectinload(User.admin),
            selectinload(User.teacher),
            selectinload(User.student),
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
        )

    # Determine role — admins table takes precedence
    role = "student"
    if user.admin is not None or user.is_superuser:
        role = "admin"
    elif user.teacher is not None:
        role = "teacher"
    elif user.student is not None:
        role = "student"

    # Create access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": role},
        expires_delta=access_token_expires,
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/register", response_model=UserResponse)
async def register(
    user_data: UserCreate,
    session: AsyncSession = Depends(get_session),
):
    """Register a new user."""
    # Check if email already exists
    result = await session.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Validate role
    if user_data.role not in ("student", "teacher"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'student' or 'teacher'",
        )

    # Create user
    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
    )
    user.set_password(user_data.password)

    session.add(user)
    await session.flush()

    # Create role-specific profile
    if user_data.role == "student":
        student = Student(user_id=user.id, student_number=user_data.student_number)
        session.add(student)
    elif user_data.role == "teacher":
        teacher = Teacher(user_id=user.id, employee_number=user_data.employee_number)
        session.add(teacher)

    await session.commit()
    await session.refresh(user)

    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        role=user_data.role,
    )


def _build_user_response(current_user: User) -> UserResponse:
    role = "student"
    if getattr(current_user, 'admin', None) is not None or current_user.is_superuser:
        role = "admin"
    elif current_user.teacher is not None:
        role = "teacher"
    elif current_user.student is not None:
        role = "student"
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_superuser=current_user.is_superuser,
        role=role,
        created_at=current_user.created_at,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile."""
    return _build_user_response(current_user)


@router.get("/users/me", response_model=UserResponse)
async def get_me_alias(current_user: User = Depends(get_current_user)):
    """Alias for /me — kept for backwards compatibility."""
    return _build_user_response(current_user)


@router.post("/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Change user's password."""
    if not verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    current_user.set_password(new_password)
    await session.commit()

    return {"message": "Password changed successfully"}


@router.post("/admin/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """Deactivate a user account. Admin only."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user.is_active = False
    await session.commit()

    return {"message": "User deactivated successfully"}