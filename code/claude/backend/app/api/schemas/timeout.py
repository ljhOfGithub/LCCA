"""Timeout-related schema definitions."""
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field


class TimeStatusResponse(BaseModel):
    """Response for attempt time status query."""
    is_expired: bool = Field(..., description="Whether the attempt has expired")
    remaining_seconds: int = Field(..., description="Seconds remaining (can be negative)")
    started_at: Optional[str] = Field(default=None, description="ISO timestamp when started")
    expires_at: Optional[str] = Field(default=None, description="ISO timestamp when expires")
    progress_percentage: Optional[float] = Field(
        default=None,
        description="Percentage of time elapsed"
    )


class FinalizeRequest(BaseModel):
    """Request to finalize an attempt."""
    reason: str = Field(
        default="manual",
        description="Reason: 'manual', 'timeout', or 'admin'"
    )
    confirmation: bool = Field(
        default=True,
        description="Confirmation flag"
    )


class FinalizeResponse(BaseModel):
    """Response for finalization request."""
    id: str = Field(..., description="Attempt UUID")
    status: str = Field(..., description="New status")
    message: str = Field(..., description="Status message")
    submitted_at: Optional[datetime] = Field(
        default=None,
        description="When the attempt was submitted"
    )


class TimeoutConfigResponse(BaseModel):
    """Response for timeout configuration query."""
    attempt_timeout_seconds: int = Field(..., description="Max exam duration in seconds")
    attempt_timeout_minutes: int = Field(..., description="Max exam duration in minutes")
    scoring_timeout_seconds: int = Field(..., description="Max scoring job duration")


class FinalizeStatsResponse(BaseModel):
    """Response for finalization statistics."""
    finalized_count: int = Field(..., description="Number of attempts finalized")
    since_hours: int = Field(..., description="Time window in hours")
    timeout_count: int = Field(default=0, description="Count from timeout triggers")
    manual_count: int = Field(default=0, description="Count from manual submissions")
    auto_submitted_count: int = Field(default=0, description="Count auto-submitted")


class AttemptProgressResponse(BaseModel):
    """Response for attempt progress during exam."""
    attempt_id: str = Field(..., description="Attempt UUID")
    current_task_index: int = Field(..., description="Current task (0-indexed)")
    total_tasks: int = Field(..., description="Total number of tasks")
    completed_tasks: int = Field(default=0, description="Number of completed tasks")
    remaining_seconds: int = Field(..., description="Time remaining")
    task_statuses: dict = Field(
        default_factory=dict,
        description="Status of each task by index"
    )