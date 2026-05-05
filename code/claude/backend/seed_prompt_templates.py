"""Seed scoring prompt templates for Scenario 4 (all 4 tasks).

Template variable reference (substituted at scoring time by grader._build_template_vars):
  {task_title}          — task title
  {task_type}           — reading / writing / listening / speaking
  {task_description}    — task description
  {materials}           — all task materials joined (each prefixed [TYPE])
  {material_<type>}     — single material by type, e.g. {material_job_description}
  {criteria}            — criteria list (name, max_score, description)
  {criteria_with_bands} — criteria + full CEFR band descriptors
  {submission}          — student text response (writing / reading / listening)
  {transcription}       — ASR transcript (speaking)
  {max_score}           — highest single criterion max score
  {total_max_score}     — sum of all criteria max scores
  {json_format}         — required JSON output format reminder

Python escaping rules for these strings:
  • {variable}   → substituted at runtime   (single braces = template variable)
  • {{literal}}  → stored as {literal}      (double braces = escape, NOT substituted)
  All JSON schema examples use {{double braces}} so they survive format_map() intact.
"""
import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://lcca_user:lcca_password@postgres:5432/lcca_exam"

# ── Shared fragments ───────────────────────────────────────────────────────────

BAND_SCALE = """\
## Scoring Band Scale
C1: Consistently strong, flexible, and precise; performance beyond expected B2 level.
B2: Meets the B2 target level; clear, effective, appropriately structured; minor lapses permitted.
B1: Partial ability; lacks the range, control, relevance, or appropriateness needed for B2.
A2: Limited, highly basic, or insufficient; dependent on simple language or incomplete understanding.
"""


# ══════════════════════════════════════════════════════════════════════════════
# TASK 1 — Reading + Note-taking
# ══════════════════════════════════════════════════════════════════════════════

T1_SYSTEM = """\
You are an expert CEFR language examiner for the LCCA assessment system.
Your task: score a student's {task_type} notes for {task_title}.
Context: Student read the BrightWave Urban Solutions job advertisement and took structured notes.
Target proficiency level: B2.

""" + BAND_SCALE + """
## Scoring Principles
- Reward meaning over exact wording — accept valid paraphrase of the ad.
- Score understanding and relevance, not formatting style.
- Bullets, phrases, shorthand, and mixed structures are all acceptable note formats.
- Full sentences are not automatically weak unless they indicate wholesale copying without selection.
- A mix of qualities and responsibilities in the same section is acceptable if content shows clear understanding.
- Use the exact criterion names from the rubric when reporting scores.
"""

T1_USER = """\
## Task: {task_title} ({task_type})

## Task Description
{task_description}

## Job Advertisement
{material_job_description}

## Criteria Overview
{criteria}

Scoring range: 1–{max_score} per criterion. Total maximum: {total_max_score} points.

## Rubric Criteria with CEFR Bands
{criteria_with_bands}

## Scoring Examples

### GOOD EXAMPLE — expected B2 overall

Section A - Qualities:
- clear English comm (written + spoken)
- multicultural teamwork + respect diff opinions
- initiative - start without being told
- time mgmt / meet deadlines
- ethics + sustainability values
- digital tools (spreadsheets, ppt, social media)

Section B - Project Consultant:
- plan projects: timelines + task lists
- client meetings -> clear notes + follow-up summary
- collect info -> present simply
- coordinate w/ design & tech teams on client needs

Rationale:
Information Capture and Accuracy -> B2: Six qualities captured accurately; paraphrase acceptable. All four consultant responsibilities covered. Score: 3/4.
Note Usefulness -> C1: Clear A/B separation; efficient shorthand; bullet format; immediately usable for writing targeted email. Minimal copying. Score: 4/4.

### BAD EXAMPLE — expected A2-B1

The company wants students who work hard and are good at English. They want people who can do projects and attend meetings. The company cares about the environment.
Responsibilities: plan projects, do marketing, analyse data, attend meetings.

Rationale:
Information Capture and Accuracy -> A2: Extremely vague; lists responsibilities from ALL THREE positions; misses key content. Score: 1/4.
Note Usefulness -> B1: Mixed-up and redundant; impossible to identify which position was chosen. Score: 2/4.

## Student Notes to Score

{submission}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ══════════════════════════════════════════════════════════════════════════════
# TASK 2 — Writing Email Application
# ══════════════════════════════════════════════════════════════════════════════

T2_SYSTEM = """\
You are an expert CEFR language examiner for the LCCA assessment system.
Your task: score a student's {task_type} email application for {task_title}.
Context: Student wrote a professional email applying for a graduate position at BrightWave Urban Solutions.
Word limit: 180-220 words. Target proficiency level: B2.

