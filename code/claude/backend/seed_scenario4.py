"""Seed script: Sample Scenario 4 – Applying for a Graduate Position"""
import asyncio
import json
import uuid
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text

DATABASE_URL = "postgresql+asyncpg://lcca_user:lcca_password@postgres:5432/lcca_exam"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Content ────────────────────────────────────────────────────────────────────

SCENARIO_TITLE = "Scenario 4 – Applying for a Graduate Position"
SCENARIO_DESC = (
    "You are a final year student at PolyU. You are considering what you will do after "
    "graduation. You come across an advertisement for positions at a start-up company that "
    "interests you. The company is looking for new graduates in any discipline. You will first "
    "read the advertisement and take notes. Then you will write an email application for one of "
    "these positions. After being shortlisted, you are invited to a seminar in which a "
    "representative of the company will talk about what the company hopes to achieve and what it "
    "is looking for in its new employees. Finally, you will take part in an individual interview."
)

ADVERTISEMENT_TEXT = """BrightWave Urban Solutions – Graduate Recruitment 2026

BrightWave Urban Solutions is a new start-up based in Kowloon, Hong Kong. We design smart, practical solutions to make city life easier and greener. Our current projects include:
- A mobile app that helps residents find the fastest and most eco-friendly way to travel across Hong Kong
- A system to reduce food waste in restaurants by connecting them to charities in real time
- Data dashboards for local NGOs and small businesses to understand how people move, shop and live in the city

We are a small, international team of professionals from engineering, business, social sciences and design. We now want to hire recent university graduates from any discipline who are curious, responsible and ready to learn.

What kind of graduates are we looking for?

At BrightWave, we believe that attitude is as important as experience. You do not need to have studied technology or business to join us. However, we expect all new employees to:
- Communicate clearly in English, both in writing and in speaking
- Work well in small, multicultural teams and show respect for different opinions
- Be willing to take initiative (start tasks without being told every detail)
- Be able to manage their time and meet deadlines, even when they are busy
- Show strong ethical values and care about sustainability and social impact

We especially welcome graduates who:
- Have done group projects, internships or voluntary work
- Are comfortable using common digital tools (for example, spreadsheets, presentation software, social media)
- Want to develop their professional skills through training and real projects

Graduate Positions Available

1. Graduate Project Consultant
Main purpose: Support senior consultants in planning and delivering urban solution projects for clients such as NGOs, start-ups and local businesses.

Key responsibilities:
- Assist in planning and organising small projects, including preparing simple project timelines and task lists
- Join client meetings, take clear notes, and write short follow-up summaries
- Collect basic information and present it in an easy-to-understand format
- Work with designers and technical staff to make sure client needs are clearly understood

2. Graduate Marketing & Community Officer
Main purpose: Help explain projects to the public and build a community around our solutions.

Key responsibilities:
- Create simple online content (short posts, images, basic videos) for social media and the website
- Help plan and run small community events, workshops or information sessions
- Respond politely and professionally to questions from users, partners and the media
- Collect feedback from users and summarise the main points for the project team

3. Graduate Data & Operations Analyst
Main purpose: Support the team by collecting and organising data and helping improve how services operate.

Key responsibilities:
- Collect and clean simple data sets using basic spreadsheet tools
- Produce clear tables, charts and short written reports to show trends and patterns
- Help monitor the daily performance of apps and services, and report any problems
- Work closely with project managers to suggest small improvements to processes

What we offer:
- A friendly, flexible working environment in Kowloon, with the option to work from home 1–2 days per week after training
- A clear training plan during your first six months, including regular feedback from your mentor
- Opportunities to propose your own ideas and see them become real projects
- A competitive entry-level salary and performance-based bonuses

For more information, email Ms Jackie Lee at Jackie.lee@brightwave.com."""

