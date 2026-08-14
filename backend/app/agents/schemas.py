from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AgentRunStepOut(BaseModel):
    id: str
    sequence: int
    name: str
    status: str
    input_json: Optional[str] = None
    output_json: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AgentRunOut(BaseModel):
    id: str
    workflow: str
    status: str
    user_id: str
    config_id: Optional[str] = None
    direction: Optional[str] = None
    payload_json: str = "{}"
    plan_id: Optional[str] = None
    current_step_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    steps: list[AgentRunStepOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AgentRunCreate(BaseModel):
    direction: str
    answers: dict = Field(default_factory=dict)
    exploration_result: Optional[dict] = None
    recommendation: Optional[dict] = None


class AgentRunAction(BaseModel):
    action: str  # pause, resume, retry, cancel
