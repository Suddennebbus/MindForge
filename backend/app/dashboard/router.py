from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.dashboard import service, schemas
from app import activity
from app.ai import models as ai_models

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=schemas.DashboardOut)
def get_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    data = service.get_dashboard(db)
    return schemas.DashboardOut(**data)


@router.get("/running-actions")
def running_actions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """当前正在执行的重操作（全团队可见），用于首页「最近动态」顶部提示。"""
    items = activity.list_running()

    # 摄入生成是后台任务，状态以 DB 会话为准
    sessions = (
        db.query(ai_models.IngestSession)
        .filter(ai_models.IngestSession.status == "generating")
        .all()
    )
    user_ids = {s.user_id for s in sessions}
    users = {
        u.id: (u.username or u.email or str(u.id))
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    for s in sessions:
        label = "摄入生成"
        try:
            import json
            progress = json.loads(s.progress_json or "{}")
            current = progress.get("current_title")
            total, done = progress.get("total"), progress.get("done")
            if total:
                label = f"摄入生成（{done or 0}/{total}）"
            if current:
                label = f"摄入生成（{done or 0}/{total}：{current}）" if total else f"摄入生成：{current}"
        except Exception:
            pass
        items.append({
            "key": f"ingest-{s.id}",
            "label": label,
            "operator": users.get(s.user_id, "未知用户"),
            "started_at": s.created_at.isoformat() if s.created_at else "",
        })

    return {"actions": items}
