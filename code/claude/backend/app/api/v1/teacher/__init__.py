"""Teacher API endpoints."""
from app.api.v1.teacher import rubrics, scenarios, tasks

router = rubrics.router

# Re-export for convenience
__all__ = ["rubrics", "scenarios", "tasks"]