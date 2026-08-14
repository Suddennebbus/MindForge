from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.audit import models, schemas

router = APIRouter(prefix="/audit", tags=["audit"])


action_labels = {
    "create": "创建",
    "update": "更新",
    "delete": "删除",
    "execute": "执行",
}

resource_labels = {
    "wiki": "Wiki",
    "raw": "资料",
    "pre_raw": "待审资料",
    "ingest": "入库",
    "update_knowledge_base": "知识库恢复",
    "plan": "计划",
}


def _build_title(log: models.AuditLog) -> str:
    title = ""
    if isinstance(log.new_value, dict):
        title = log.new_value.get("title") or log.new_value.get("filename") or ""
    if not title and isinstance(log.old_value, dict):
        title = log.old_value.get("title") or log.old_value.get("filename") or ""
    if not title:
        title = log.resource_id or ""
    return title


def _build_href(log: models.AuditLog) -> Optional[str]:
    resource = log.resource_type or ""
    resource_id = log.resource_id
    if not resource_id:
        return None
    if resource == "wiki":
        return f"/wiki/{resource_id}"
    elif resource == "raw":
        return f"/raw/{resource_id}"
    elif resource == "pre_raw":
        return f"/pre-raw/{resource_id}"
    elif resource == "plan":
        return f"/plans/{resource_id}"
    return None


def _match_action_type(keyword: str) -> List[str]:
    """Return raw action_types whose Chinese label contains the keyword."""
    keyword = keyword.lower()
    matches = [kw for kw, label in action_labels.items() if keyword in label.lower()]
    return matches


def _match_resource_type(keyword: str) -> List[str]:
    """Return raw resource_types whose Chinese label contains the keyword."""
    keyword = keyword.lower()
    matches = [kw for kw, label in resource_labels.items() if keyword in label.lower()]
    return matches


@router.get("/logs", response_model=List[schemas.AuditLogOut])
def list_logs(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
    action: Optional[str] = Query(None, description="动作关键词过滤"),
    operator: Optional[str] = Query(None, description="操作人用户名过滤"),
    date_from: Optional[date] = Query(None, description="开始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    limit: int = Query(100, ge=1, le=500),
):
    query = db.query(models.AuditLog).options(joinedload(models.AuditLog.user))

    if action:
        matched_actions = _match_action_type(action)
        matched_resources = _match_resource_type(action)
        filters = [
            models.AuditLog.action_type.ilike(f"%{action}%"),
            models.AuditLog.resource_type.ilike(f"%{action}%"),
        ]
        filters.extend([models.AuditLog.action_type == a for a in matched_actions])
        filters.extend([models.AuditLog.resource_type == r for r in matched_resources])
        query = query.filter(or_(*filters))

    if operator:
        query = query.join(models.AuditLog.user).filter(User.username.ilike(f"%{operator}%"))
    if date_from:
        query = query.filter(models.AuditLog.created_at >= date_from)
    if date_to:
        # Include the whole day.
        from datetime import timedelta
        query = query.filter(models.AuditLog.created_at < date_to + timedelta(days=1))

    logs = query.order_by(models.AuditLog.created_at.desc()).limit(limit).all()

    result = []
    for log in logs:
        result.append(
            schemas.AuditLogOut(
                id=log.id,
                user_id=log.user_id,
                username=getattr(log.user, "username", None),
                action_type=log.action_type,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                title=_build_title(log),
                href=_build_href(log),
                created_at=log.created_at,
            )
        )
    return result
