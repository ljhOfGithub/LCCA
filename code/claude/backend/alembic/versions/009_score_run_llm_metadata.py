"""Add llm_model and llm_token_usage to score_runs

Revision ID: 009
Revises: 008
Create Date: 2026-05-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('score_runs', sa.Column('llm_model', sa.String(100), nullable=True))
    op.add_column('score_runs', sa.Column('llm_token_usage', sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column('score_runs', 'llm_token_usage')
    op.drop_column('score_runs', 'llm_model')
