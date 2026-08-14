from pydantic import BaseModel, field_validator
from typing import List, Optional
from uuid import UUID
from datetime import datetime


class PlanCreate(BaseModel):
    title: str
    description: str = ""
    topic: str = ""
    direction: str = ""
    goals: List[str] = []
    related_slugs: List[str] = []
    knowledge_gaps: List[str] = []
    suggested_readings: List[dict] = []
    methodology: Optional[str] = None
    milestones: List[str] = []
    key_challenges: List[str] = []
    expected_contributions: List[str] = []
    research_questions: List[str] = []


class PlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    topic: Optional[str] = None
    direction: Optional[str] = None
    goals: Optional[List[str]] = None
    related_slugs: Optional[List[str]] = None
    knowledge_gaps: Optional[List[str]] = None
    suggested_readings: Optional[List[dict]] = None
    methodology: Optional[str] = None
    milestones: Optional[List[str]] = None
    key_challenges: Optional[List[str]] = None
    expected_contributions: Optional[List[str]] = None
    research_questions: Optional[List[str]] = None


class PlanOut(BaseModel):
    id: UUID
    slug: str
    title: str
    description: str
    status: str
    topic: str
    direction: str
    goals: List[str]
    related_slugs: List[str]
    knowledge_gaps: List[str]
    suggested_readings: List[dict]
    methodology: Optional[str] = None
    milestones: Optional[List[str]] = None
    key_challenges: Optional[List[str]] = None
    expected_contributions: Optional[List[str]] = None
    research_questions: Optional[List[str]] = None
    generation_payload_json: Optional[str] = None
    file_path: Optional[str] = None
    created_by: Optional[UUID]
    updated_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    @field_validator("topic", "direction", "description", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        # 历史数据可能为 NULL（如 pending_generation 计划未填 topic），统一转为空串
        return v if v is not None else ""

    class Config:
        from_attributes = True


class PlanCommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None


class PlanCommentOut(BaseModel):
    id: str
    plan_id: str
    user_id: str
    username: str
    content: str
    parent_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PlanAnnotationCreate(BaseModel):
    start_offset: int
    end_offset: int
    selected_text: str
    content: str


class PlanAnnotationOut(BaseModel):
    id: str
    plan_id: str
    user_id: str
    username: str
    start_offset: int
    end_offset: int
    selected_text: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
