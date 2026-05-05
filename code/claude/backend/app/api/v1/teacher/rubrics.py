"""Rubric management endpoints. Admin-only CRUD."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_admin
from app.core.auth_helpers import assert_can_modify_scenario
from app.db.session import get_session
from app.models.rubric import Criterion, Rubric
from app.models.scenario import Task
from app.models.user import User

router = APIRouter()


# ── Schemas ─────────────────────────────────────────────────────────────────────

class CriterionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    domain: str | None = None
    competence: str | None = None
    cefr_descriptors: dict | None = None
    max_score: float = Field(default=4.0, gt=0)
    weight: float = Field(default=1.0, gt=0)
    sequence_order: int = Field(default=0, ge=0)


class CriterionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    domain: str | None = None
    competence: str | None = None
    cefr_descriptors: dict | None = None
    max_score: float | None = Field(None, gt=0)
    weight: float | None = Field(None, gt=0)
    sequence_order: int | None = Field(None, ge=0)


class CriterionResponse(BaseModel):
    id: str
    rubric_id: str
    name: str
    description: str | None
    domain: str | None
    competence: str | None
    cefr_descriptors: dict | None
    max_score: float
    weight: float
    sequence_order: int
    model_config = {"from_attributes": True}


class RubricCreate(BaseModel):
    task_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    criteria: List[CriterionCreate] = Field(default_factory=list)


class RubricUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


class RubricResponse(BaseModel):
    id: str
    task_id: str
    name: str
    criteria: List[CriterionResponse] = Field(default_factory=list)
    model_config = {"from_attributes": True}


# ── Helpers ─────────────────────────────────────────────────────────────────────

import json as _json


def _parse_cefr(c: Criterion) -> dict | None:
    if c.cefr_descriptors is None:
        return None
    try:
        return _json.loads(c.cefr_descriptors) if isinstance(c.cefr_descriptors, str) else c.cefr_descriptors
    except Exception:
        return None


def _crit_out(c: Criterion) -> CriterionResponse:
    return CriterionResponse(
        id=str(c.id), rubric_id=str(c.rubric_id), name=c.name,
        description=c.description, domain=c.domain, competence=c.competence,
        cefr_descriptors=_parse_cefr(c),
        max_score=c.max_score, weight=c.weight, sequence_order=c.sequence_order,
    )


def _rubric_out(r: Rubric) -> RubricResponse:
    return RubricResponse(
        id=str(r.id), task_id=str(r.task_id), name=r.name,
        criteria=[_crit_out(c) for c in sorted(r.criteria, key=lambda x: x.sequence_order)],
    )


async def _get_task(task_id: UUID, user: User, session: AsyncSession) -> Task:
    result = await session.execute(
        select(Task).options(selectinload(Task.scenario)).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    assert_can_modify_scenario(user, task.scenario.created_by_id)
    return task


async def _get_rubric(rubric_id: UUID, user: User, session: AsyncSession) -> Rubric:
    result = await session.execute(
        select(Rubric)
        .options(selectinload(Rubric.criteria),
                 selectinload(Rubric.task).selectinload(Task.scenario))
        .where(Rubric.id == rubric_id)
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(404, "Rubric not found")
    assert_can_modify_scenario(user, rubric.task.scenario.created_by_id)
    return rubric


async def _get_criterion(criterion_id: UUID, user: User, session: AsyncSession) -> Criterion:
    result = await session.execute(
        select(Criterion)
        .options(selectinload(Criterion.rubric)
                 .selectinload(Rubric.task)
                 .selectinload(Task.scenario))
        .where(Criterion.id == criterion_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Criterion not found")
    assert_can_modify_scenario(user, c.rubric.task.scenario.created_by_id)
    return c


# ── Endpoints ────────────────────────────────────────────────────────────────────

@router.get("/rubrics", response_model=List[RubricResponse])
async def list_rubrics(
    task_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    """List rubrics owned by this admin. Optionally filter by task_id."""
    query = (
        select(Rubric)
        .options(selectinload(Rubric.criteria), selectinload(Rubric.task).selectinload(Task.scenario))
        .join(Task)
        .where(Task.scenario.has(created_by_id=current_user.id))
        .order_by(Rubric.created_at.desc())
    )
    if task_id:
        query = query.where(Rubric.task_id == task_id)
    result = await session.execute(query)
    return [_rubric_out(r) for r in result.scalars().all()]


@router.post("/rubrics", response_model=RubricResponse, status_code=201)
async def create_rubric(
    data: RubricCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    task = await _get_task(data.task_id, current_user, session)

    if (await session.execute(select(Rubric).where(Rubric.task_id == data.task_id))).scalar_one_or_none():
        raise HTTPException(400, "Rubric already exists for this task.")

    rubric = Rubric(task_id=task.id, name=data.name)
    session.add(rubric)
    await session.flush()

    criteria = []
    for i, cd in enumerate(data.criteria):
        cefr_str = _json.dumps(cd.cefr_descriptors) if cd.cefr_descriptors else None
        c = Criterion(rubric_id=rubric.id, name=cd.name, description=cd.description,
                      domain=cd.domain, competence=cd.competence, cefr_descriptors=cefr_str,
                      max_score=cd.max_score, weight=cd.weight,
                      sequence_order=cd.sequence_order if cd.sequence_order else i)
        session.add(c)
        criteria.append(c)

    await session.commit()
    rubric.criteria = criteria
    return _rubric_out(rubric)


@router.put("/rubrics/{rubric_id}", response_model=RubricResponse)
async def update_rubric(
    rubric_id: UUID,
    data: RubricUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    rubric = await _get_rubric(rubric_id, current_user, session)
    if data.name is not None:
        rubric.name = data.name
    await session.commit()
    return _rubric_out(rubric)


@router.delete("/rubrics/{rubric_id}", status_code=204)
async def delete_rubric(
    rubric_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    rubric = await _get_rubric(rubric_id, current_user, session)
    await session.delete(rubric)
    await session.commit()


@router.post("/rubrics/{rubric_id}/criteria", response_model=CriterionResponse, status_code=201)
async def add_criterion(
    rubric_id: UUID,
    data: CriterionCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    rubric = await _get_rubric(rubric_id, current_user, session)
    cefr_str = _json.dumps(data.cefr_descriptors) if data.cefr_descriptors else None
    c = Criterion(rubric_id=rubric.id, name=data.name, description=data.description,
                  domain=data.domain, competence=data.competence, cefr_descriptors=cefr_str,
                  max_score=data.max_score, weight=data.weight, sequence_order=data.sequence_order)
    session.add(c)
    await session.commit()
    return _crit_out(c)


@router.patch("/criteria/{criterion_id}", response_model=CriterionResponse)
async def update_criterion(
    criterion_id: UUID,
    data: CriterionUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    c = await _get_criterion(criterion_id, current_user, session)
    if data.name is not None: c.name = data.name
    if data.description is not None: c.description = data.description
    if data.domain is not None: c.domain = data.domain
    if data.competence is not None: c.competence = data.competence
    if data.cefr_descriptors is not None:
        c.cefr_descriptors = _json.dumps(data.cefr_descriptors)
    if data.max_score is not None: c.max_score = data.max_score
    if data.weight is not None: c.weight = data.weight
    if data.sequence_order is not None: c.sequence_order = data.sequence_order
    await session.commit()
    return _crit_out(c)


@router.delete("/criteria/{criterion_id}", status_code=204)
async def delete_criterion(
    criterion_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin()),
):
    c = await _get_criterion(criterion_id, current_user, session)
    await session.delete(c)
    await session.commit()
