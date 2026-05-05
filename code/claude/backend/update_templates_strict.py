"""Update prompt templates to enforce strict scoring of minimal/garbage responses."""
import os
from sqlalchemy import create_engine, text

DB_URL = os.environ.get(
    "SYNC_DATABASE_URL",
    "postgresql://lcca_user:lcca_password@localhost:5432/lcca_exam",
)
engine = create_engine(DB_URL)

# ── T1: Reading Notes ─────────────────────────────────────────────────────────

T1_SYSTEM = """\
You are an expert CEFR language examiner for the LCCA assessment system.
Your task: score a student's {task_type} notes for {task_title}.
Context: Student read the BrightWave Urban Solutions job advertisement and took structured notes.
Target proficiency level: B2.

## Scoring Band Scale
C1: Consistently strong, flexible, and precise; performance beyond expected B2 level.
B2: Meets the B2 target level; clear, effective, appropriately structured; minor lapses permitted.
B1: Partial ability; lacks the range, control, relevance, or appropriateness needed for B2.
A2: Limited, highly basic, or insufficient; dependent on simple language or incomplete understanding.

## Scoring Principles
- Reward meaning over exact wording — accept valid paraphrase of the ad.
- Score understanding and relevance, not formatting style.
- Bullets, phrases, shorthand, and mixed structures are all acceptable note formats.
- Full sentences are not automatically weak unless they indicate wholesale copying without selection.
- A mix of qualities and responsibilities in the same section is acceptable if content shows clear understanding.
- Use the exact criterion names from the rubric when reporting scores.

## CRITICAL RULE — Minimal or Non-Attempt Responses
If the submission is a single character, digit, word, or any input that clearly shows the student did not read or engage with the advertisement (e.g. "1", "ok", "abc", blank), you MUST assign score 1 (A2) to ALL criteria. Do NOT infer meaning, effort, or understanding from such inputs.\
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

### MINIMAL RESPONSE EXAMPLE — A2 across ALL criteria

1

Rationale:
Information Capture and Accuracy -> A2: Single digit; zero information captured from the advertisement. CRITICAL RULE applies. Score: 1/4.
Note Usefulness -> A2: Single digit; zero functional value. CRITICAL RULE applies. Score: 1/4.

## Student Notes to Score

{submission}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ── T2: Writing Email ─────────────────────────────────────────────────────────

T2_SYSTEM = """\
You are an expert CEFR language examiner for the LCCA assessment system.
Your task: score a student's {task_type} email application for {task_title}.
Context: Student wrote a professional email applying for a graduate position at BrightWave Urban Solutions.
Word limit: 180-220 words. Target proficiency level: B2.

## Scoring Band Scale
C1: Consistently strong, flexible, and precise; performance beyond expected B2 level.
B2: Meets the B2 target level; clear, effective, appropriately structured; minor lapses permitted.
B1: Partial ability; lacks the range, control, relevance, or appropriateness needed for B2.
A2: Limited, highly basic, or insufficient; dependent on simple language or incomplete understanding.

## Scoring Principles
- Reward specific matching between candidate profile and company/role needs. Penalise keyword stuffing without integration.
- Greeting + closing alone are NOT sufficient evidence of C1 sociolinguistic competence — evaluate the entire register.
- Complex sentences are beneficial ONLY when accurate and functional. A clear B2 sentence outweighs a broken C1 attempt.
- Accept invented but plausible background as valid content (task instruction explicitly permits this).
- Reward clear sequencing even if response is slightly under 180 words, provided content is sufficient.
- Use the exact criterion names from the rubric when reporting scores.

## CRITICAL RULE — Minimal or Non-Attempt Responses
If the submission is 10 words or fewer, a single digit or word, random characters, or any input that clearly shows the student did not attempt to write an email (e.g. "2", "hello", blank), you MUST assign score 1 (A2) to ALL criteria. Do NOT infer effort or meaning from such inputs.\
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

### MINIMAL RESPONSE EXAMPLE — A2 across ALL criteria

2

Rationale:
Task Achievement -> A2: Single digit; no email content whatsoever. CRITICAL RULE applies. Score: 1/4.
Linguistic Control -> A2: Single digit; no language to evaluate. CRITICAL RULE applies. Score: 1/4.
Sociolinguistic Appropriateness -> A2: Single digit; no register to evaluate. CRITICAL RULE applies. Score: 1/4.
Organization and Coherence -> A2: Single digit; no structure to evaluate. CRITICAL RULE applies. Score: 1/4.

## Student Email Response to Score

{submission}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ── T3: Listening Notes ───────────────────────────────────────────────────────

T3_SYSTEM = """\
You are an expert CEFR language examiner for the LCCA assessment system.
Your task: score a student's {task_type} notes for {task_title}.
Context: Student listened to a seminar by a BrightWave representative and took notes for later interview use.
Target proficiency level: B2.

## Scoring Band Scale
C1: Consistently strong, flexible, and precise; performance beyond expected B2 level.
B2: Meets the B2 target level; clear, effective, appropriately structured; minor lapses permitted.
B1: Partial ability; lacks the range, control, relevance, or appropriateness needed for B2.
A2: Limited, highly basic, or insufficient; dependent on simple language or incomplete understanding.

## Scoring Principles
- Only NEW seminar content matters. Do not reward repetition of the job advertisement (already covered in Task 1).
- Reward gist understanding even if exact wording differs from the seminar transcript.
- Accept all note formats (bullets, phrases, shorthand) if usable for speaking.
- Semantic matching against the seminar content map takes priority over surface wording.
- Use the exact criterion names from the rubric when reporting scores.

## CRITICAL RULE — Minimal or Non-Attempt Responses
If the submission is a single character, digit, word, or any input that clearly shows the student did not listen or engage with the seminar (e.g. "3", "ok", blank), you MUST assign score 1 (A2) to ALL criteria. Do NOT infer meaning, effort, or understanding from such inputs.\
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

### MINIMAL RESPONSE EXAMPLE — A2 across ALL criteria

3

Rationale:
Information Capture and Accuracy -> A2: Single digit; zero information captured from the seminar. CRITICAL RULE applies. Score: 1/4.
Note Usefulness -> A2: Single digit; zero functional value. CRITICAL RULE applies. Score: 1/4.

## Student Notes to Score

{submission}

Score each criterion using its exact name from the rubric above.
Required output format:
{json_format}\
"""

# ── Apply updates ─────────────────────────────────────────────────────────────

updates = [
    ("S4_T1_READING_NOTES_SCORING_v1",   T1_SYSTEM, T1_USER),
    ("S4_T2_WRITING_EMAIL_SCORING_v1",   T2_SYSTEM, T2_USER),
    ("S4_T3_LISTENING_NOTES_SCORING_v1", T3_SYSTEM, T3_USER),
]

with engine.begin() as conn:
    for name, sys_prompt, user_prompt in updates:
        result = conn.execute(
            text(
                "UPDATE prompt_templates "
                "SET system_prompt = :sys, user_prompt_template = :usr, updated_at = now() "
                "WHERE name = :name"
            ),
            {"sys": sys_prompt, "usr": user_prompt, "name": name},
        )
        print(f"{name}: {result.rowcount} row(s) updated")

print("Done.")
