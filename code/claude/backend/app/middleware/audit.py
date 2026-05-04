"""Audit logging middleware and utilities."""
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent, ProctoringEvent


async def log_audit_event(
    session: AsyncSession,
    user_id: UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    attempt_id: UUID | None = None,
) -> AuditEvent:
    """
    Log an audit event to the database.

    Args:
        session: Database session
        user_id: ID of the user performing the action
        action: Type of action (create, update, delete, read, etc.)
        resource_type: Type of resource being acted upon
        resource_id: ID of the resource
        details: Additional JSON details about the action
        ip_address: Client IP address
        user_agent: Client user agent
        attempt_id: Related attempt ID if applicable

    Returns:
        The created AuditEvent
    """
    audit_event = AuditEvent(
        user_id=user_id,
        event_type=action or "unknown",
        event_data=json.dumps(details) if details else None,
        ip_address=ip_address,
        user_agent=user_agent,
        attempt_id=attempt_id,
    )
    session.add(audit_event)
    return audit_event


async def log_proctoring_event(
    session: AsyncSession,
    attempt_id: UUID,
    event_type: str,
    severity: str = "low",
    details: dict | None = None,
    screenshot_key: str | None = None,
) -> ProctoringEvent:
    """
    Log a proctoring event to the database.

    Args:
        session: Database session
        attempt_id: ID of the attempt
        event_type: Type of event (tab_switch, copy_attempt, audio_threshold, etc.)
        severity: Event severity (low, medium, high, critical)
        details: Additional JSON details
        screenshot_key: S3 key for screenshot if captured

    Returns:
        The created ProctoringEvent
    """
    proctoring_event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type=event_type,
        severity=severity,
        event_data=json.dumps(details) if details else None,
        screenshot_key=screenshot_key,
    )
    session.add(proctoring_event)
    return proctoring_event


# Common audit action types
class AuditAction:
    """Standard audit action types."""
    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"

    # User management
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    USER_DEACTIVATE = "user_deactivate"

    # Scenario management
    SCENARIO_CREATE = "scenario_create"
    SCENARIO_UPDATE = "scenario_update"
    SCENARIO_DELETE = "scenario_delete"
    SCENARIO_PUBLISH = "scenario_publish"

    # Task management
    TASK_CREATE = "task_create"
    TASK_UPDATE = "task_update"
    TASK_DELETE = "task_delete"

    # Rubric management
    RUBRIC_CREATE = "rubric_create"
    RUBRIC_UPDATE = "rubric_update"
    RUBRIC_DELETE = "rubric_delete"
    CRITERION_CREATE = "criterion_create"
    CRITERION_UPDATE = "criterion_update"
    CRITERION_DELETE = "criterion_delete"

    # Attempt management
    ATTEMPT_START = "attempt_start"
    ATTEMPT_SUBMIT = "attempt_submit"
    ATTEMPT_CANCEL = "attempt_cancel"

    # Scoring
    SCORE_SUBMIT = "score_submit"
    SCORE_APPROVE = "score_approve"
    SCORE_REJECT = "score_reject"

    # Proctoring
    PROCTOR_VIOLATION = "proctor_violation"
    PROCTOR_SUSPICIOUS = "proctor_suspicious"


# Common proctoring event types
class ProctoringEventType:
    """Standard proctoring event types."""
    TAB_SWITCH = "tab_switch"
    COPY_ATTEMPT = "copy_attempt"
    PASTE_ATTEMPT = "paste_attempt"
    AUDIO_THRESHOLD = "audio_threshold"
    NO_AUDIO = "no_audio"
    FACE_NOT_DETECTED = "face_not_detected"
    MULTIPLE_FACES = "multiple_faces"
    SCREEN_SHARE_DETECTED = "screen_share_detected"
    BROWSER_FOCUS_LOST = "browser_focus_lost"
    IDLE_TIMEOUT = "idle_timeout"


# Severity levels
class Severity:
    """Event severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"