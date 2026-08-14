from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class WikiPageLinkOut(BaseModel):
    id: str
    slug: str
    title: str
    type: str

    class Config:
        from_attributes = True


class RawFileOut(BaseModel):
    id: str
    filename: str
    original_name: str
    storage_type: str
    storage_path: str
    file_size: Optional[int]
    mime_type: Optional[str]
    status: str
    category: Optional[str]
    uploaded_by: str
    entity_page_id: Optional[str] = None
    entity_page_slug: Optional[str] = None
    wiki_pages: List[WikiPageLinkOut] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StatusUpdate(BaseModel):
    status: str


class PreRawCommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None


class PreRawCommentOut(BaseModel):
    id: str
    raw_file_id: str
    user_id: str
    username: str
    content: str
    parent_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    start_offset: int
    end_offset: int
    selected_text: str
    content: str


class AnnotationOut(BaseModel):
    id: str
    raw_file_id: str
    user_id: str
    username: str
    start_offset: int
    end_offset: int
    selected_text: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class FileContentOut(BaseModel):
    type: str
    content: Optional[str] = None
    mime_type: Optional[str] = None
    download_url: Optional[str] = None


class HumanOutputOut(BaseModel):
    id: str
    filename: str
    original_name: str
    storage_type: str
    storage_path: str
    file_size: Optional[int]
    mime_type: Optional[str]
    status: str
    category: Optional[str]
    uploaded_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HumanOutputStatusUpdate(BaseModel):
    status: str


class HumanOutputCommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None


class HumanOutputCommentOut(BaseModel):
    id: str
    human_output_id: str
    user_id: str
    username: str
    content: str
    parent_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class HumanOutputAnnotationCreate(BaseModel):
    start_offset: int
    end_offset: int
    selected_text: str
    content: str


class HumanOutputAnnotationOut(BaseModel):
    id: str
    human_output_id: str
    user_id: str
    username: str
    start_offset: int
    end_offset: int
    selected_text: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
