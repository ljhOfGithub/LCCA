"""
Update Task 4 (SPEAKING) notes material with clean student-facing interview questions.
Run inside the backend container:
  docker exec -it lcca_backend python update_task4_questions.py
"""
import asyncio
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://lcca_user:lcca_password@postgres:5432/lcca_exam"

INTERVIEW_QUESTIONS = """INTERVIEW QUESTIONS — BrightWave Urban Solutions
================================================

Read the questions for the position you applied for.
When you are ready, record your responses in one continuous recording.

────────────────────────────────────────────────────────
POSITION 1: Graduate Project Consultant
────────────────────────────────────────────────────────

Q1. Tell me about yourself and why you are interested in the Graduate Project Consultant role at BrightWave.

Q2. One of the key responsibilities of this role is to attend client meetings and write follow-up summaries. How would you prepare for and manage this task?


────────────────────────────────────────────────────────
POSITION 2: Graduate Marketing & Community Officer
────────────────────────────────────────────────────────

Q1. Tell me about yourself and explain why you are applying for the Graduate Marketing & Community Officer role.

Q2. One responsibility of this role is to create online content for social media and the company website. Can you walk us through how you would create a post promoting BrightWave's eco-travel app?


────────────────────────────────────────────────────────
POSITION 3: Graduate Data & Operations Analyst
────────────────────────────────────────────────────────

Q1. Tell me about yourself and explain what draws you to the Graduate Data & Operations Analyst role at BrightWave.

Q2. One of your responsibilities would be to collect and clean data sets using spreadsheet tools. Can you describe how you would approach a dataset that contained errors or missing values?

"""


async def update():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        rows = (await session.execute(text(
            "SELECT t.id, s.title "
            "FROM tasks t JOIN scenarios s ON t.scenario_id = s.id "
            "WHERE t.task_type::text = 'SPEAKING' "
            "AND s.title ILIKE '%Graduate Position%' "
            "ORDER BY s.created_at DESC"
        ))).fetchall()

        if not rows:
            print("❌ No SPEAKING tasks found for a 'Graduate Position' scenario.")
            await engine.dispose()
            return

        for task_id, scenario_title in rows:
            deleted = (await session.execute(text(
                "DELETE FROM materials WHERE task_id = :tid AND material_type = 'notes' RETURNING id"
            ), {"tid": task_id})).fetchall()
            if deleted:
                print(f"  Removed {len(deleted)} old notes material(s) for task {task_id}")

            mat_id = uuid.uuid4()
            await session.execute(text(
                "INSERT INTO materials (id, task_id, material_type, content, storage_key, metadata_json, created_at, updated_at) "
                "VALUES (:id, :tid, 'notes', :content, NULL, NULL, now(), now())"
            ), {"id": mat_id, "tid": task_id, "content": INTERVIEW_QUESTIONS})
            print(f"✓ [{scenario_title}] Task {task_id}: questions updated (material {mat_id})")

        await session.commit()
        print("\n✅ Done.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(update())
