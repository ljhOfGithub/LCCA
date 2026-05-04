"""Attempt state machine implementation."""
from app.core.status import AttemptStatus, TaskResponseStatus


class AttemptStateMachine:
    """State machine for Attempt entity status transitions."""

    def __init__(self, current_status: AttemptStatus):
        self.current_status = current_status

    def can_start(self) -> bool:
        return self.current_status.can_transition_to(AttemptStatus.IN_PROGRESS)

    def can_submit(self) -> bool:
        return self.current_status.can_transition_to(AttemptStatus.SUBMITTED)

    def can_cancel(self) -> bool:
        return self.current_status.can_transition_to(AttemptStatus.CANCELLED)

    def can_mark_scored(self) -> bool:
        return self.current_status.can_transition_to(AttemptStatus.SCORED)

    def transition_to(self, target: AttemptStatus) -> None:
        if not self.current_status.can_transition_to(target):
            raise ValueError(
                f"Cannot transition from {self.current_status.value} to {target.value}"
            )
        self.current_status = target


class TaskResponseStateMachine:
    """State machine for TaskResponse entity status transitions."""

    def __init__(self, current_status: TaskResponseStatus):
        self.current_status = current_status

    def can_start(self) -> bool:
        return self.current_status.can_transition_to(TaskResponseStatus.IN_PROGRESS)

    def can_submit(self) -> bool:
        return self.current_status.can_transition_to(TaskResponseStatus.SUBMITTED)

    def can_mark_scored(self) -> bool:
        return self.current_status.can_transition_to(TaskResponseStatus.SCORED)

    def transition_to(self, target: TaskResponseStatus) -> None:
        if not self.current_status.can_transition_to(target):
            raise ValueError(
                f"Cannot transition from {self.current_status.value} to {target.value}"
            )
        self.current_status = target
