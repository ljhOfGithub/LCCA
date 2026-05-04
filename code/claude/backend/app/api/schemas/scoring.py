"""Scoring-related schema definitions."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class ScoreRunCreate(BaseModel):
    """Request body for creating a score run."""
    attempt_id: UUID = Field(..., description="UUID of the attempt to score")
    scoring_type: str = Field(
        default="auto",
        description="Type of scoring: 'auto' (LLM) or 'manual' (human)"
    )
    priority: int = Field(
        default=0,
        ge=0,
        le=10,
        description="Job priority (higher = sooner)"
    )


class ScoreDetailResponse(BaseModel):
    """Individual score detail for a task response."""
    id: UUID = Field(..., description="Score detail UUID")
    task_response_id: UUID = Field(..., description="Associated task response UUID")
    criterion: str = Field(..., description="Scoring criterion name")
    score: float = Field(..., description="Score value")
    max_score: float = Field(..., description="Maximum possible score")
    feedback: Optional[str] = Field(default=None, description="LLM feedback text")
    created_at: datetime = Field(..., description="When scoring was completed")

    model_config = ConfigDict(from_attributes=True)


class ScoreRunResponse(BaseModel):
    """Response for a single score run."""
    id: UUID = Field(..., description="Score run UUID")
    attempt_id: UUID = Field(..., description="Attempt UUID")
    status: str = Field(..., description="Run status: pending/running/completed/failed")
    scoring_type: str = Field(..., description="Type: auto or manual")
    error_message: Optional[str] = Field(default=None, description="Error if failed")
    created_at: Optional[datetime] = Field(default=None, description="Job creation time")
    completed_at: Optional[datetime] = Field(default=None, description="Job completion time")
    total_score: Optional[float] = Field(default=None, description="Overall score")
    max_score: Optional[float] = Field(default=None, description="Maximum possible score")
    score_details: List[ScoreDetailResponse] = Field(
        default_factory=list,
        description="Individual score breakdowns"
    )

    model_config = ConfigDict(from_attributes=True)


class ScoreRunListResponse(BaseModel):
    """Response for listing score runs with pagination."""
    items: List[ScoreRunResponse] = Field(..., description="List of score runs")
    total: int = Field(..., description="Total number of score runs")
    page: int = Field(..., description="Current page")
    per_page: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total pages")


class TriggerScoringRequest(BaseModel):
    """Request to trigger a scoring job."""
    attempt_id: UUID = Field(..., description="UUID of attempt to score")
    scoring_type: str = Field(
        default="auto",
        description="'auto' for LLM scoring, 'manual' to queue for human review"
    )
    priority: int = Field(default=5, ge=0, le=10, description="Job priority")


class TriggerScoringResponse(BaseModel):
    """Response for triggered scoring job."""
    job_id: str = Field(..., description="ARQ job identifier")
    attempt_id: UUID = Field(..., description="Attempt being scored")
    status: str = Field(default="queued", description="Job queue status")
    message: str = Field(..., description="Human-readable status message")
    estimated_wait_seconds: Optional[int] = Field(
        default=None,
        description="Estimated wait time if available"
    )


class ScoreSummaryResponse(BaseModel):
    """Summary of scores for an attempt."""
    attempt_id: UUID = Field(..., description="Attempt UUID")
    total_score: float = Field(..., description="Overall total score")
    max_score: float = Field(..., description="Maximum possible score")
    percentage: float = Field(..., description="Score as percentage")
    band_score: Optional[str] = Field(default=None, description="Converted band score (if applicable)")
    breakdown: List[dict] = Field(
        default_factory=list,
        description="Score breakdown by task/criterion"
    )
    generated_at: datetime = Field(..., description="When summary was generated")


class ManualScoringRequest(BaseModel):
    """Request for manual/human scoring."""
    score_run_id: UUID = Field(..., description="Score run to update")
    scores: List[dict] = Field(
        ...,
        description="List of score objects with task_response_id, criterion, score, feedback"
    )
    overall_feedback: Optional[str] = Field(default=None, description="Overall feedback")
    scorer_id: UUID = Field(..., description="ID of the human scorer")


class ManualScoringResponse(BaseModel):
    """Response for manual scoring submission."""
    score_run_id: UUID = Field(..., description="Updated score run ID")
    status: str = Field(..., description="New status")
    message: str = Field(..., description="Status message")