"""Add rendered_system_prompt and rendered_user_prompt to score_runs

Revision ID: 008
Revises: 007
Create Date: 2026-05-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('score_runs', sa.Column('rendered_system_prompt', sa.Text, nullable=True))
    op.add_column('score_runs', sa.Column('rendered_user_prompt', sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column('score_runs', 'rendered_user_prompt')
    op.drop_column('score_runs', 'rendered_system_prompt')
