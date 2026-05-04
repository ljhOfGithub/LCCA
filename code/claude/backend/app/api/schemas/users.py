"""User and authentication schema definitions."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, EmailStr, ConfigDict


class UserRole(str, Enum):
    """User role enumeration."""
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"
    GRADER = "grader"


class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr = Field(..., description="User email address")
    full_name: str = Field(..., description="User full name")
    role: str = Field(..., description="User role")


class UserResponse(UserBase):
    """Response model for user data."""
    id: UUID = Field(..., description="User UUID")
    is_active: bool = Field(..., description="Whether user is active")
    is_verified: bool = Field(..., description="Whether email is verified")
    created_at: datetime = Field(..., description="Account creation time")
    last_login: Optional[datetime] = Field(default=None, description="Last login time")

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    """Request body for user registration."""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    full_name: str = Field(..., min_length=1, max_length=100, description="Full name")
    role: str = Field(default="student", description="User role")

    model_config = ConfigDict(str_strip_whitespace=True)


class UserUpdate(BaseModel):
    """Request body for updating user data."""
    full_name: Optional[str] = Field(default=None, max_length=100, description="Full name")
    password: Optional[str] = Field(default=None, min_length=8, description="New password")
    is_active: Optional[bool] = Field(default=None, description="Active status")


class LoginRequest(BaseModel):
    """Request body for user login."""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="User password")


class TokenResponse(BaseModel):
    """Response for successful authentication."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token lifetime in seconds")
    refresh_token: Optional[str] = Field(default=None, description="Refresh token")
    user: UserResponse = Field(..., description="User data")


class TokenRefreshRequest(BaseModel):
    """Request body for token refresh."""
    refresh_token: str = Field(..., description="Refresh token")


class PasswordResetRequest(BaseModel):
    """Request body for password reset request."""
    email: EmailStr = Field(..., description="User email")


class PasswordResetConfirm(BaseModel):
    """Request body for password reset confirmation."""
    token: str = Field(..., description="Reset token from email")
    new_password: str = Field(..., min_length=8, description="New password")


class UserListResponse(BaseModel):
    """Response for listing users."""
    items: List[UserResponse] = Field(..., description="List of users")
    total: int = Field(..., description="Total count")
    page: int = Field(..., description="Current page")
    per_page: int = Field(..., description="Items per page")


class UserStatsResponse(BaseModel):
    """User statistics response."""
    user_id: UUID = Field(..., description="User UUID")
    total_attempts: int = Field(..., description="Total exam attempts")
    completed_attempts: int = Field(..., description="Completed attempts")
    average_score: Optional[float] = Field(default=None, description="Average score")
    best_score: Optional[float] = Field(default=None, description="Best score")