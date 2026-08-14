import uuid
from datetime import datetime
from app.utils_time import beijing_now
from sqlalchemy import Column, String, ForeignKey, Text, DateTime, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    action_type = Column(String(50), nullable=False)  # create / update / delete / execute
    resource_type = Column(String(30), nullable=False)  # wiki / raw / pre_raw / plan / config / ingest
    resource_id = Column(String(100), nullable=True)
    old_value = Column(JSON, default=dict)
    new_value = Column(JSON, default=dict)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(DateTime, default=beijing_now)

    user = relationship("User")
