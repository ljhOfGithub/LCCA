"""Scenario and task schema definitions."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict


class TaskTypeEnum(str, Enum):
    """Task type enumeration."""
    READING = "reading"
    WRITING = "writing"
    LISTENING = "listening"
    SPEAKING = "speaking"


class ScenarioStatus(str, Enum):
    """Scenario status enumeration."""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ScenarioResponse(BaseModel):
    """Response model for a scenario."""
    id: UUID = Field(..., description="Scenario UUID")
    title: str = Field(..., description="Scenario title")
    description: str = Field(..., description="Scenario description")
    status: str = Field(..., description="Status: draft/published/archived")
    duration_minutes: int = Field(..., description="Expected duration in minutes")
    total_tasks: int = Field(..., description="Number of tasks")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    tags: List[str] = Field(default_factory=list, description="Scenario tags")

    model_config = ConfigDict(from_attributes=True)


class ScenarioListResponse(BaseModel):
    """Response for listing scenarios."""
    items: List[ScenarioResponse] = Field(..., description="List of scenarios")
    total: int = Field(..., description="Total count")
    page: int = Field(..., description="Current page")
    per_page: int = Field(..., description="Items per page")


class ScenarioDetailResponse(BaseModel):
    """Detailed scenario with tasks."""
    id: UUID = Field(..., description="Scenario UUID")
    title: str = Field(..., description="Scenario title")
    description: str = Field(..., description="Full description")
    instructions: str = Field(..., description="General instructions for candidates")
    status: str = Field(..., description="Status")
    duration_minutes: int = Field(..., description="Duration in minutes")
    tasks: List["TaskResponse"] = Field(..., description="List of tasks")
    tags: List[str] = Field(default_factory=list, description="Tags")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class PromptContent(BaseModel):
    """Content of a prompt/prompt segment."""
    type: str = Field(..., description="Content type: text/audio/image")
    content: str = Field(..., description="Content value or URL")
    duration_seconds: Optional[int] = Field(default=None, description="For audio content")


class PromptResponse(BaseModel):
    """Response for a task prompt."""
    id: UUID = Field(..., description="Prompt UUID")
    task_id: UUID = Field(..., description="Associated task UUID")
    content: List[PromptContent] = Field(..., description="Prompt content segments")
    time_limit_seconds: Optional[int] = Field(default=None, description="Time limit for this task")
    max_words: Optional[int] = Field(default=None, description="Maximum word count (for writing)")
    max_duration_seconds: Optional[int] = Field(default=None, description="Max duration (for speaking/listening)")

    model_config = ConfigDict(from_attributes=True)


class RubricCriterion(BaseModel):
    """Scoring rubric criterion."""
    name: str = Field(..., description="Criterion name")
    description: str = Field(..., description="Criterion description")
    max_score: float = Field(..., description="Maximum score for this criterion")
    levels: dict = Field(..., description="Score levels with descriptions")


class RubricResponse(BaseModel):
    """Response for scoring rubric."""
    id: UUID = Field(..., description="Rubric UUID")
    task_id: UUID = Field(..., description="Associated task UUID")
    criteria: List[RubricCriterion] = Field(..., description="Scoring criteria")

    model_config = ConfigDict(from_attributes=True)


class TaskResponse(BaseModel):
    """Response model for a task."""
    id: UUID = Field(..., description="Task UUID")
    scenario_id: UUID = Field(..., description="Parent scenario UUID")
    index: int = Field(..., description="Task order index (0-based)")
    type: str = Field(..., description="Task type")
    title: str = Field(..., description="Task title")
    description: str = Field(..., description="Task description")
    time_limit_seconds: Optional[int] = Field(default=None, description="Task-specific time limit")
    max_score: float = Field(..., description="Maximum possible score")
    has_prompt: bool = Field(default=True, description="Whether task has a prompt")
    has_rubric: bool = Field(default=True, description="Whether task has a rubric")

    model_config = ConfigDict(from_attributes=True)


class TaskDetailResponse(BaseModel):
    """Detailed task with prompt and rubric."""
    id: UUID = Field(..., description="Task UUID")
    scenario_id: UUID = Field(..., description="Parent scenario UUID")
    index: int = Field(..., description="Task order index")
    type: str = Field(..., description="Task type")
    title: str = Field(..., description="Task title")
    description: str = Field(..., description="Full task description")
    instructions: str = Field(..., description="Detailed instructions")
    time_limit_seconds: Optional[int] = Field(default=None, description="Time limit")
    max_score: float = Field(..., description="Maximum score")
    prompt: Optional[PromptResponse] = Field(default=None, description="Task prompt")
    rubric: Optional[RubricResponse] = Field(default=None, description="Scoring rubric")

    model_config = ConfigDict(from_attributes=True)


class TaskListResponse(BaseModel):
    """Response for listing tasks."""
    items: List[TaskResponse] = Field(..., description="List of tasks")
    total: int = Field(..., description="Total count")


# Create/Update schemas for teacher endpoints
class ScenarioCreate(BaseModel):
    """Request body for creating a scenario."""
    title: str = Field(..., min_length=1, max_length=255, description="Scenario title")
    description: Optional[str] = Field(default=None, description="Scenario description")
    instructions: Optional[str] = Field(default=None, description="Instructions for candidates")


class ScenarioUpdate(BaseModel):
    """Request body for updating a scenario."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    instructions: Optional[str] = Field(default=None)


class TaskCreate(BaseModel):
    """Request body for creating a task."""
    title: str = Field(..., min_length=1, max_length=255, description="Task title")
    description: Optional[str] = Field(default=None, description="Task description")
    task_type: TaskTypeEnum = Field(..., description="Task type")
    time_limit_seconds: Optional[int] = Field(default=None, ge=60, description="Time limit in seconds")


class TaskUpdate(BaseModel):
    """Request body for updating a task."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    time_limit_seconds: Optional[int] = Field(default=None, ge=60)
    sequence_order: Optional[int] = Field(default=None, ge=0)


class RubricCreate(BaseModel):
    """Request body for creating a rubric."""
    task_id: UUID = Field(..., description="Task UUID")
    name: str = Field(..., min_length=1, max_length=255, description="Rubric name")


class CriterionCreate(BaseModel):
    """Request body for creating/updating a criterion."""
    name: str = Field(..., min_length=1, max_length=255, description="Criterion name")
    description: Optional[str] = Field(default=None, description="Criterion description")
    max_score: float = Field(..., gt=0, description="Maximum score for this criterion")
    weight: float = Field(default=1.0, gt=0, description="Weight for aggregation")


class MaterialCreate(BaseModel):
    """Request body for creating a material."""
    material_type: str = Field(..., description="Material type: reading_passage, audio, image, video")
    content: Optional[str] = Field(default=None, description="Text content or URL")
    storage_key: Optional[str] = Field(default=None, description="S3 key for files")
    metadata_json: Optional[str] = Field(default=None, description="JSON metadata")


# Update forward reference
ScenarioDetailResponse.model_rebuild()