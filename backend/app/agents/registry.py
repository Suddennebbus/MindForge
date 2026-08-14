from dataclasses import dataclass, field
from typing import Callable, Awaitable, Any


@dataclass
class Step:
    name: str
    func: Callable[[dict, Any], Awaitable[dict]]


@dataclass
class Workflow:
    key: str
    steps: list[Step] = field(default_factory=list)


WORKFLOWS: dict[str, Workflow] = {}


def register_workflow(workflow: Workflow) -> None:
    WORKFLOWS[workflow.key] = workflow


def get_workflow(key: str) -> Workflow | None:
    return WORKFLOWS.get(key)
