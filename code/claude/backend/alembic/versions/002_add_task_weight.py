"""add task weight column

Revision ID: 002
Revises: 001
Create Date: 2026-05-05

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('weight', sa.Float(), nullable=False, server_default='1.0'))


def downgrade() -> None:
    op.drop_column('tasks', 'weight')
