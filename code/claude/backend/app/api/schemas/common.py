"""Common schema definitions shared across API endpoints."""
from typing import Generic, TypeVar, Optional, List, Any
from datetime import datetime

from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorResponse(BaseModel):
    """Standard error response format."""
    error: str = Field(..., description="Error type/code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[dict] = Field(default=None, description="Additional error details")


class PaginationParams(BaseModel):
    """Standard pagination parameters."""
    page: int = Field(default=1, ge=1, description="Page number")
    per_page: int = Field(default=20, ge=1, le=100, description="Items per page")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""
    items: List[T] = Field(..., description="List of items")
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total number of pages")


class TimestampMixin(BaseModel):
    """Mixin for timestamps in responses."""
    created_at: Optional[datetime] = Field(default=None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp")


class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service health status")
    version: Optional[str] = Field(default=None, description="API version")


class ReadinessCheckResponse(BaseModel):
    """Readiness check response."""
    status: str = Field(..., description="Service readiness status")
    database: str = Field(..., description="Database connection status")
    redis: str = Field(..., description="Redis connection status")


class ServiceInfoResponse(BaseModel):
    """Service information response."""
    name: str = Field(..., description="Service name")
    version: str = Field(..., description="API version")
    environment: str = Field(..., description="Environment (development/staging/production)")
    documentation: str = Field(..., description="OpenAPI documentation URL")