""" + BAND_SCALE + """
## Scoring Principles
- Reward specific matching between candidate profile and company/role needs. Penalise keyword stuffing without integration.
- Greeting + closing alone are NOT sufficient evidence of C1 sociolinguistic competence — evaluate the entire register.
- Complex sentences are beneficial ONLY when accurate and functional. A clear B2 sentence outweighs a broken C1 attempt.
- Accept invented but plausible background as valid content (task instruction explicitly permits this).
- Reward clear sequencing even if response is slightly under 180 words, provided content is sufficient.
- Use the exact criterion names from the rubric when reporting scores.
"""

T2_USER = """\
## Task: {task_title} ({task_type})

## Task Description
{task_description}

## Email Task Instructions
{material_notes}

## Criteria Overview
{criteria}

Scoring range: 1–{max_score} per criterion. Total maximum: {total_max_score} points.

## Rubric Criteria with CEFR Bands
{criteria_with_bands}

## Scoring Examples

### GOOD EXAMPLE — overall B2, Linguistic C1

Dear Ms Lee,

I am writing to apply for the Graduate Project Consultant position at BrightWave Urban Solutions. Having studied Business Administration with a sustainability focus, I am drawn to your mission of making city life greener through practical technology.

During my studies, I led a team project redesigning a community recycling scheme, where I prepared project timelines, coordinated tasks across departments, and wrote client summaries — responsibilities that directly mirror those of the Consultant role. I also completed a six-month internship managing client correspondence and maintaining project schedules, demonstrating the initiative and deadline management your advertisement emphasises.

I am proficient in Microsoft Office and Google Workspace, and I enjoy presenting information clearly to diverse audiences. I would welcome the opportunity to contribute my organisational skills and commitment to urban sustainability to BrightWave.

Thank you for considering my application. I look forward to hearing from you.

Yours sincerely,
[Name]

Rationale:
Task Achievement -> B2: Role clearly stated; company mission explicitly referenced; two specific Consultant responsibilities linked; personal values connected to company values. Score: 3/4.
Linguistic Control -> C1: Professional vocabulary; varied structures; zero grammatical errors; smooth, precise expression. Score: 4/4.
Sociolinguistic Appropriateness -> C1: Correct greeting and closing; formal register stable throughout; confident but suitably professional. Score: 4/4.
Organization and Coherence -> B2: Clear purpose -> evidence -> forward-looking close; logical paragraph flow. Score: 3/4.

### BAD EXAMPLE — overall A2-B1

Dear Ms Jackie Lee

I want apply for Marketing Officer in BrightWave. I think this job is very good for me. I am student at PolyU and I study Marketing. I like social media very much and I use Facebook Instagram every day.

I am hard working person and I always finish my work on time. I have good communication. I can work in team. Please give me this chance.

Thank you.

Rationale:
Task Achievement -> A2: ZERO specific links to BrightWave values or mission; no Marketing Officer responsibilities referenced; all claims generic. Score: 1/4.
Linguistic Control -> A2: "want apply" (missing infinitive); "I am student" (missing article); errors undermine professional credibility. Score: 1/4.
Sociolinguistic Appropriateness -> B1: "Thank you" as closing without "Yours sincerely" insufficient; Facebook/Instagram daily use lowers register. Score: 2/4.
Organization and Coherence -> B1: Two loose paragraphs; no clear purpose statement; no forward-looking close. Score: 2/4.

## Student Email Response to Score