EMAIL_TASK_INSTRUCTIONS = """Write an email to Ms Jackie Lee to apply for one position at BrightWave Urban Solutions. In your email:
- state which position you are applying for
- explain why you are interested in working for BrightWave
- describe how your background, experience, skills, and personal qualities match the company's expectations
- refer to relevant responsibilities of the position

Write in a professional and polite style.
Write 180–220 words.

Email template:
From: yourname@polyu.edu.hk
To: Jackie.lee@brightwave.com
Subject: Application for the post of [job title]"""

# Band descriptors stored as JSON with CEFR keys: {"C1": "...", "B2": "...", "B1": "...", "A2": "..."}

CEFR_T1_INFO_CAPTURE = json.dumps({
    "C1": "Captures most or all key qualities and responsibilities accurately. Notes show strong understanding of the advertisement and include highly relevant information with little or no incorrect content.",
    "B2": "Captures the main qualities and responsibilities with generally good accuracy. Notes are mostly relevant, though there may be minor omissions, category confusion, or slightly generic wording.",
    "B1": "Captures some relevant information, but coverage is uneven. Notes include vague, generic, partially incorrect, or incomplete items, and one or more important requirements are missing.",
    "A2": "Captures very little accurate or relevant information. Notes are largely generic, incorrect, copied without clear selection, or missing key content."
})

CEFR_T1_NOTE_USEFULNESS = json.dumps({
    "C1": "Notes are clearly usable for later task performance. Key points are easy to identify, efficiently recorded, and grouped or separated in a helpful way. Copying is minimal or selective.",
    "B2": "Notes are mostly usable and contain identifiable key information. Some grouping or list structure is present, though efficiency or clarity may be uneven.",
    "B1": "Notes contain some useful content, but usability is reduced by weak organization, excessive copying, redundancy, or unclear separation of key points.",
    "A2": "Notes have low functional value for later use. Key points are hard to identify, largely unstructured, overly copied, or too limited to support the next task effectively."
})

CEFR_T2_TASK_ACHIEVEMENT = json.dumps({
    "C1": "Fully achieves the task. The email clearly applies for the chosen role, presents a convincing case for suitability, and makes multiple specific links between the candidate's background and the company's values or role requirements.",
    "B2": "Clearly achieves the main task. The email applies for the role and explains suitability with relevant content, including at least some explicit links to the company or position.",
    "B1": "Partially achieves the task. The application purpose is present, but support is general, incomplete, or weakly connected to the company or role. Some important content is missing or underdeveloped.",
    "A2": "Does not adequately achieve the task. Purpose is unclear or incomplete, and content is generic, off-task, or largely unrelated to the company or role."
})

CEFR_T2_LINGUISTIC_CONTROL = json.dumps({
    "C1": "Uses a broad and appropriate range of vocabulary, including professional or job-relevant language, with strong grammatical control. Errors are minimal and do not reduce clarity. Expression is smooth, clear, and precise.",
    "B2": "Uses a good range of generally appropriate vocabulary and structures. There are some grammatical or lexical errors, but they rarely interfere with meaning. Overall expression is clear and effective.",
    "B1": "Uses limited or repetitive vocabulary and mostly simple structures. Grammatical and lexical errors are frequent and sometimes reduce clarity, though the main message is still usually understandable.",
    "A2": "Uses very basic language with frequent errors that often obscure meaning. Expression is limited, fragmented, or difficult to understand."
})

CEFR_T2_SOCIOLINGUISTIC = json.dumps({
    "C1": "Language is consistently professional, respectful, and well calibrated to the hiring context. Greeting and closing are fully appropriate, register is stable throughout, and self-presentation is confident but suitably professional.",
    "B2": "Language is generally appropriate for a professional application. Greeting and closing are correct or mostly appropriate, and the overall tone is polite and suitably formal, with only minor lapses.",
    "B1": "Professional appropriateness is uneven. There may be mismatched greeting or closing, inconsistent register, formulaic or awkward politeness, or some informal wording that weakens the professional tone.",
    "A2": "Language is often inappropriate for a professional application. Register is too informal, abrupt, or otherwise mismatched, with little evidence of appropriate audience awareness."
})

