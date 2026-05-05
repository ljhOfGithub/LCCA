"""Add base_url and api_key to prompt_templates for per-template LLM config

Revision ID: 005
Revises: 004
Create Date: 2026-05-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('prompt_templates', sa.Column('base_url', sa.String(512), nullable=True))
    op.add_column('prompt_templates', sa.Column('api_key', sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column('prompt_templates', 'api_key')
    op.drop_column('prompt_templates', 'base_url')
