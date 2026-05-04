"""Attempt-related schema definitions."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class AttemptCreate(BaseModel):
    """Request body for creating a new attempt."""
    scenario_id: UUID = Field(..., description="UUID of the scenario/exam to take")

    model_config = ConfigDict(str_strip_whitespace=True)


class AttemptResponse(BaseModel):
    """Response model for attempt creation."""
    id: UUID = Field(..., description="Unique identifier of the created attempt")
    student_id: UUID = Field(..., description="Student UUID")
    scenario_id: UUID = Field(..., description="Scenario UUID")
    status: str = Field(..., description="Current attempt status")

    model_config = ConfigDict(from_attributes=True)


class TaskResponseInfo(BaseModel):
    """Brief info about a task response."""
    id: UUID = Field(..., description="Task response UUID")
    task_id: UUID = Field(..., description="Task UUID")
    status: str = Field(..., description="Response status")
    started_at: Optional[datetime] = Field(default=None, description="When student started this task")
    submitted_at: Optional[datetime] = Field(default=None, description="When student submitted this task")

    model_config = ConfigDict(from_attributes=True)


class AttemptDetailResponse(BaseModel):
    """Detailed response for a single attempt."""
    id: UUID = Field(..., description="Unique identifier")
    student_id: UUID = Field(..., description="Student UUID")
    scenario_id: UUID = Field(..., description="Scenario UUID")
    status: str = Field(..., description="Current status")
    started_at: Optional[datetime] = Field(default=None, description="When exam started")
    submitted_at: Optional[datetime] = Field(default=None, description="When exam was submitted")
    scored_at: Optional[datetime] = Field(default=None, description="When scoring completed")
    created_at: datetime = Field(..., description="Record creation time")
    updated_at: datetime = Field(..., description="Last update time")
    task_responses: List[TaskResponseInfo] = Field(
        default_factory=list,
        description="List of task responses"
    )

    model_config = ConfigDict(from_attributes=True)


class AttemptListResponse(BaseModel):
    """Response for listing attempts with pagination."""
    items: List[AttemptResponse] = Field(..., description="List of attempts")
    total: int = Field(..., description="Total number of attempts")
    page: int = Field(..., description="Current page")
    per_page: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total pages")


class AttemptStatusUpdate(BaseModel):
    """Request to update attempt status."""
    status: str = Field(..., description="New status value")

    model_config = ConfigDict(str_strip_whitespace=True)


class AttemptStartRequest(BaseModel):
    """Request to start an attempt."""
    scenario_id: UUID = Field(..., description="ID of scenario to start")

    model_config = ConfigDict(str_strip_whitespace=True)


class AttemptSubmitRequest(BaseModel):
    """Request to submit an attempt."""
    confirmation: bool = Field(
        default=True,
        description="Confirmation that student wants to submit"
    )
    reason: Optional[str] = Field(
        default=None,
        description="Optional reason for submission (manual/timeout)"
    )