"""scenarios.created_by_id now references users.id (not teachers.id)

Revision ID: 003
Revises: 002
Create Date: 2026-05-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop old FK first so we can freely update the column values
    op.execute("""
        ALTER TABLE scenarios
        DROP CONSTRAINT IF EXISTS scenarios_created_by_id_fkey
    """)

    # 2. Repoint every scenario's created_by_id: teacher.id → teacher.user_id
    #    (works for both admin-owned and teacher-owned scenarios)
    op.execute("""
        UPDATE scenarios s
        SET created_by_id = t.user_id
        FROM teachers t
        WHERE s.created_by_id = t.id
    """)

    # 3. Add new FK to users
    op.create_foreign_key(
        "scenarios_created_by_id_fkey",
        "scenarios", "users",
        ["created_by_id"], ["id"],
    )

    # 4. Delete teacher profiles that belong to admin (superuser) accounts
    op.execute("""
        DELETE FROM teachers
        WHERE user_id IN (SELECT id FROM users WHERE is_superuser = TRUE)
    """)


def downgrade() -> None:
    # Re-create admin teacher profiles
    op.execute("""
        INSERT INTO teachers (id, user_id, created_at, updated_at)
        SELECT gen_random_uuid(), id, now(), now()
        FROM users WHERE is_superuser = TRUE
        ON CONFLICT DO NOTHING
    """)

    # Repoint scenarios back to teacher.id
    op.execute("""
        UPDATE scenarios s
        SET created_by_id = t.id
        FROM teachers t
        WHERE s.created_by_id = t.user_id
    """)

    op.execute("ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_created_by_id_fkey")

    op.create_foreign_key(
        "scenarios_created_by_id_fkey",
        "scenarios", "teachers",
        ["created_by_id"], ["id"],
    )
