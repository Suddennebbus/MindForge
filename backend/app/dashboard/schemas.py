from pydantic import BaseModel
from datetime import datetime
from typing import List


class DashboardStat(BaseModel):
    label: str
    value: int
    change: str | None = None
    trend: str | None = None


class DashboardRecentItem(BaseModel):
    id: str
    type: str
    title: str
    subtitle: str | None = None
    href: str | None = None
    created_at: datetime
    action: str | None = None
    operator: str | None = None


class DashboardOut(BaseModel):
    pending_review: int
    pending_sync: int
    active_plans: int
    health_score: int
    stats: List[DashboardStat]
    recent_activity: List[DashboardRecentItem]
    recent_wiki: List[DashboardRecentItem]
    recent_raw: List[DashboardRecentItem]
    recent_plans: List[DashboardRecentItem]

    class Config:
        from_attributes = True
