import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.utils_time import beijing_now
from app.database import Base


class WikiPage(Base):
    __tablename__ = "wiki_pages"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    type = Column(String(20), nullable=False)  # entity / concept / synthesis
    status = Column(String(20), default="active")
    tags = Column(JSON, default=list)
    summary = Column(Text)
    source_paths = Column(JSON, default=list)
    linked_slugs = Column(JSON, default=list)
    file_path = Column(String(500), nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"))
    updated_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)

    raw_files = relationship("RawFile", secondary="raw_file_wiki_page_links", back_populates="wiki_pages")
