"""Prompt template management for admins."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.core.security import require_admin
from app.core.config import settings
from app.models.rubric import PromptTemplate
from app.models.scenario import Scenario, Task

router = APIRouter()


class PromptTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    template_type: str = Field(default="scoring", max_length=50)
    system_prompt: str
    user_prompt_template: str
    is_active: bool = True
    task_ids: list[str] = Field(default_factory=list)


class PromptTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    template_type: str | None = Field(None, max_length=50)
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    is_active: bool | None = None
    task_ids: list[str] | None = None


class PromptTemplateResponse(BaseModel):
    id: str
    name: str
    template_type: str
    system_prompt: str
    user_prompt_template: str
    is_active: bool
    task_ids: list[str]

    model_config = {"from_attributes": True}


def _to_response(pt: PromptTemplate) -> PromptTemplateResponse:
    return PromptTemplateResponse(
        id=str(pt.id),
        name=pt.name,
        template_type=pt.template_type,
        system_prompt=pt.system_prompt,
        user_prompt_template=pt.user_prompt_template,
        is_active=pt.is_active,
        task_ids=list(pt.task_ids or []),
    )


# ── Scenario+Task listing for assignment UI ────────────────────────────────────

class TaskSummary(BaseModel):
    id: str
    title: str
    task_type: str
    sequence_order: int


class ScenarioWithTasks(BaseModel):
    id: str
    title: str
    tasks: list[TaskSummary]


@router.get("/scenarios-with-tasks", response_model=list[ScenarioWithTasks])
async def list_scenarios_with_tasks(
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    """List all scenarios with their tasks for prompt template assignment."""
    result = await session.execute(
        select(Scenario)
        .options(selectinload(Scenario.tasks))
        .order_by(Scenario.title)
    )
    scenarios = result.scalars().all()
    return [
        ScenarioWithTasks(
            id=str(s.id),
            title=s.title,
            tasks=sorted(
                [
                    TaskSummary(
                        id=str(t.id),
                        title=t.title,
                        task_type=str(t.task_type.value) if hasattr(t.task_type, "value") else str(t.task_type),
                        sequence_order=t.sequence_order,
                    )
                    for t in s.tasks
                ],
                key=lambda x: x.sequence_order,
            ),
        )
        for s in scenarios
    ]


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("/prompt-templates", response_model=list[PromptTemplateResponse])
async def list_prompt_templates(
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    result = await session.execute(
        select(PromptTemplate).order_by(PromptTemplate.name)
    )
    return [_to_response(pt) for pt in result.scalars().all()]


@router.post("/prompt-templates", response_model=PromptTemplateResponse, status_code=201)
async def create_prompt_template(
    data: PromptTemplateCreate,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    existing = await session.execute(
        select(PromptTemplate).where(PromptTemplate.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "A prompt template with this name already exists")

    pt = PromptTemplate(
        name=data.name,
        template_type=data.template_type,
        system_prompt=data.system_prompt,
        user_prompt_template=data.user_prompt_template,
        model=settings.llm_model or settings.anthropic_model or "gpt-4o",
        temperature=0.0,
        is_active=data.is_active,
        task_ids=data.task_ids or [],
    )
    session.add(pt)
    await session.commit()
    await session.refresh(pt)
    return _to_response(pt)


@router.get("/prompt-templates/{template_id}", response_model=PromptTemplateResponse)
async def get_prompt_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    result = await session.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(404, "Prompt template not found")
    return _to_response(pt)


@router.put("/prompt-templates/{template_id}", response_model=PromptTemplateResponse)
async def update_prompt_template(
    template_id: UUID,
    data: PromptTemplateUpdate,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    result = await session.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(404, "Prompt template not found")

    if data.name is not None:
        pt.name = data.name
    if data.template_type is not None:
        pt.template_type = data.template_type
    if data.system_prompt is not None:
        pt.system_prompt = data.system_prompt
    if data.user_prompt_template is not None:
        pt.user_prompt_template = data.user_prompt_template
    if data.is_active is not None:
        pt.is_active = data.is_active
    if data.task_ids is not None:
        pt.task_ids = data.task_ids

    await session.commit()
    await session.refresh(pt)
    return _to_response(pt)


@router.delete("/prompt-templates/{template_id}", status_code=204)
async def delete_prompt_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    result = await session.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(404, "Prompt template not found")
    await session.delete(pt)
    await session.commit()
