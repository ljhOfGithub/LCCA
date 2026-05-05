"""Student-facing scenario endpoints."""
import math
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.models.scenario import Scenario, Task
from app.core.security import get_current_user
from app.api.schemas.scenarios import ScenarioResponse

router = APIRouter()


@router.get("", response_model=list[ScenarioResponse])
async def list_published_scenarios(
    session: AsyncSession = Depends(get_session),
    _: None = Depends(get_current_user),
):
    """List all published scenarios for students."""
    result = await session.execute(
        select(Scenario)
        .where(Scenario.status == "published")
        .options(selectinload(Scenario.tasks))
    )
    scenarios = result.scalars().all()

    def _duration(tasks) -> int:
        total_s = sum(t.time_limit_seconds or 0 for t in tasks)
        if total_s == 0:
            return 60
        return max(1, math.ceil(total_s / 60))

    return [
        ScenarioResponse(
            id=s.id,
            title=s.title,
            description=s.description or "",
            status=s.status.value,
            duration_minutes=_duration(s.tasks or []),
            total_tasks=len(s.tasks) if s.tasks else 0,
            created_at=s.created_at,
            updated_at=s.updated_at,
            tags=[],
        )
        for s in scenarios
    ]
