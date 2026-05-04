"""Student-facing scenario endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.models.scenario import Scenario
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
        select(Scenario).where(Scenario.status == "published")
    )
    scenarios = result.scalars().all()

    return [
        ScenarioResponse(
            id=s.id,
            title=s.title,
            description=s.description or "",
            status=s.status.value,
            duration_minutes=60,
            total_tasks=len(s.tasks) if s.tasks else 0,
            created_at=s.created_at,
            updated_at=s.updated_at,
            tags=[],
        )
        for s in scenarios
    ]