{submission}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ══════════════════════════════════════════════════════════════════════════════
# TASK 3 — Listening + Note-taking
# ══════════════════════════════════════════════════════════════════════════════

T3_SYSTEM = """\
You are an expert CEFR language examiner for the LCCA assessment system.
Your task: score a student's {task_type} notes for {task_title}.
Context: Student listened to a seminar by a BrightWave representative and took notes for later interview use.
Target proficiency level: B2.

""" + BAND_SCALE + """
## Scoring Principles
- Only NEW seminar content matters. Do not reward repetition of the job advertisement (already covered in Task 1).
- Reward gist understanding even if exact wording differs from the seminar transcript.
- Accept all note formats (bullets, phrases, shorthand) if usable for speaking.
- Semantic matching against the seminar content map takes priority over surface wording.
- Use the exact criterion names from the rubric when reporting scores.
"""

T3_USER = """\
## Task: {task_title} ({task_type})

## Task Description
{task_description}

## Seminar Reference Content
The following is the reference material students listened to. Use it to assess the accuracy and completeness of their notes.

{materials}

## Criteria Overview
{criteria}

Scoring range: 1–{max_score} per criterion. Total maximum: {total_max_score} points.

## Rubric Criteria with CEFR Bands
{criteria_with_bands}

## Scoring Examples

### GOOD EXAMPLE — B2-C1

Section A - Vision:
- BrightWave = urban problems solver via data + community engagement
- "city as living lab" - test ideas in real neighbourhoods
- not just tech - needs socially aware people

Section B - Additional qualities:
- curiosity: HOW cities work (not just data analysis)
- empathy: understand residents as people, not just users
- resilience: start-up = uncertain environment, must adapt

Rationale:
Information Capture and Accuracy -> B2: Three vision elements captured accurately; three additional qualities not in the ad (curiosity, empathy, resilience). Score: 3/4.
Note Usefulness -> C1: Clear A/B separation; shorthand efficient; immediately usable for interview answers. Score: 4/4.

### BAD EXAMPLE — A2

notes: brightwave is good company. they want good student. they talk about smart city and the future.

Rationale:
Information Capture and Accuracy -> A2: No specific vision elements; "smart city and the future" vague; no additional qualities beyond the ad. Score: 1/4.
Note Usefulness -> A2: Three short phrases; no separation; completely unusable for a meaningful interview answer. Score: 1/4.

## Student Notes to Score

{submission}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ══════════════════════════════════════════════════════════════════════════════
# TASK 4 — Speaking Interview
# ══════════════════════════════════════════════════════════════════════════════

T4_SYSTEM = """\
You are an expert CEFR oral language examiner for the LCCA assessment system.
Your task: score a student's {task_type} interview transcript for {task_title}.
Context: Student participated in a spoken interview for a BrightWave graduate position.
Input: ASR-generated transcript. Target proficiency level: B2.

""" + BAND_SCALE + """
## ASR Transcript Notes
- The transcript is machine-generated. Do NOT penalise for probable transcription errors (missing punctuation, word substitution).
- Prioritise communicative intent over surface form when the transcript is ambiguous.
- If the transcript appears incomplete or incoherent, add "incoherent_transcript" to the overall_feedback.

## Scoring Principles
- Score responsiveness and interaction quality, not just length of response.
- Reward meaningful use of scenario knowledge (seminar + ad content) over vague assertion.
- Fluency carries less weight than Task Achievement and Interaction — do not over-penalise thoughtful pauses.
- Complex structures are beneficial ONLY when accurate. A clear B2 utterance outweighs a broken C1 attempt.
- Use the exact criterion names from the rubric when reporting scores.
"""

T4_USER = """\
## Task: {task_title} ({task_type})

## Task Description
{task_description}

## Interview Materials
{materials}

## Criteria Overview
{criteria}

Scoring range: 1–{max_score} per criterion. Total maximum: {total_max_score} points.

## Rubric Criteria with CEFR Bands
{criteria_with_bands}

## Scoring Examples

### GOOD EXAMPLE — B2 overall

