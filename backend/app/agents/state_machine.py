VALID_TRANSITIONS = {
    "pending": ["running"],
    "running": ["pausing", "paused", "completed", "failed", "cancelled"],
    "pausing": ["paused", "completed", "failed", "cancelled"],
    "paused": ["running", "cancelled"],
    "failed": ["running"],
    "interrupted": ["running", "cancelled"],
    "completed": [],
    "cancelled": [],
}

STEP_STATUSES = {"pending", "running", "completed", "failed", "skipped", "paused"}


def can_transition(from_status: str, to_status: str) -> bool:
    if from_status not in VALID_TRANSITIONS:
        return False
    return to_status in VALID_TRANSITIONS[from_status]


def is_terminal_status(status: str) -> bool:
    return status in {"completed", "cancelled"}
