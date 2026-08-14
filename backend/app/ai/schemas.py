from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LLMConfigCreate(BaseModel):
    provider: str
    model: str
    api_key: str
    base_url: Optional[str] = None
    is_default: bool = False


class LLMConfigUpdate(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_default: Optional[bool] = None


class LLMConfigOut(BaseModel):
    id: str
    user_id: str
    provider: str
    model: str
    base_url: Optional[str]
    is_default: bool

    class Config:
        from_attributes = True


class ExplorationCreate(BaseModel):
    direction: Optional[str] = None
    result_json: str


class ExplorationOut(BaseModel):
    id: str
    user_id: str
    direction: Optional[str]
    result_json: str
    created_at: datetime

    class Config:
        from_attributes = True

class LintReportOut(BaseModel):
    id: str
    user_id: str
    result_json: str
    report_path: str
    created_at: datetime

    class Config:
        from_attributes = True
