"""Status machine enums and validation logic for LCCA exam entities."""
from enum import Enum


class AttemptStatus(str, Enum):
    """attempt entity status machine: created -> in_progress -> submitted -> scored -> cancelled"""
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    SCORED = "scored"
    CANCELLED = "cancelled"

    _transitions = {
        CREATED: {IN_PROGRESS},
        IN_PROGRESS: {SUBMITTED, CANCELLED},
        SUBMITTED: {SCORED, CANCELLED},
        SCORED: set(),
        CANCELLED: set(),
    }

    def can_transition_to(self, target: "AttemptStatus") -> bool:
        return target in self._transitions.get(self, set())


class TaskResponseStatus(str, Enum):
    """task_response entity status machine: not_started -> in_progress -> submitted -> scored"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    SCORED = "scored"

    _transitions = {
        NOT_STARTED: {IN_PROGRESS},
        IN_PROGRESS: {SUBMITTED},
        SUBMITTED: {SCORED},
        SCORED: set(),
    }

    def can_transition_to(self, target: "TaskResponseStatus") -> bool:
        return target in self._transitions.get(self, set())


class ArtifactStatus(str, Enum):
    """response_artifact entity status machine: uploading -> uploaded -> failed"""
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"

    _transitions = {
        UPLOADING: {UPLOADED, FAILED},
        UPLOADED: set(),
        FAILED: set(),
    }

    def can_transition_to(self, target: "ArtifactStatus") -> bool:
        return target in self._transitions.get(self, set())


class ScoreRunStatus(str, Enum):
    """score_run entity status machine: pending -> running -> completed -> failed"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

    _transitions = {
        PENDING: {RUNNING},
        RUNNING: {COMPLETED, FAILED},
        COMPLETED: set(),
        FAILED: {PENDING},  # allow retry
    }

    def can_transition_to(self, target: "ScoreRunStatus") -> bool:
        return target in self._transitions.get(self, set())


class ScenarioStatus(str, Enum):
    """scenario/task entity status machine: draft -> published -> archived"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

    _transitions = {
        DRAFT: {PUBLISHED},
        PUBLISHED: {ARCHIVED},
        ARCHIVED: set(),
    }

    def can_transition_to(self, target: "ScenarioStatus") -> bool:
        return target in self._transitions.get(self, set())


class TaskType(str, Enum):
    READING = "reading"
    WRITING = "writing"
    LISTENING = "listening"
    SPEAKING = "speaking"