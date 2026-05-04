"""JWT and authentication utilities."""
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class UserRole(str, Enum):
    """User roles for RBAC."""
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> "User":
    """Get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = verify_token(token)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    from app.models.user import User
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
        )

    return user


async def get_current_user_optional(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> "User | None":
    """Get the current user if authenticated, otherwise None."""
    try:
        return await get_current_user(token, session)
    except HTTPException:
        return None


def require_role(allowed_roles: list[UserRole]):
    """Dependency to require specific roles."""
    async def role_checker(current_user: "User" = Depends(get_current_user)) -> "User":
        # Get user's role
        from app.models.user import Student, Teacher

        role = get_user_role(current_user)

        if role not in allowed_roles:
            # Admin has all permissions
            if UserRole.ADMIN not in allowed_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied. Required roles: {[r.value for r in allowed_roles]}",
                )
            # Check if admin role is required and user is admin
            if role != UserRole.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied. Required roles: {[r.value for r in allowed_roles]}",
                )

        return current_user

    return role_checker


def require_student():
    """Dependency to require student role."""
    return require_role([UserRole.STUDENT])


def require_teacher():
    """Dependency to require teacher role."""
    return require_role([UserRole.TEACHER, UserRole.ADMIN])


def require_admin():
    """Dependency to require admin role."""
    return require_role([UserRole.ADMIN])


def get_user_role(user: "User") -> UserRole:
    """Determine user's role from their profile."""
    from app.models.user import Student, Teacher

    # Check if user is a teacher
    if user.teacher is not None:
        return UserRole.TEACHER

    # Check if user is a student
    if user.student is not None:
        return UserRole.STUDENT

    # Superusers are admins
    if user.is_superuser:
        return UserRole.ADMIN

    # Default to student if has student profile
    return UserRole.STUDENT


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)