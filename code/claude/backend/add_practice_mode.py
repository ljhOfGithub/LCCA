"""
Add is_practice column to attempts table.
Run inside the backend container:
  docker cp add_practice_mode.py lcca_backend:/app/add_practice_mode.py
  docker exec -it lcca_backend python add_practice_mode.py
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://lcca_user:lcca_password@postgres:5432/lcca_exam"


async def migrate():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE attempts
            ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT FALSE
        """))
        print("✓ Added is_practice column to attempts (default: FALSE)")

        count = (await conn.execute(text("SELECT COUNT(*) FROM attempts"))).scalar()
        print(f"  Existing attempts: {count} (all marked as exam mode)")

    await engine.dispose()
    print("\n✅ Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