Q1 response: "I'm really attracted to BrightWave because the company is trying to solve actual urban problems that affect people every day, not just building apps for the sake of technology. In the seminar, you mentioned that the goal is to use data and community engagement together, which I found very interesting because I think that's how real change happens."

Q3 response: "In my final year project we had four people from different backgrounds and we disagreed a lot on direction at the beginning. What I did was I suggested we each present our reasoning before making any decision so everyone felt heard. It took longer but the final plan was much stronger."

Rationale:
Task Achievement and Relevance -> B2: Q1 explicitly references seminar content; personal motivation linked to company values; Q3 uses a concrete example with outcome. Score: 3/4.
Linguistic Control -> B2: Good range; professional vocabulary; no significant grammatical errors. Score: 3/4.
Sociolinguistic Appropriateness -> B2: Professional tone throughout; appropriate formality. Score: 3/4.
Interaction Management -> B2: Well-developed responses; natural elaboration; appropriate turn length. Score: 3/4.
Fluency and Delivery -> B2: Natural pauses at clause boundaries only; continuous and followable delivery. Score: 3/4.

### BAD EXAMPLE — A2-B1

Q1: "Because BrightWave is good company and I want learn many things."
Q2: "I took initiative in my group project. I worked hard."
Q3: "I can work with different people. I have no problem."
Q4: "I don't know. Maybe difficult to get salary."

Rationale:
Task Achievement and Relevance -> A2: Generic answers; no company-specific content; no concrete examples. Score: 1/4.
Linguistic Control -> A2: "I want learn" (missing infinitive marker); responses average 8-10 words. Score: 1/4.
Sociolinguistic Appropriateness -> B1: Brevity prevents demonstration of professional register. Score: 2/4.
Interaction Management -> A2: No elaboration; relies entirely on one short utterance per turn. Score: 1/4.
Fluency and Delivery -> B1: Utterances too short to evaluate; grammatically fragmented. Score: 2/4.

## Student Interview Transcript to Score

{transcription}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ══════════════════════════════════════════════════════════════════════════════
# Seed function
# ══════════════════════════════════════════════════════════════════════════════

TEMPLATES = [
    {
        "name": "S4_T1_READING_NOTES_SCORING_v1",
        "template_type": "scoring",
        "system_prompt": T1_SYSTEM,
        "user_prompt_template": T1_USER,
    },
    {
        "name": "S4_T2_WRITING_EMAIL_SCORING_v1",
        "template_type": "scoring",
        "system_prompt": T2_SYSTEM,
        "user_prompt_template": T2_USER,
    },
    {
        "name": "S4_T3_LISTENING_NOTES_SCORING_v1",
        "template_type": "scoring",
        "system_prompt": T3_SYSTEM,
        "user_prompt_template": T3_USER,
    },
    {
        "name": "S4_T4_SPEAKING_INTERVIEW_SCORING_v1",
        "template_type": "scoring",
        "system_prompt": T4_SYSTEM,
        "user_prompt_template": T4_USER,
    },
]


async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        for t in TEMPLATES:
            existing = (await session.execute(
                text("SELECT id FROM prompt_templates WHERE name = :name"),
                {"name": t["name"]}
            )).fetchone()
            if existing:
                await session.execute(
                    text("DELETE FROM prompt_templates WHERE name = :name"),
                    {"name": t["name"]}
                )
                print(f"  replaced: {t['name']}")

            await session.execute(
                text("""
                    INSERT INTO prompt_templates
                        (name, template_type, system_prompt, user_prompt_template,
                         model, temperature, is_active, created_at, updated_at)
                    VALUES
                        (:name, :template_type, :system_prompt, :user_prompt_template,
                         :model, 0.0, true, now(), now())
                """),
                {
                    "name": t["name"],
                    "template_type": t["template_type"],
                    "system_prompt": t["system_prompt"],
                    "user_prompt_template": t["user_prompt_template"],
                    "model": os.environ.get("LLM_MODEL", os.environ.get("ANTHROPIC_MODEL", "gpt-4o")),
                }
            )
            print(f"  seeded:   {t['name']}")

        await session.commit()
        print("\nAll 4 prompt templates seeded.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
