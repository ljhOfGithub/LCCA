"""Prompt templates for scoring tasks."""

# Default system prompts
WRITING_SYSTEM_PROMPT = """You are an expert English writing evaluator assessing student responses according to standardized rubrics.

Your evaluation must be:
1. Objective and consistent
2. Based only on the evidence in the submission
3. Aligned with the provided rubric criteria
4. Constructive and specific in feedback

Evaluate each criterion independently and provide:
- A score from 0 to max_score
- Specific feedback identifying strengths and areas for improvement
- Examples from the submission where possible"""

SPEAKING_SYSTEM_PROMPT = """You are an expert English speaking evaluator assessing student responses according to standardized rubrics.

Your evaluation must be:
1. Based on the transcription provided
2. Consider fluency, pronunciation, vocabulary, and grammar
3. Provide specific, actionable feedback
4. Be consistent across evaluations

Evaluate each criterion independently and provide:
- A score from 0 to max_score
- Specific feedback on pronunciation, vocabulary, and fluency
- Suggestions for improvement"""


# Default user prompt template for writing
DEFAULT_WRITING_PROMPT = """Task: {task_title}

Rubric Criteria:
{criteria}

Student Submission:
{submission}

Evaluate the submission based on the rubric above.

For each criterion:
1. Assign a score (0-{max_score})
2. Provide 1-2 sentences of specific feedback

Return your evaluation in this JSON format:
{{
  "scores": [
    {{"criterion": "<name>", "score": <number>, "max_score": <number>, "feedback": "<text>"}},
    ...
  ],
  "overall_feedback": "<summary of overall performance>"
}}"""


# Default user prompt template for speaking
DEFAULT_SPEAKING_PROMPT = """Task: {task_title}

Question: {question}

Student Response (transcribed):
{transcription}

Evaluate the speaking response based on these criteria:
{criteria}

For each criterion:
1. Assign a score (0-{max_score})
2. Provide 1-2 sentences of specific feedback

Return your evaluation in this JSON format:
{{
  "scores": [
    {{"criterion": "<name>", "score": <number>, "max_score": <number>, "feedback": "<text>"}},
    ...
  ],
  "overall_feedback": "<summary of overall performance>"
}}"""


def get_writing_prompt(
    task_title: str,
    criteria: list[dict],
    submission: str,
) -> str:
    """Build writing evaluation prompt.

    Args:
        task_title: Title of the writing task
        criteria: List of criterion dicts with 'name', 'description', 'max_score'
        submission: Student's written response

    Returns:
        Formatted prompt string
    """
    criteria_text = "\n".join(
        f"- {c['name']} (max {c.get('max_score', 10)}): {c.get('description', '')}"
        for c in criteria
    )
    max_score = max(c.get("max_score", 10) for c in criteria)

    return DEFAULT_WRITING_PROMPT.format(
        task_title=task_title,
        criteria=criteria_text,
        submission=submission,
        max_score=max_score,
    )


def get_speaking_prompt(
    task_title: str,
    question: str,
    transcription: str,
    criteria: list[dict],
) -> str:
    """Build speaking evaluation prompt.

    Args:
        task_title: Title of the speaking task
        question: The question asked
        transcription: ASR transcription of response
        criteria: List of criterion dicts with 'name', 'description', 'max_score'

    Returns:
        Formatted prompt string
    """
    criteria_text = "\n".join(
        f"- {c['name']} (max {c.get('max_score', 10)}): {c.get('description', '')}"
        for c in criteria
    )
    max_score = max(c.get("max_score", 10) for c in criteria)

    return DEFAULT_SPEAKING_PROMPT.format(
        task_title=task_title,
        question=question,
        transcription=transcription,
        criteria=criteria_text,
        max_score=max_score,
    )


def parse_score_response(content: str) -> dict:
    """Parse JSON response from LLM scoring.

    Args:
        content: Raw response content from LLM

    Returns:
        Parsed dict with scores and feedback

    Raises:
        ValueError: If response cannot be parsed
    """
    import json

    # Try to extract JSON from the response
    # LLM might wrap in ```json blocks or have extra text
    content = content.strip()

    # Remove markdown code blocks if present
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]

    if content.endswith("```"):
        content = content[:-3]

    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        # Try to find JSON object in the text
        import re
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError(f"Cannot parse LLM response as JSON: {e}\nContent: {content[:500]}")