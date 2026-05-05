"""Add prompt_template_name to score_runs

Revision ID: 007
Revises: 006
Create Date: 2026-05-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'score_runs',
        sa.Column('prompt_template_name', sa.String(255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('score_runs', 'prompt_template_name')
