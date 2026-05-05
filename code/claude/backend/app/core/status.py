"""Status machine enums and validation logic for LCCA exam entities."""
from enum import Enum

# Module-level dicts avoid the Python Enum _attr instance-lookup gotcha where
# self._transitions on an enum instance goes through __getattr__ → member_map
# instead of the class dict, returning the wrong object.

_ATTEMPT_TRANSITIONS: dict[str, set[str]] = {
    "created":     {"in_progress"},
    "in_progress": {"submitted", "cancelled"},
    "submitted":   {"scored", "cancelled"},
    "scored":      set(),
    "cancelled":   set(),
}

_TASK_RESPONSE_TRANSITIONS: dict[str, set[str]] = {
    "not_started": {"in_progress"},
    "in_progress": {"submitted"},
    "submitted":   {"scored"},
    "scored":      set(),
}

_ARTIFACT_TRANSITIONS: dict[str, set[str]] = {
    "uploading": {"uploaded", "failed"},
    "uploaded":  set(),
    "failed":    set(),
}

_SCORE_RUN_TRANSITIONS: dict[str, set[str]] = {
    "pending":   {"running"},
    "running":   {"completed", "failed"},
    "completed": set(),
    "failed":    {"pending"},  # allow retry
}

_SCENARIO_TRANSITIONS: dict[str, set[str]] = {
    "draft":     {"published"},
    "published": {"archived"},
    "archived":  set(),
}


class AttemptStatus(str, Enum):
    """attempt entity status machine: created -> in_progress -> submitted -> scored -> cancelled"""
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    SCORED = "scored"
    CANCELLED = "cancelled"

    def can_transition_to(self, target: "AttemptStatus") -> bool:
        return target.value in _ATTEMPT_TRANSITIONS.get(self.value, set())


class TaskResponseStatus(str, Enum):
    """task_response entity status machine: not_started -> in_progress -> submitted -> scored"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    SCORED = "scored"

    def can_transition_to(self, target: "TaskResponseStatus") -> bool:
        return target.value in _TASK_RESPONSE_TRANSITIONS.get(self.value, set())


class ArtifactStatus(str, Enum):
    """response_artifact entity status machine: uploading -> uploaded -> failed"""
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"

    def can_transition_to(self, target: "ArtifactStatus") -> bool:
        return target.value in _ARTIFACT_TRANSITIONS.get(self.value, set())


class ScoreRunStatus(str, Enum):
    """score_run entity status machine: pending -> running -> completed -> failed"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

    def can_transition_to(self, target: "ScoreRunStatus") -> bool:
        return target.value in _SCORE_RUN_TRANSITIONS.get(self.value, set())


class ScenarioStatus(str, Enum):
    """scenario/task entity status machine: draft -> published -> archived"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

    def can_transition_to(self, target: "ScenarioStatus") -> bool:
        return target.value in _SCENARIO_TRANSITIONS.get(self.value, set())


class TaskType(str, Enum):
    READING = "reading"
    WRITING = "writing"
    LISTENING = "listening"
    SPEAKING = "speaking"
