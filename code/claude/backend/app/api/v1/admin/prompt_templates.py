"""Prompt template management for admins."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_session
from app.core.security import require_admin
from app.models.rubric import PromptTemplate

router = APIRouter()


class PromptTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    template_type: str = Field(default="scoring", max_length=50)
    system_prompt: str
    user_prompt_template: str
    model: str = Field(default="gpt-4o", max_length=100)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    is_active: bool = True


class PromptTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    template_type: str | None = Field(None, max_length=50)
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    model: str | None = Field(None, max_length=100)
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    is_active: bool | None = None


class PromptTemplateResponse(BaseModel):
    id: str
    name: str
    template_type: str
    system_prompt: str
    user_prompt_template: str
    model: str
    temperature: float
    is_active: bool

    model_config = {"from_attributes": True}


def _to_response(pt: PromptTemplate) -> PromptTemplateResponse:
    return PromptTemplateResponse(
        id=str(pt.id),
        name=pt.name,
        template_type=pt.template_type,
        system_prompt=pt.system_prompt,
        user_prompt_template=pt.user_prompt_template,
        model=pt.model,
        temperature=pt.temperature,
        is_active=pt.is_active,
    )


@router.get("/prompt-templates", response_model=list[PromptTemplateResponse])
async def list_prompt_templates(
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    """List all prompt templates."""
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
    """Create a new prompt template."""
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
        model=data.model,
        temperature=data.temperature,
        is_active=data.is_active,
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
    """Get a single prompt template."""
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
    """Update a prompt template."""
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
    if data.model is not None:
        pt.model = data.model
    if data.temperature is not None:
        pt.temperature = data.temperature
    if data.is_active is not None:
        pt.is_active = data.is_active

    await session.commit()
    await session.refresh(pt)
    return _to_response(pt)


@router.delete("/prompt-templates/{template_id}", status_code=204)
async def delete_prompt_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    """Delete a prompt template."""
    result = await session.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id)
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(404, "Prompt template not found")
    await session.delete(pt)
    await session.commit()