CEFR_T2_ORGANIZATION = json.dumps({
    "C1": "The email is well organized and easy to follow. Information is logically sequenced, ideas are clearly connected, and the overall structure strongly supports the communicative purpose.",
    "B2": "The email has a clear and generally logical structure. Ideas are mostly connected and easy to follow, though some transitions or sequencing may be less effective.",
    "B1": "Organization is partial or uneven. Some structure is visible, but sequencing may be loose, repetitive, or unclear, and connections between ideas are limited.",
    "A2": "The email lacks a clear structure. Ideas are poorly connected, hard to follow, or presented in a disjointed way."
})

CEFR_T3_INFO_CAPTURE = json.dumps({
    "C1": "Captures most key seminar points accurately, including major elements of the company vision and relevant additional qualities or expectations emphasized in the seminar. Notes show strong usable understanding of the spoken input.",
    "B2": "Captures the main seminar points with generally good accuracy, including key vision elements and at least some additional expectations highlighted by the speaker.",
    "B1": "Captures some main ideas, but understanding is incomplete, vague, or partly inaccurate. Notes may mix old and new information unclearly or miss important points.",
    "A2": "Captures very little accurate seminar information. Notes show major misunderstanding, minimal usable content, or mostly irrelevant recording."
})

CEFR_T3_NOTE_USEFULNESS = json.dumps({
    "C1": "Notes are clearly usable for the interview. Key seminar points are efficiently recorded and easy to retrieve, with helpful grouping or separation of major ideas.",
    "B2": "Notes are mostly usable and contain identifiable key ideas, though organization or efficiency may be somewhat uneven.",
    "B1": "Notes contain some useful points, but weak organization, unclear distinctions, redundancy, or partial copying reduce their usefulness for later speaking.",
    "A2": "Notes are of low functional value for the interview. Key information is unclear, minimal, or difficult to retrieve."
})

CEFR_T4_TASK_ACHIEVEMENT = json.dumps({
    "C1": "Responses are consistently relevant, complete, and well supported. The candidate clearly connects answers to the company, role, or seminar/ad information and presents a convincing professional fit.",
    "B2": "Responses are generally relevant and sufficiently developed. The candidate answers the questions clearly and makes at least some meaningful connections to the company or role.",
    "B1": "Responses are only partly effective. Answers may be brief, generic, repetitive, or only loosely connected to the company or role, with limited support or development.",
    "A2": "Responses are often minimal, unclear, off-topic, or unsupported. The candidate shows little ability to address the interview purpose effectively."
})

CEFR_T4_LINGUISTIC_CONTROL = json.dumps({
    "C1": "Uses a broad and flexible range of interview-appropriate language with strong grammatical control. Errors are minimal and do not reduce clarity. Meaning is expressed clearly and precisely.",
    "B2": "Uses a good range of generally appropriate language. Some grammar or wording problems occur, but meaning remains clear and communication is effective overall.",
    "B1": "Uses adequate but limited language. Errors are frequent and expression may be repetitive or simplified, though the main message is usually understandable.",
    "A2": "Uses very basic spoken language with frequent errors that often reduce clarity or make responses difficult to understand."
})

CEFR_T4_SOCIOLINGUISTIC = json.dumps({
    "C1": "Consistently maintains an appropriate professional interview style. Tone is respectful, confident, and well judged, with clear awareness of hierarchy and context.",
    "B2": "Generally maintains an appropriate professional tone. Language is mostly polite and suitably formal, with only minor lapses or awkwardness.",
    "B1": "Shows partial awareness of interview norms. Communication is generally polite, but register, stance, or phrasing is sometimes too informal, abrupt, or uneven for the context.",
    "A2": "Shows limited awareness of professional interview norms. Tone is often inappropriate, overly informal, abrupt, or otherwise mismatched to the context."
})

