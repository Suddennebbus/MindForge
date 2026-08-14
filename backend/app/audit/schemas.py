from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AuditLogOut(BaseModel):
    id: str
    user_id: str
    username: Optional[str]
    action_type: str
    resource_type: str
    resource_id: Optional[str]
    title: Optional[str]
    href: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
