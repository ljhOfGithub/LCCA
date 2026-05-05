"""Rubric and criterion management — admin only."""
import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.models.rubric import Rubric, Criterion
from app.core.security import require_admin

router = APIRouter()

CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


# ── Schemas ────────────────────────────────────────────────────────────────────

class CriterionIn(BaseModel):
    name: str
    description: str | None = None
    domain: str | None = None
    competence: str | None = None
    max_score: float = 5.0
    weight: float = 1.0
    cefr_descriptors: dict | None = None  # {"A1": "...", "B1": "...", ...}


class CriterionOut(BaseModel):
    id: str
    name: str
    description: str | None
    domain: str | None
    competence: str | None
    max_score: float
    weight: float
    sequence_order: int
    cefr_descriptors: dict | None


class RubricIn(BaseModel):
    task_id: str
    name: str


class RubricOut(BaseModel):
    id: str
    task_id: str
    name: str
    criteria: list[CriterionOut]


def _criterion_out(c: Criterion) -> CriterionOut:
    descs = None
    if c.cefr_descriptors:
        try:
            descs = json.loads(c.cefr_descriptors)
        except Exception:
            pass
    return CriterionOut(
        id=str(c.id),
        name=c.name,
        description=c.description,
        domain=c.domain,
        competence=c.competence,
        max_score=c.max_score,
        weight=c.weight,
        sequence_order=c.sequence_order,
        cefr_descriptors=descs,
    )


def _rubric_out(r: Rubric) -> RubricOut:
    return RubricOut(
        id=str(r.id),
        task_id=str(r.task_id),
        name=r.name,
        criteria=sorted([_criterion_out(c) for c in (r.criteria or [])], key=lambda x: x.sequence_order),
    )


# ── Rubric CRUD ────────────────────────────────────────────────────────────────

@router.get("/rubrics", response_model=list[RubricOut])
async def list_rubrics(
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    result = await session.execute(select(Rubric).options(selectinload(Rubric.criteria)))
    return [_rubric_out(r) for r in result.scalars().all()]


@router.post("/rubrics", response_model=RubricOut, status_code=201)
async def create_rubric(
    data: RubricIn,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    from app.models.scenario import Task
    task = (await session.execute(select(Task).where(Task.id == data.task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    existing = (await session.execute(select(Rubric).where(Rubric.task_id == data.task_id))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Rubric already exists for this task")

    rubric = Rubric(task_id=data.task_id, name=data.name)
    session.add(rubric)
    await session.flush()
    await session.refresh(rubric)
    return _rubric_out(rubric)


@router.get("/rubrics/{rubric_id}", response_model=RubricOut)
async def get_rubric(
    rubric_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    r = (await session.execute(
        select(Rubric).options(selectinload(Rubric.criteria)).where(Rubric.id == rubric_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Rubric not found")
    return _rubric_out(r)


@router.delete("/rubrics/{rubric_id}", status_code=204)
async def delete_rubric(
    rubric_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    r = (await session.execute(select(Rubric).where(Rubric.id == rubric_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Rubric not found")
    await session.delete(r)
    await session.commit()


# ── Criterion CRUD ─────────────────────────────────────────────────────────────

@router.post("/rubrics/{rubric_id}/criteria", response_model=CriterionOut, status_code=201)
async def add_criterion(
    rubric_id: UUID,
    data: CriterionIn,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    r = (await session.execute(select(Rubric).where(Rubric.id == rubric_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Rubric not found")

    max_order = (await session.execute(
        select(Criterion.sequence_order).where(Criterion.rubric_id == rubric_id)
        .order_by(Criterion.sequence_order.desc()).limit(1)
    )).scalar_one_or_none() or -1

    c = Criterion(
        rubric_id=rubric_id,
        name=data.name,
        description=data.description,
        domain=data.domain,
        competence=data.competence,
        max_score=data.max_score,
        weight=data.weight,
        sequence_order=max_order + 1,
        cefr_descriptors=json.dumps(data.cefr_descriptors) if data.cefr_descriptors else None,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return _criterion_out(c)


@router.patch("/criteria/{criterion_id}", response_model=CriterionOut)
async def update_criterion(
    criterion_id: UUID,
    data: CriterionIn,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    c = (await session.execute(select(Criterion).where(Criterion.id == criterion_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Criterion not found")

    c.name = data.name
    c.description = data.description
    c.domain = data.domain
    c.competence = data.competence
    c.max_score = data.max_score
    c.weight = data.weight
    c.cefr_descriptors = json.dumps(data.cefr_descriptors) if data.cefr_descriptors else None
    await session.commit()
    await session.refresh(c)
    return _criterion_out(c)


@router.delete("/criteria/{criterion_id}", status_code=204)
async def delete_criterion(
    criterion_id: UUID,
    session: AsyncSession = Depends(get_session),
    _: Annotated = Depends(require_admin()),
):
    c = (await session.execute(select(Criterion).where(Criterion.id == criterion_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Criterion not found")
    await session.delete(c)
    await session.commit()