CEFR_T4_INTERACTION = json.dumps({
    "C1": "Manages the interaction very effectively. Responds fully to follow-up questions, shows clear uptake of interviewer cues, and uses clarification, reformulation, or candidate questions appropriately to sustain a collaborative exchange.",
    "B2": "Manages the interaction effectively overall. Responds appropriately to questions and follow-up prompts, and shows some ability to maintain the exchange or seek clarification when needed.",
    "B1": "Interaction management is limited. The candidate often relies on the interviewer to carry the exchange, with little clarification, limited responsiveness to follow-up, or weak contribution to the flow of interaction.",
    "A2": "Interaction is difficult to sustain. Responses are minimal or poorly connected to interviewer prompts, with little evidence of clarification, repair, or collaborative participation."
})

CEFR_T4_FLUENCY = json.dumps({
    "C1": "Speech is generally smooth and easy to follow, with only limited hesitation. Turns are sustained appropriately and ideas are delivered with clear continuity.",
    "B2": "Speech is generally fluent enough for effective communication, though some hesitation or pausing occurs. The overall flow is clear and followable.",
    "B1": "Delivery is uneven, with noticeable pauses, restarts, or hesitations that sometimes interrupt the flow of ideas. The listener must make moderate effort to follow.",
    "A2": "Delivery is highly fragmented, with frequent long pauses, breakdowns, or incomplete utterances that make communication difficult to follow."
})


