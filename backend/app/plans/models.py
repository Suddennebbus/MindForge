import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON, BigInteger
from datetime import datetime
from app.utils_time import beijing_now
from app.database import Base


class Plan(Base):
    __tablename__ = "plans"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String(100), unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="draft")  # draft / active / paused / completed / archived / pending_generation
    topic = Column(String(255))  # research topic/domain
    direction = Column(String(100))  # research direction/tag
    generation_payload_json = Column(Text)  # interview answers/direction used for AI generation
    goals = Column(JSON, default=list)  # list of goal strings
    related_slugs = Column(JSON, default=list)  # linked wiki page slugs
    knowledge_gaps = Column(JSON, default=list)  # identified knowledge gaps
    suggested_readings = Column(JSON, default=list)  # suggested papers/materials
    methodology = Column(Text)
    milestones = Column(JSON, default=list)
    key_challenges = Column(JSON, default=list)
    expected_contributions = Column(JSON, default=list)
    research_questions = Column(JSON, default=list)
    file_path = Column(String(500))  # path to plan markdown file
    created_by = Column(String(36), ForeignKey("users.id"))
    updated_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)


class PlanComment(Base):
    __tablename__ = "plan_comments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    username = Column(String(100), nullable=False)
    content = Column(String(2000), nullable=False)
    parent_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=beijing_now)


class PlanAnnotation(Base):
    __tablename__ = "plan_annotations"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    username = Column(String(100), nullable=False)
    start_offset = Column(BigInteger, nullable=False)
    end_offset = Column(BigInteger, nullable=False)
    selected_text = Column(String(500), nullable=False)
    content = Column(String(2000), nullable=False)
    created_at = Column(DateTime, default=beijing_now)
