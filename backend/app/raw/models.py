import uuid
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from datetime import datetime
from app.utils_time import beijing_now
from app.database import Base


raw_file_wiki_page_links = Table(
    "raw_file_wiki_page_links",
    Base.metadata,
    Column("id", String(36), primary_key=True, default=lambda: str(uuid.uuid4())),
    Column("raw_file_id", String(36), ForeignKey("raw_files.id"), nullable=False, index=True),
    Column("wiki_page_id", String(36), ForeignKey("wiki_pages.id"), nullable=False, index=True),
    Column("created_at", DateTime, default=beijing_now),
)


class RawFile(Base):
    __tablename__ = "raw_files"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    storage_type = Column(String(20), default="local")
    storage_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger)
    mime_type = Column(String(100))
    status = Column(String(20), default="pending")  # pending / ingested / skipped / failed
    category = Column(String(100), nullable=True)  # folder/category name
    uploaded_by = Column(String(36), nullable=False)
    entity_page_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)

    wiki_pages = relationship("WikiPage", secondary=raw_file_wiki_page_links, back_populates="raw_files")


class PreRawComment(Base):
    __tablename__ = "pre_raw_comments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_file_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    username = Column(String(100), nullable=False)
    content = Column(String(2000), nullable=False)
    parent_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=beijing_now)


class RawFileAnnotation(Base):
    __tablename__ = "raw_file_annotations"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_file_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    username = Column(String(100), nullable=False)
    start_offset = Column(BigInteger, nullable=False)
    end_offset = Column(BigInteger, nullable=False)
    selected_text = Column(String(500), nullable=False)
    content = Column(String(2000), nullable=False)
    created_at = Column(DateTime, default=beijing_now)


class HumanOutput(Base):
    __tablename__ = "human_outputs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    storage_type = Column(String(20), default="local")
    storage_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger)
    mime_type = Column(String(100))
    status = Column(String(20), default="draft")  # draft / review / final / ingested
    category = Column(String(100), nullable=True)  # field/domain, e.g. "AI", "Biology"
    uploaded_by = Column(String(36), nullable=False)
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)


class HumanOutputComment(Base):
    __tablename__ = "human_output_comments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    human_output_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    username = Column(String(100), nullable=False)
    content = Column(String(2000), nullable=False)
    parent_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=beijing_now)


class HumanOutputAnnotation(Base):
    __tablename__ = "human_output_annotations"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    human_output_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    username = Column(String(100), nullable=False)
    start_offset = Column(BigInteger, nullable=False)
    end_offset = Column(BigInteger, nullable=False)
    selected_text = Column(String(500), nullable=False)
    content = Column(String(2000), nullable=False)
    created_at = Column(DateTime, default=beijing_now)
