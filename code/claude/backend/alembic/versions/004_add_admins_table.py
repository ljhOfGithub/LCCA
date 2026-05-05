"""Add admins table for explicit admin role tracking

Revision ID: 004
Revises: 003
Create Date: 2026-05-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'admins',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )
    op.create_index('ix_admins_user_id', 'admins', ['user_id'], unique=True)

    # Seed: every is_superuser user gets an admin record
    op.execute("""
        INSERT INTO admins (id, user_id, created_at, updated_at)
        SELECT gen_random_uuid(), id, now(), now()
        FROM users WHERE is_superuser = TRUE
        ON CONFLICT (user_id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index('ix_admins_user_id', table_name='admins')
    op.drop_table('admins')