async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # ── 1. Reset admin password ──────────────────────────────────────────
        new_hash = pwd_context.hash("password123")
        await session.execute(
            text("UPDATE users SET hashed_password = :h WHERE email = 'admin@lcca.io'"),
            {"h": new_hash}
        )
        print("✓ Admin password reset to 'password123'")

        # ── 2. Ensure admin has a teacher profile ────────────────────────────
        admin_row = (await session.execute(
            text("SELECT id FROM users WHERE email = 'admin@lcca.io'")
        )).fetchone()
        admin_user_id = admin_row[0]

        teacher_row = (await session.execute(
            text("SELECT id FROM teachers WHERE user_id = :uid"),
            {"uid": admin_user_id}
        )).fetchone()

        if teacher_row:
            teacher_id = teacher_row[0]
            print(f"✓ Admin teacher profile exists: {teacher_id}")
        else:
            teacher_id = uuid.uuid4()
            await session.execute(
                text("INSERT INTO teachers (id, user_id, created_at, updated_at) "
                     "VALUES (:id, :uid, now(), now())"),
                {"id": teacher_id, "uid": admin_user_id}
            )
            print(f"✓ Admin teacher profile created: {teacher_id}")

        # ── 3. Drop existing Scenario 4 and re-create ───────────────────────
        existing = (await session.execute(
            text("SELECT id FROM scenarios WHERE title = :t"),
            {"t": SCENARIO_TITLE}
        )).fetchone()
        if existing:
            old_id = existing[0]
            # cascade: criteria → rubrics → materials → tasks → scenario
            await session.execute(text(
                "DELETE FROM criteria WHERE rubric_id IN "
                "(SELECT id FROM rubrics WHERE task_id IN (SELECT id FROM tasks WHERE scenario_id = :sid))"
            ), {"sid": old_id})
            await session.execute(text(
                "DELETE FROM rubrics WHERE task_id IN (SELECT id FROM tasks WHERE scenario_id = :sid)"
            ), {"sid": old_id})
            await session.execute(text(
                "DELETE FROM materials WHERE task_id IN (SELECT id FROM tasks WHERE scenario_id = :sid)"
            ), {"sid": old_id})
            await session.execute(text("DELETE FROM tasks WHERE scenario_id = :sid"), {"sid": old_id})
            await session.execute(text("DELETE FROM scenarios WHERE id = :sid"), {"sid": old_id})
            print(f"✓ Removed old scenario: {old_id}")

        scenario_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO scenarios (id, title, description, status, created_by_id, created_at, updated_at) "
                "VALUES (:id, :title, :desc, 'PUBLISHED'::scenario_status, :created_by, now(), now())"
            ),
            {"id": scenario_id, "title": SCENARIO_TITLE, "desc": SCENARIO_DESC,
             "created_by": teacher_id}
        )
        print(f"✓ Scenario created: {scenario_id}")

        # ── 4. Create tasks ──────────────────────────────────────────────────
        # weights per rubric doc: Task1=15%, Task2=35%, Task3=15%, Task4=35%
        task1_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO tasks (id, scenario_id, title, description, task_type, sequence_order, "
                "time_limit_seconds, weight, created_at, updated_at) "
                "VALUES (:id, :sid, :title, :desc, 'READING'::task_type, 0, 900, 0.15, now(), now())"
            ),
            {
                "id": task1_id, "sid": scenario_id,
                "title": "Task 1: Reading a Job Advertisement",
                "desc": "Read the following advertisement and note down: 3–5 qualities that BrightWave is looking for in all new employees, and 3 key responsibilities for one position you would like to apply for. You will be assessed on the quality of these notes, and you will use them in Tasks 2–4."
            }
        )

        task2_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO tasks (id, scenario_id, title, description, task_type, sequence_order, "
                "time_limit_seconds, weight, created_at, updated_at) "
                "VALUES (:id, :sid, :title, :desc, 'WRITING'::task_type, 1, 1200, 0.35, now(), now())"
            ),
            {
                "id": task2_id, "sid": scenario_id,
                "title": "Task 2: Writing an Email Application",
                "desc": "Write an email to Ms Jackie Lee to apply for one position at BrightWave Urban Solutions. State which position you are applying for, explain why you are interested in working for BrightWave, describe how your background, experience, skills, and personal qualities match the company's expectations, and refer to relevant responsibilities of the position. Write in a professional and polite style. Write 180–220 words."
            }
        )

        task3_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO tasks (id, scenario_id, title, description, task_type, sequence_order, "
                "time_limit_seconds, weight, created_at, updated_at) "
                "VALUES (:id, :sid, :title, :desc, 'LISTENING'::task_type, 2, NULL, 0.15, now(), now())"
            ),
            {
                "id": task3_id, "sid": scenario_id,
                "title": "Task 3: Seminar Listening and Note-taking",
                "desc": "Listen to a seminar by a BrightWave representative talking about what the company hopes to achieve and what it is looking for in its new employees. Take notes on the company vision and key qualities or expectations emphasized by the speaker. You will use your notes in Task 4."
            }
        )

        task4_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO tasks (id, scenario_id, title, description, task_type, sequence_order, "
                "time_limit_seconds, weight, created_at, updated_at) "
                "VALUES (:id, :sid, :title, :desc, 'SPEAKING'::task_type, 3, NULL, 0.35, now(), now())"
            ),
            {
                "id": task4_id, "sid": scenario_id,
                "title": "Task 4: Individual Interview",
                "desc": "Take part in an individual interview for a position at BrightWave Urban Solutions. Respond to the interviewer's questions clearly and professionally, connecting your answers to the company, the role, and the information from the advertisement and seminar."
            }
        )
        print("✓ 4 tasks created (weights: T1=0.15, T2=0.35, T3=0.15, T4=0.35)")

        # ── 5. Create materials ──────────────────────────────────────────────
        mat1_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO materials (id, task_id, material_type, content, storage_key, metadata_json, created_at, updated_at) "
                "VALUES (:id, :tid, 'job_description', :content, NULL, NULL, now(), now())"
            ),
            {"id": mat1_id, "tid": task1_id, "content": ADVERTISEMENT_TEXT}
        )

        mat2_id = uuid.uuid4()
        await session.execute(
            text(
                "INSERT INTO materials (id, task_id, material_type, content, storage_key, metadata_json, created_at, updated_at) "
                "VALUES (:id, :tid, 'notes', :content, NULL, NULL, now(), now())"
            ),
            {"id": mat2_id, "tid": task2_id, "content": EMAIL_TASK_INSTRUCTIONS}
        )
        print("✓ Materials created for Tasks 1 & 2")

        # ── 6. Create rubrics & criteria ─────────────────────────────────────

        async def add_rubric(task_id, name, criteria_list):
            rubric_id = uuid.uuid4()
            await session.execute(
                text("INSERT INTO rubrics (id, task_id, name, created_at, updated_at) "
                     "VALUES (:id, :tid, :name, now(), now())"),
                {"id": rubric_id, "tid": task_id, "name": name}
            )
            for order, (c_name, c_desc, weight, cefr_json) in enumerate(criteria_list):
                crit_id = uuid.uuid4()
                await session.execute(
                    text(
                        "INSERT INTO criteria (id, rubric_id, name, description, domain, competence, "
                        "max_score, weight, sequence_order, cefr_descriptors, created_at, updated_at) "
                        "VALUES (:id, :rid, :name, :desc, NULL, NULL, 4, :weight, :order, :cefr, now(), now())"
                    ),
                    {"id": crit_id, "rid": rubric_id, "name": c_name, "desc": c_desc,
                     "weight": weight, "order": order, "cefr": cefr_json}
                )
            return rubric_id

        await add_rubric(task1_id, "Task 1 Reading & Note-taking Rubric", [
            ("Information Capture and Accuracy",
             "Ability to identify and record relevant information from the advertisement for a later professional communication task.",
             0.70, CEFR_T1_INFO_CAPTURE),
            ("Note Usefulness",
             "Extent to which notes are usable for completing the next task effectively.",
             0.30, CEFR_T1_NOTE_USEFULNESS),
        ])

        await add_rubric(task2_id, "Task 2 Email Application Rubric", [
            ("Task Achievement",
             "Extent to which the candidate completes the communicative purpose of the email application.",
             0.30, CEFR_T2_TASK_ACHIEVEMENT),
            ("Linguistic Control",
             "Range and control of vocabulary and grammar used to communicate effectively in a professional email.",
             0.25, CEFR_T2_LINGUISTIC_CONTROL),
            ("Sociolinguistic Appropriateness",
             "Appropriateness of register, politeness, stance, and audience awareness in a professional application email.",
             0.20, CEFR_T2_SOCIOLINGUISTIC),
            ("Organization and Coherence",
             "Ability to structure the email logically and connect ideas clearly.",
             0.25, CEFR_T2_ORGANIZATION),
        ])

        await add_rubric(task3_id, "Task 3 Listening & Note-taking Rubric", [
            ("Information Capture and Accuracy",
             "Ability to identify and record key seminar content relevant to the later interview.",
             0.70, CEFR_T3_INFO_CAPTURE),
            ("Note Usefulness",
             "Extent to which seminar notes are usable for the later interview task.",
             0.30, CEFR_T3_NOTE_USEFULNESS),
        ])

        await add_rubric(task4_id, "Task 4 Interview Rubric", [
            ("Task Achievement and Relevance",
             "Extent to which the candidate answers the interview questions effectively and relates responses to the company and role.",
             0.25, CEFR_T4_TASK_ACHIEVEMENT),
            ("Linguistic Control",
             "Range and control of spoken language used in the interview.",
             0.20, CEFR_T4_LINGUISTIC_CONTROL),
            ("Sociolinguistic Appropriateness",
             "Appropriateness of professional tone, interview etiquette, politeness, and stance.",
             0.20, CEFR_T4_SOCIOLINGUISTIC),
            ("Interaction Management",
             "Ability to manage spoken interaction during the interview.",
             0.20, CEFR_T4_INTERACTION),
            ("Fluency and Delivery",
             "Smoothness, continuity, and ease of spoken delivery.",
             0.15, CEFR_T4_FLUENCY),
        ])
        print("✓ Rubrics and criteria created for all 4 tasks")

        await session.commit()
        print("\n✅ Seed complete!")
        print(f"   Scenario ID : {scenario_id}")
        print(f"   Task 1 (reading)   : {task1_id}")
        print(f"   Task 2 (writing)   : {task2_id}")
        print(f"   Task 3 (listening) : {task3_id}")
        print(f"   Task 4 (speaking)  : {task4_id}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
