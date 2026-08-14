import uuid
from datetime import datetime
from app.utils_time import beijing_now
from sqlalchemy import Column, String, Boolean, ForeignKey, Text, DateTime
from app.database import Base


class LLMConfig(Base):
    __tablename__ = "llm_configs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False)
    provider = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    api_key_encrypted = Column(Text, nullable=False)
    base_url = Column(String(500))
    is_default = Column(Boolean, default=False)


class Exploration(Base):
    __tablename__ = "explorations"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False)
    direction = Column(String(255))
    result_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=beijing_now)

class LintReport(Base):
    __tablename__ = "lint_reports"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False)
    result_json = Column(Text, nullable=False)
    report_path = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=beijing_now)


class IngestSession(Base):
    """两阶段摄入会话：阶段一规划页面清单，用户确认后阶段二逐页生成。"""
    __tablename__ = "ingest_sessions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_file_id = Column(String(36), ForeignKey("raw_files.id"), nullable=False)
    user_id = Column(String(36), nullable=False)
    status = Column(String(20), default="planned")  # planned / generating / completed / failed / cancelled
    plan_json = Column(Text, default="{}")       # 阶段一原始规划 {"pages": [...]}
    progress_json = Column(Text, default="{}")   # {total, done, current_title, page_results[]}
    error = Column(Text)
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)


class AICallLog(Base):
    __tablename__ = "ai_call_logs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False)
    operation_type = Column(String(20), nullable=False)  # ingest / query / explore / lint / plan / plan_interview
    llm_config_id = Column(String(36), nullable=True)
    input_tokens = Column(String(20), default="0")
    output_tokens = Column(String(20), default="0")
    cost_usd = Column(String(20), default="0")
    duration_ms = Column(String(20), default="0")
    status = Column(String(20), default="success")  # success / failed
    error_message = Column(Text)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=beijing_now)
