import uuid
from sqlalchemy import Column, String, DateTime, Boolean, false
from datetime import datetime
from app.utils_time import beijing_now
from app.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer", nullable=False)
    must_change_password = Column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)


class RolePermission(Base):
    __tablename__ = "roles_permissions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role_name = Column(String(20), nullable=False)
    permission = Column(String(20), nullable=False)
    resource = Column(String(30), nullable=False)
    created_at = Column(DateTime, default=beijing_now)
