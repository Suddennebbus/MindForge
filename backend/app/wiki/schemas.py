from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime


class WikiPageCreate(BaseModel):
    slug: str
    title: str
    type: str  # entity / concept / synthesis
    content: str
    tags: List[str] = []
    summary: str = ""
    source_paths: List[str] = []
    linked_slugs: List[str] = []


class WikiPageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    source_paths: Optional[List[str]] = None
    linked_slugs: Optional[List[str]] = None
    status: Optional[str] = None


class RawFileRef(BaseModel):
    id: str
    original_name: str


class WikiPageOut(BaseModel):
    id: UUID
    slug: str
    title: str
    type: str
    status: str
    tags: List[str]
    summary: str
    source_paths: List[str]
    linked_slugs: List[str]
    file_path: str
    content: str = ""
    raw_files: List[RawFileRef] = []
    created_by: Optional[UUID]
    updated_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WikiGraphNode(BaseModel):
    id: str
    slug: str
    title: str
    type: str
    linked_slugs: List[str] = []


class WikiSyncStatusOut(BaseModel):
    pending_count: int
    has_pending: bool


class WikiUpdateDetailOut(BaseModel):
    file_id: Optional[str] = None
    filename: Optional[str] = None
    status: str
    slug: Optional[str] = None
    title: Optional[str] = None
    slugs: List[str] = []
    titles: List[str] = []
    count: Optional[int] = None
    reason: Optional[str] = None
    message: Optional[str] = None


class WikiUpdateResultOut(BaseModel):
    missing_slugs: List[str]
    orphan_raw_files: List[RawFileRef] = []
    reingested_count: int
    errors: int
    details: List[WikiUpdateDetailOut] = []
    snapshot_updated: bool
