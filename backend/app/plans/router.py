import json
import os
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from app.ai.lang import get_ui_lang
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.plans import models, schemas, storage
from app.ai import document_parser
from app.audit import service as audit_service

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", response_model=schemas.PlanOut)
def create(data: schemas.PlanCreate, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    slug = storage.unique_slug(db, data.title)
    plan = models.Plan(
        slug=slug,
        title=data.title,
        description=data.description,
        status="draft",
        topic=data.topic,
        direction=data.direction,
        goals=data.goals,
        related_slugs=data.related_slugs,
        knowledge_gaps=data.knowledge_gaps,
        suggested_readings=data.suggested_readings,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan.file_path = storage.write_plan(plan.slug, storage.build_plan_markdown(plan))
    db.commit()
    db.refresh(plan)
    audit_service.log_action(db, user.id, "create", "plan", resource_id=plan.id, new_value={"slug": plan.slug, "title": plan.title})
    return plan


@router.post("/upload", response_model=schemas.PlanOut)
def upload_plan(
    file: UploadFile = File(...),
    direction: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    allowed_suffixes = {".md", ".pdf", ".doc", ".docx", ".txt", ".html"}
    original_name = file.filename or "uploaded_plan.md"
    suffix = Path(original_name).suffix.lower()
    if suffix not in allowed_suffixes:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        if suffix == ".doc":
            text = ""
        else:
            text = document_parser.parse_document(tmp_path)
    finally:
        os.unlink(tmp_path)

    title = Path(original_name).stem or "上传的研究计划"
    slug = storage.unique_slug(db, title)
    plan = models.Plan(
        slug=slug,
        title=title,
        description=text or "",
        status="draft",
        direction=direction.strip() if direction else "",
        goals=[],
        related_slugs=[],
        knowledge_gaps=[],
        suggested_readings=[],
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan.file_path = storage.write_plan(plan.slug, storage.build_plan_markdown(plan))
    db.commit()
    db.refresh(plan)
    audit_service.log_action(db, user.id, "create", "plan", resource_id=plan.id, new_value={"slug": plan.slug, "title": plan.title})
    return plan


@router.get("", response_model=List[schemas.PlanOut])
def list_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(models.Plan).order_by(models.Plan.created_at.desc()).all()


@router.get("/{plan_id}", response_model=schemas.PlanOut)
def get(plan_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.post("/{plan_id}/continue-generation")
async def continue_generation(
    plan_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status != "pending_generation":
        raise HTTPException(status_code=400, detail="Plan is not pending generation")

    from app.agents.orchestrator import create_run_for_plan
    try:
        run = await create_run_for_plan(db, user, plan, lang=get_ui_lang(request))
        audit_service.log_action(
            db, user.id, "execute", "plan", resource_id=plan.id,
            new_value={"continue_generation": True, "run_id": run.id, "title": plan.title},
        )
        return {"run_id": run.id, "status": run.status}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{plan_id}/generate-readings")
async def generate_readings(
    plan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    """为存量计划重新检索并生成文献清单（覆盖现有 suggested_readings）。"""
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    from app.ai import service as ai_service, reading_service
    from app.ai.router import _get_default_config, _call_llm_tracked

    config = _get_default_config(db, user)

    queries = [q for q in [plan.direction, plan.title] if q and q.strip()][:2]
    web_results, arxiv_results = [], []
    seen_web, seen_arxiv = set(), set()

    # arXiv 是英文语料库，中文查询必然零结果：先让 LLM 生成英文学术查询，
    # 失败/为空时回退 direction/title 原样查询（保持可用性）
    arxiv_queries = []
    try:
        from app.ai import prompts as ai_prompts
        resp = await _call_llm_tracked(
            db, user, "reading_selection", config,
            ai_prompts.interview_plan.build_academic_query_messages(
                plan.direction or "", plan.title or "", plan.description or ""
            ),
            max_tokens=256,
        )
        text = resp.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        parsed = json.loads(text)
        if isinstance(parsed, list):
            arxiv_queries = [str(q).strip() for q in parsed if str(q).strip()][:3]
    except Exception:
        arxiv_queries = []
    if not arxiv_queries:
        arxiv_queries = queries

    for q in queries:
        for r in ai_service.search_web(q, 5):
            href = r.get("href", "")
            if href and href not in seen_web:
                seen_web.add(href)
                web_results.append(r)
    for q in arxiv_queries:
        for r in ai_service.search_arxiv(q, 5):
            href = r.get("href", "")
            if href and href not in seen_arxiv:
                seen_arxiv.add(href)
                arxiv_results.append(r)

    plan_context = (plan.description or "")[:500]

    async def llm_call(messages):
        return await _call_llm_tracked(
            db, user, "reading_selection", config, messages, max_tokens=2048
        )

    readings = await reading_service.select_readings(
        plan.direction or plan.title,
        plan_context,
        web_results[:12],
        arxiv_results[:10],
        llm_call,
    )

    plan.suggested_readings = readings
    plan.updated_by = user.id
    db.commit()
    db.refresh(plan)
    plan.file_path = storage.write_plan(plan.slug, storage.build_plan_markdown(plan))
    db.commit()
    audit_service.log_action(
        db, user.id, "update", "plan", resource_id=plan.id,
        new_value={"generate_readings": len(readings)},
    )
    return {"suggested_readings": readings, "count": len(readings)}


@router.put("/{plan_id}", response_model=schemas.PlanOut)
def update(plan_id: str, data: schemas.PlanUpdate, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for key in ["title", "description", "status", "topic", "direction", "goals", "related_slugs",
                "knowledge_gaps", "suggested_readings", "methodology", "milestones",
                "key_challenges", "expected_contributions", "research_questions"]:
        val = getattr(data, key, None)
        if val is not None:
            setattr(plan, key, val)
    plan.updated_by = user.id
    db.commit()
    db.refresh(plan)
    # Update slug if title changed and slug is not custom
    if data.title is not None and plan.slug == storage._slugify(data.title) or not plan.slug:
        plan.slug = storage.unique_slug(db, plan.title, exclude_id=plan.id)
    plan.file_path = storage.write_plan(plan.slug, storage.build_plan_markdown(plan))
    db.commit()
    db.refresh(plan)
    audit_service.log_action(db, user.id, "update", "plan", resource_id=plan.id, new_value={"slug": plan.slug, "title": plan.title, "status": plan.status})
    return plan


@router.delete("/{plan_id}")
def delete(plan_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "editor"))):
    plan = db.query(models.Plan).filter(models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    audit_service.log_action(db, user.id, "delete", "plan", resource_id=plan.id, old_value={"slug": plan.slug, "title": plan.title})
    if plan.file_path:
        storage.delete_plan(plan.file_path)
    db.delete(plan)
    db.commit()
    return {"message": "Deleted"}


@router.get("/{plan_id}/comments", response_model=List[schemas.PlanCommentOut])
def list_comments(plan_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(models.PlanComment).filter(
        models.PlanComment.plan_id == plan_id
    ).order_by(models.PlanComment.created_at.desc()).all()


@router.post("/{plan_id}/comments", response_model=schemas.PlanCommentOut)
def create_comment(
    plan_id: str,
    data: schemas.PlanCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    comment = models.PlanComment(
        plan_id=plan_id,
        user_id=user.id,
        username=user.username,
        content=data.content,
        parent_id=data.parent_id,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{plan_id}/comments/{comment_id}")
def delete_comment(
    plan_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    comment = db.query(models.PlanComment).filter(
        models.PlanComment.id == comment_id,
        models.PlanComment.plan_id == plan_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(comment)
    db.commit()
    return {"message": "Deleted"}


@router.get("/{plan_id}/annotations", response_model=List[schemas.PlanAnnotationOut])
def list_annotations(plan_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(models.PlanAnnotation).filter(
        models.PlanAnnotation.plan_id == plan_id
    ).order_by(models.PlanAnnotation.created_at.asc()).all()


@router.post("/{plan_id}/annotations", response_model=schemas.PlanAnnotationOut)
def create_annotation(
    plan_id: str,
    data: schemas.PlanAnnotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    annotation = models.PlanAnnotation(
        plan_id=plan_id,
        user_id=user.id,
        username=user.username,
        start_offset=data.start_offset,
        end_offset=data.end_offset,
        selected_text=data.selected_text,
        content=data.content,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{plan_id}/annotations/{annotation_id}")
def delete_annotation(
    plan_id: str,
    annotation_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    annotation = db.query(models.PlanAnnotation).filter(
        models.PlanAnnotation.id == annotation_id,
        models.PlanAnnotation.plan_id == plan_id,
    ).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if annotation.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(annotation)
    db.commit()
    return {"message": "Deleted"}
