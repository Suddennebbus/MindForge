import json

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.raw import models as raw_models
from app.wiki import models as wiki_models
from app.plans import models as plans_models
from app.audit import models as audit_models
from app.auth import models as auth_models
from app.ai import models as ai_models


def compute_health_score(db: Session) -> int:
    """Health score from the latest lint report, floored at 10.

    Deductions: 2 per critical, 1.5 per warning, 0.5 per info.
    Defaults to 100 when no lint report exists yet.
    """
    report = (
        db.query(ai_models.LintReport)
        .order_by(ai_models.LintReport.created_at.desc())
        .first()
    )
    if not report:
        return 100
    try:
        result = json.loads(report.result_json)
    except (ValueError, TypeError):
        return 100
    summary = result.get("summary") or {}
    criticals = int(summary.get("critical", 0) or 0)
    warnings = int(summary.get("warning", 0) or 0)
    infos = int(summary.get("info", 0) or 0)
    return max(10, round(100 - criticals * 2 - warnings * 1.5 - infos * 0.5))


def _recent_items(db: Session, limit: int = 5):
    """Return a unified recent activity feed from audit logs."""
    logs = (
        db.query(audit_models.AuditLog)
        .options(joinedload(audit_models.AuditLog.user))
        .order_by(audit_models.AuditLog.created_at.desc())
        .limit(limit * 2)
        .all()
    )
    items = []
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
    # 统一命名（与操作日志一致）：摄入类 → 更新知识库；体检类 → 执行知识库体检
    unified_labels = {
        "ingest": "更新知识库",
        "update_knowledge_base": "更新知识库",
        "lint": "执行知识库体检",
        "lint_fix": "执行知识库体检",
    }
    for log in logs:
        resource_id = log.resource_id or ""
        resource = log.resource_type or ""
        action = log.action_type or ""
        href = None
        if resource == "wiki":
            href = f"/wiki/{resource_id}"
        elif resource == "raw":
            href = f"/raw/{resource_id}"
        elif resource == "pre_raw":
            href = f"/pre-raw/{resource_id}"
        elif resource == "plan":
            href = f"/plans/{resource_id}"

        title = ""
        if isinstance(log.new_value, dict):
            title = log.new_value.get("title") or log.new_value.get("filename") or ""
        if not title and isinstance(log.old_value, dict):
            title = log.old_value.get("title") or log.old_value.get("filename") or ""
        if not title:
            title = resource_id

        operator = getattr(log.user, "username", None)

        unified = unified_labels.get(resource)
        items.append({
            "id": log.id,
            "type": unified or resource_labels.get(resource, resource),
            "title": title,
            "subtitle": unified or f"{action_labels.get(action, action)}{resource_labels.get(resource, resource)}",
            "href": href,
            "created_at": log.created_at,
            "action": action_labels.get(action, action),
            "action_type": action,
            "resource_type": resource,
            "operator": operator,
        })
    return items[:limit]


def get_dashboard(db: Session) -> dict:
    pending_review = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.storage_path.like("%/pre_raw/%"),
        raw_models.RawFile.status.in_({"pending", "reviewed"}),
    ).count()

    pending_sync = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.storage_path.like("%/raw/%"),
        raw_models.RawFile.status != "ingested",
    ).count()

    active_plans = db.query(plans_models.Plan).filter(
        plans_models.Plan.status.in_({"active", "draft", "pending_generation"}),
    ).count()

    total_wiki = db.query(wiki_models.WikiPage).count()
    total_raw = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.storage_path.like("%/raw/%")
    ).count()
    total_plans = db.query(plans_models.Plan).count()

    # Health score based on the latest wiki lint report.
    health_score = compute_health_score(db)

    recent_wiki = (
        db.query(wiki_models.WikiPage)
        .order_by(wiki_models.WikiPage.created_at.desc())
        .limit(5)
        .all()
    )
    recent_raw = (
        db.query(raw_models.RawFile)
        .filter(raw_models.RawFile.storage_path.like("%/raw/%"))
        .order_by(raw_models.RawFile.created_at.desc())
        .limit(5)
        .all()
    )
    recent_plans = (
        db.query(plans_models.Plan)
        .order_by(plans_models.Plan.created_at.desc())
        .limit(5)
        .all()
    )

    def to_recent(item, item_type, href_prefix):
        title = getattr(item, "title", None) or getattr(item, "original_name", None) or getattr(item, "filename", "")
        return {
            "id": item.id,
            "type": item_type,
            "title": title,
            "subtitle": getattr(item, "type", None) or getattr(item, "status", None),
            "href": f"{href_prefix}{getattr(item, 'slug', item.id)}",
            "created_at": item.created_at,
        }

    return {
        "pending_review": pending_review,
        "pending_sync": pending_sync,
        "active_plans": active_plans,
        "health_score": health_score,
        "stats": [
            {"label": "Wiki 页面", "value": total_wiki, "change": None, "trend": None},
            {"label": "已入库资料", "value": total_raw, "change": None, "trend": None},
            {"label": "研究计划", "value": total_plans, "change": None, "trend": None},
            {"label": "健康度", "value": health_score, "change": None, "trend": None},
        ],
        "recent_activity": _recent_items(db, 6),
        "recent_wiki": [to_recent(p, "wiki", "/wiki/") for p in recent_wiki],
        "recent_raw": [to_recent(f, "raw", "/raw/") for f in recent_raw],
        "recent_plans": [to_recent(p, "plan", "/plans/") for p in recent_plans],
    }
