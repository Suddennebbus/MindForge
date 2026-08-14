import uuid
from datetime import datetime
from app.utils_time import beijing_now
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    config_id = Column(String(36), ForeignKey("llm_configs.id"), nullable=True)
    direction = Column(String(255))
    payload_json = Column(Text, nullable=False, default="{}")
    plan_id = Column(String(36), ForeignKey("plans.id"), nullable=True)
    current_step_id = Column(String(36), nullable=True)
    error_message = Column(Text)
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)

    steps = relationship(
        "AgentRunStep",
        order_by="AgentRunStep.sequence",
        back_populates="run",
        cascade="all, delete-orphan",
    )


class AgentRunStep(Base):
    __tablename__ = "agent_run_steps"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String(36), ForeignKey("agent_runs.id"), nullable=False)
    sequence = Column(Integer, nullable=False)
    name = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    input_json = Column(Text)
    output_json = Column(Text)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    run = relationship("AgentRun", back_populates="steps")
