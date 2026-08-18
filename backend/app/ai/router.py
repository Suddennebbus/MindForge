import asyncio
import json
import re
import time
from datetime import datetime
from app.utils_time import beijing_now
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db, SessionLocal
from app.auth.dependencies import get_current_user, require_role
from app.auth.models import User
from app.ai import models, schemas, utils, service
from app.ai import prompts
from app.ai.prompts import lint_suggest as lint_suggest_prompts
from app.ai import ingest_service, audit_logger
from app.raw import models as raw_models, storage as raw_storage
from app.wiki import models as wiki_models, storage as wiki_storage
from app.ai import lint_service
from app.ai.lang import get_ui_lang
from app.audit import service as audit_service
from app import activity

router = APIRouter(prefix="/llm-configs", tags=["llm-configs"])
ai_router = APIRouter(prefix="/ai", tags=["ai"])


async def _call_llm_tracked(
    db: Session,
    user: User,
    operation_type: str,
    config,
    messages: list,
    stream: bool = False,
    max_tokens: int = 4096,
) -> str:
    """Call chat_completion and log to ai_call_logs."""
    start_ms = time.time() * 1000
    try:
        response = ""
        async for chunk in service.chat_completion(config, messages, stream=stream, max_tokens=max_tokens):
            if chunk and chunk != "None":
                response += chunk
        duration_ms = int(time.time() * 1000 - start_ms)
        audit_logger.log_ai_call(
            db,
            user_id=user.id,
            operation_type=operation_type,
            llm_config_id=config.id,
            duration_ms=duration_ms,
            status="success",
            metadata={"model": config.model, "provider": config.provider},
        )
        return response
    except Exception as exc:
        duration_ms = int(time.time() * 1000 - start_ms)
        audit_logger.log_ai_call(
            db,
            user_id=user.id,
            operation_type=operation_type,
            llm_config_id=config.id,
            duration_ms=duration_ms,
            status="failed",
            error_message=str(exc),
            metadata={"model": config.model, "provider": config.provider},
        )
        raise


# ----- LLM Config Routes -----

@router.post("", response_model=schemas.LLMConfigOut)
def create_config(
    data: schemas.LLMConfigCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    if data.is_default:
        db.query(models.LLMConfig).filter(
            models.LLMConfig.user_id == user.id
        ).update({"is_default": False})
    config = models.LLMConfig(
        user_id=user.id,
        provider=data.provider,
        model=data.model,
        api_key_encrypted=utils.encrypt_api_key(data.api_key),
        base_url=data.base_url,
        is_default=data.is_default,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.get("", response_model=list[schemas.LLMConfigOut])
def list_configs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return db.query(models.LLMConfig).filter(
        models.LLMConfig.user_id == user.id
    ).all()


@router.put("/{config_id}", response_model=schemas.LLMConfigOut)
def update_config(
    config_id: str,
    data: schemas.LLMConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    config = db.query(models.LLMConfig).filter(
        models.LLMConfig.id == config_id,
        models.LLMConfig.user_id == user.id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    if data.is_default:
        db.query(models.LLMConfig).filter(
            models.LLMConfig.user_id == user.id,
            models.LLMConfig.id != config_id
        ).update({"is_default": False})

    for key in ["provider", "model", "base_url", "is_default"]:
        val = getattr(data, key, None)
        if val is not None:
            setattr(config, key, val)

    if data.api_key is not None and data.api_key.strip():
        config.api_key_encrypted = utils.encrypt_api_key(data.api_key)

    db.commit()
    db.refresh(config)
    return config


@router.delete("/{config_id}")
def delete_config(
    config_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    config = db.query(models.LLMConfig).filter(
        models.LLMConfig.id == config_id,
        models.LLMConfig.user_id == user.id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    was_default = config.is_default
    db.delete(config)
    db.commit()

    if was_default:
        remaining = db.query(models.LLMConfig).filter(
            models.LLMConfig.user_id == user.id
        ).order_by(models.LLMConfig.id.desc()).first()
        if remaining:
            remaining.is_default = True
            db.commit()

    return {"message": "Deleted"}


@router.patch("/{config_id}/default", response_model=schemas.LLMConfigOut)
def set_default_config(
    config_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    config = db.query(models.LLMConfig).filter(
        models.LLMConfig.id == config_id,
        models.LLMConfig.user_id == user.id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    db.query(models.LLMConfig).filter(
        models.LLMConfig.user_id == user.id
    ).update({"is_default": False})

    config.is_default = True
    db.commit()
    db.refresh(config)
    return config


# ----- AI Operations -----

def _get_default_config(db: Session, user: User):
    config = db.query(models.LLMConfig).filter(
        models.LLMConfig.user_id == user.id,
        models.LLMConfig.is_default == True
    ).first()
    if not config:
        raise HTTPException(status_code=400, detail="No default LLM config")
    return config











from app.ai import ingest_service


# ----- 两阶段摄入：规划 → 用户确认 → 逐页生成 -----
# 注：所有建页入口统一走两阶段流程，旧单阶段 /ai/ingest 与 /wiki/sync-from-raw 已移除。

@ai_router.post("/ingest/plan")
async def ingest_plan(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """阶段一：1 次 LLM 调用，为指定 raw 文件规划页面清单（含提议新标签）。"""
    raw_file_id = data.get("raw_file_id")
    raw = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.id == raw_file_id
    ).first()
    if not raw:
        raise HTTPException(status_code=404, detail="Raw file not found")

    config = _get_default_config(db, user)
    try:
        session = await ingest_service.plan_ingest(db, raw, user, config, lang=get_ui_lang(request))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    pages = json.loads(session.plan_json or "{}").get("pages", [])
    all_new_tags = sorted({t for p in pages for t in p.get("new_tags", [])})
    return {"session_id": session.id, "pages": pages, "all_new_tags": all_new_tags}


@ai_router.post("/ingest/plan-batch")
async def ingest_plan_batch(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """批量阶段一：为所有待摄入文件（或指定文件）分别规划页面清单。

    每个文件 1 次规划 LLM 调用（≤5 个文件）；include_orphans=True 时还会
    检测被删 wiki 页面对应的孤立资料并一并规划（恢复走同样的确认流程）。
    返回每个文件的 session 与规划，前端统一弹确认框后逐会话生成。
    """
    raw_file_ids = data.get("raw_file_ids") or []
    include_orphans = bool(data.get("include_orphans"))
    if raw_file_ids:
        raws = db.query(raw_models.RawFile).filter(
            raw_models.RawFile.id.in_(raw_file_ids[:5])
        ).all()
        # IN 查询不保证顺序，按传入 id 顺序处理（与前端展示顺序一致）
        order = {rid: i for i, rid in enumerate(raw_file_ids)}
        raws.sort(key=lambda r: order.get(r.id, len(order)))
    else:
        raws = ingest_service.get_pending_raw_files(db)[:5]
    # 已关联 wiki 页面的文件跳过（与旧 sync_from_raw 行为一致）
    raws = [r for r in raws if not r.wiki_pages]
    reasons = {r.id: "pending" for r in raws}

    if include_orphans:
        from app.wiki import service as wiki_service
        _, orphaned = wiki_service.detect_orphaned_raw_files(db)
        known_ids = {r.id for r in raws}
        for orphan in orphaned:
            if orphan.id not in known_ids and len(raws) < 10:
                raws.append(orphan)
                reasons[orphan.id] = "orphan"

    config = _get_default_config(db, user)
    sessions = []
    errors = []
    for raw in raws:
        try:
            session = await ingest_service.plan_ingest(db, raw, user, config, lang=get_ui_lang(request))
        except Exception as exc:
            errors.append({"raw_file_id": raw.id, "filename": raw.original_name, "error": str(exc)})
            continue
        pages = json.loads(session.plan_json or "{}").get("pages", [])
        if not pages:
            # 空规划不留 orphan session
            session.status = "cancelled"
            session.error = "no_pages_planned"
            db.commit()
            errors.append({"raw_file_id": raw.id, "filename": raw.original_name, "error": "no_pages_planned"})
            continue
        sessions.append({
            "session_id": session.id,
            "raw_file_id": raw.id,
            "filename": raw.original_name,
            "reason": reasons.get(raw.id, "pending"),
            "pages": pages,
            "all_new_tags": sorted({t for p in pages for t in p.get("new_tags", [])}),
        })
    return {"sessions": sessions, "errors": errors}


async def _run_generation_bg(session_id: str, confirmed_pages: list, user_id: str, lang: str = "zh"):
    """后台执行阶段二生成（独立 db session，参照 agents executor 模式）。"""
    db = SessionLocal()
    try:
        await ingest_service.run_ingest_generation(db, session_id, confirmed_pages, user_id, lang=lang)
    finally:
        db.close()


@ai_router.post("/ingest/sessions/{session_id}/generate")
async def ingest_generate(
    session_id: str,
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """阶段二：按用户确认的页面清单逐页生成（后台运行，前端轮询进度）。"""
    session = db.query(models.IngestSession).filter(
        models.IngestSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Ingest session not found")
    if session.status not in ("planned",):
        raise HTTPException(status_code=400, detail=f"Session status is {session.status}, cannot generate")

    pages = data.get("pages")
    if not isinstance(pages, list):
        raise HTTPException(status_code=400, detail="pages must be a list")

    asyncio.create_task(_run_generation_bg(session_id, pages, user.id, lang=get_ui_lang(request)))
    return {"session_id": session_id}


@ai_router.get("/ingest/sessions/{session_id}")
def get_ingest_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """查询摄入会话状态与进度（前端 1.5s 轮询）。"""
    session = db.query(models.IngestSession).filter(
        models.IngestSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Ingest session not found")
    try:
        progress = json.loads(session.progress_json or "{}")
    except json.JSONDecodeError:
        progress = {}
    return {
        "session_id": session.id,
        "raw_file_id": session.raw_file_id,
        "status": session.status,
        "progress": progress,
        "error": session.error,
    }


@ai_router.post("/ingest/sessions/{session_id}/cancel")
def cancel_ingest_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """取消摄入会话：生成循环在每页开始前检查该状态。"""
    session = db.query(models.IngestSession).filter(
        models.IngestSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Ingest session not found")
    if session.status in ("planned", "generating"):
        session.status = "cancelled"
        db.commit()
    return {"session_id": session_id, "status": session.status}


@ai_router.post("/query")
async def query(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    question = data.get("question", "")
    config = _get_default_config(db, user)

    # Phase 1: read index and retrieve relevant slugs
    from app.wiki import storage as wiki_storage
    index_path = wiki_storage.WIKI_DIR / "_wiki_index.md"
    index_content = index_path.read_text(encoding="utf-8") if index_path.exists() else ""
    retrieval_messages = prompts.query.build_retrieval_messages(index_content, question)
    retrieval_response = await _call_llm_tracked(db, user, "query_retrieval", config, retrieval_messages, max_tokens=1024)

    try:
        selected_slugs = json.loads(retrieval_response)
        if not isinstance(selected_slugs, list):
            selected_slugs = []
    except json.JSONDecodeError:
        selected_slugs = []

    # Fallback: if no slugs selected, use all pages (small wiki)
    if not selected_slugs:
        selected_slugs = [p.slug for p in db.query(wiki_models.WikiPage).all()]

    # Phase 2: read selected pages and stream answer
    page_contents = []
    for slug in selected_slugs[:10]:  # limit context
        page = db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == slug).first()
        if page:
            content = wiki_storage.read_page(page.file_path)
            page_contents.append(f"[[{page.slug}]]\n{content}")
    pages_text = "\n\n---\n\n".join(page_contents)

    answer_messages = prompts.query.build_answer_messages(pages_text, question, lang=get_ui_lang(request))

    audit_logger.log_ai_call(
        db, user.id, "query", config.id,
        metadata={"question": question, "selected_slugs": selected_slugs, "model": config.model, "provider": config.provider},
    )

    # log_ai_call 的 commit 会 expire config；流式生成器在响应返回后才执行，
    # 届时 session 可能已关闭，再访问 ORM 属性会抛 DetachedInstanceError。
    # 提前把标量字段拷到轻量对象，脱离 session 使用。
    from types import SimpleNamespace
    stream_config = SimpleNamespace(
        id=config.id,
        provider=config.provider,
        model=config.model,
        api_key_encrypted=config.api_key_encrypted,
        base_url=config.base_url,
    )

    async def event_stream():
        async for chunk in service.chat_completion(stream_config, answer_messages, stream=True, max_tokens=4096):
            if chunk and chunk != "None":
                # JSON 编码保留 chunk 内换行，否则 SSE 按行拆分会丢掉 \n，
                # 前端拼接后 markdown 结构（标题/列表）全塌成一行源码
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(), media_type="text/event-stream"
    )


@ai_router.post("/query/save-synthesis")
async def save_query_synthesis(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """把用户认可的对话回答沉淀为综合页/概念页（自动完成 ingest 流程）。"""
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    title = (data.get("title") or "").strip()
    if not question or not answer:
        raise HTTPException(status_code=400, detail="question 和 answer 不能为空")

    config = _get_default_config(db, user)
    result = await ingest_service.save_chat_answer_as_page(
        db, question, answer, title, user, config, lang=get_ui_lang(request)
    )
    if result["status"] != "created":
        raise HTTPException(status_code=500, detail=result.get("message", "保存失败"))

    audit_service.log_action(
        db, user.id, "create", "wiki",
        new_value={"source": "chat_answer", "question": question[:200], "pages": result["pages"]},
    )
    return result


@ai_router.post("/explore")
async def explore(
    request: Request,
    data: dict = {},
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    direction = data.get("direction")
    config = _get_default_config(db, user)
    pages = db.query(wiki_models.WikiPage).all()
    content = "\n\n".join([
        f"[[{p.slug}]]\n{p.summary}\nTags: {', '.join(p.tags or [])}"
        for p in pages
    ])

    messages = prompts.explore.build_explore_messages(content, direction, lang=get_ui_lang(request))
    operator = user.username or user.email or str(user.id)
    with activity.running("explore", "知识探索", operator):
        # 探索结果条目多、英文输出更耗 token，4096 会截断 JSON 导致前端拿不到结果
        response = await _call_llm_tracked(db, user, "explore", config, messages, max_tokens=16384)

    if not response.strip():
        raise HTTPException(status_code=502, detail="LLM 返回为空，请重试")
    result = utils.parse_llm_json(response)
    if not isinstance(result, dict):
        result = {"raw_response": response}

    audit_service.log_action(
        db, user.id, "execute", "explore",
        new_value={"direction": direction},
    )

    return result


@ai_router.get("/explorations", response_model=list[schemas.ExplorationOut])
def list_explorations(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor", "viewer")),
):
    # 探索记录属于团队知识资产，所有用户均可查看
    return db.query(models.Exploration).order_by(
        models.Exploration.created_at.desc()
    ).all()


@ai_router.post("/explorations", response_model=schemas.ExplorationOut)
def save_exploration(
    data: schemas.ExplorationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    exploration = models.Exploration(
        user_id=user.id,
        direction=data.direction,
        result_json=data.result_json,
    )
    db.add(exploration)
    db.commit()
    db.refresh(exploration)
    audit_service.log_action(
        db, user.id, "create", "exploration", resource_id=exploration.id,
        new_value={"direction": exploration.direction},
    )
    return exploration


@ai_router.get("/explorations/{exploration_id}", response_model=schemas.ExplorationOut)
def get_exploration(
    exploration_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor", "viewer")),
):
    exploration = db.query(models.Exploration).filter(
        models.Exploration.id == exploration_id,
    ).first()
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")
    return exploration


from app.plans import models as plans_models, schemas as plans_schemas, storage as plans_storage

@ai_router.delete("/explorations/{exploration_id}")
def delete_exploration(
    exploration_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    exploration = db.query(models.Exploration).filter(
        models.Exploration.id == exploration_id,
    ).first()
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")
    if user.role != "admin" and exploration.user_id != user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    audit_service.log_action(
        db, user.id, "delete", "exploration", resource_id=exploration.id,
        old_value={"direction": exploration.direction},
    )
    db.delete(exploration)
    db.commit()
    return {"message": "Deleted"}


@ai_router.post("/generate-plan")
async def generate_plan(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    exploration_result = data.get("exploration_result", {})
    recommendation = data.get("recommendation", {})
    config = _get_default_config(db, user)

    # Fetch wiki content for context
    pages = db.query(wiki_models.WikiPage).all()
    wiki_content = "\n\n".join([
        f"[[{p.slug}]]\n{p.summary}\nTags: {', '.join(p.tags or [])}"
        for p in pages
    ])

    # Web search for authoritative sources
    search_query = recommendation.get("action", "")
    if not search_query:
        search_query = exploration_result.get("direction", "")
    web_results = service.search_web(search_query)

    # Build messages and call LLM
    messages = prompts.generate_plan.build_generate_plan_messages(
        wiki_content, exploration_result, recommendation, web_results, lang=get_ui_lang(request)
    )

    operator = user.username or user.email or str(user.id)
    with activity.running("generate-plan", "生成研究计划", operator):
        response = await _call_llm_tracked(db, user, "plan", config, messages)

    plan_data = utils.parse_llm_json(response)
    if not isinstance(plan_data, dict):
        raise HTTPException(status_code=500, detail="Failed to parse plan from LLM response")

    # Create plan
    title = plan_data.get("title", "未命名研究计划")
    slug = plans_storage.unique_slug(db, title)
    plan = plans_models.Plan(
        slug=slug,
        title=title,
        description=plan_data.get("description", ""),
        direction=plan_data.get("direction", ""),
        topic=plan_data.get("topic", ""),
        goals=plan_data.get("goals", []),
        related_slugs=plan_data.get("related_slugs", []),
        knowledge_gaps=plan_data.get("knowledge_gaps", []),
        suggested_readings=plan_data.get("suggested_readings", []),
        methodology=plan_data.get("methodology", ""),
        milestones=plan_data.get("milestones", []),
        key_challenges=plan_data.get("key_challenges", []),
        expected_contributions=plan_data.get("expected_contributions", []),
        research_questions=plan_data.get("research_questions", []),
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan.file_path = plans_storage.write_plan(plan.slug, plans_storage.build_plan_markdown(plan))
    db.commit()
    audit_service.log_action(
        db, user.id, "create", "plan", resource_id=plan.id,
        new_value={"slug": plan.slug, "title": plan.title, "source": "generate_plan"},
    )
    return {"plan_id": plan.id}


def _normalize_questions(questions: list, lang: str = "zh") -> list:
    """Ensure all interview questions are choice-based with fallback options."""
    normalized = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        # Force type to choice if missing or not recognized
        q_type = q.get("type", "choice")
        if q_type not in ("choice", "text"):
            q_type = "choice"

        choices = q.get("choices") or []
        question_text = q.get("question", "")

        # If no choices provided, generate sensible defaults based on question content
        if q_type == "choice" and not choices:
            text = question_text.lower()
            en = lang == "en"
            if any(k in text for k in ("是否", "有没有", "需不需要", "可不可以", "吗", "whether", "or not")):
                choices = ["Yes", "No", "Partially", "Not sure"] if en else ["是", "否", "部分符合", "不确定"]
            elif any(k in text for k in ("偏好", "倾向", "更喜欢", "选择", "prefer", "preference")):
                choices = ["Option A", "Option B", "Option C", "Any is fine"] if en else ["选项 A", "选项 B", "选项 C", "以上皆可"]
            elif any(k in text for k in ("时间", "周期", "多久", "时长", "timeline", "deadline", "time frame")):
                choices = ["Within 1 week", "Within 1 month", "1-3 months", "3+ months", "No deadline"] if en else ["1周内", "1个月内", "1-3个月", "3个月以上", "无明确期限"]
            elif any(k in text for k in ("深度", "广度", "范围", "规模", "depth", "breadth", "scope")):
                choices = ["Deep dive into one area", "Cover multiple areas", "Broad overview", "Flexible"] if en else ["深入单一方向", "兼顾多个方向", "全面广泛了解", "视情况调整"]
            else:
                choices = ["Strongly agree", "Mostly agree", "Somewhat disagree", "Disagree"] if en else ["非常符合", "基本符合", "不太符合", "完全不符合"]

        normalized.append({
            "id": q.get("id", f"q{len(normalized) + 1}"),
            "question": question_text or "请回答以下问题",
            "type": q_type,
            "choices": choices,
            "allow_other": q.get("allow_other", True),
            "placeholder": q.get("placeholder", "Add details..." if lang == "en" else "请补充说明..."),
        })
    return normalized


@ai_router.post("/plan-interview")
async def plan_interview(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    direction = data.get("direction", "")
    if not direction:
        raise HTTPException(status_code=400, detail="Direction is required")
    exploration_result = data.get("exploration_result")
    recommendation = data.get("recommendation")
    config = _get_default_config(db, user)
    messages = prompts.interview_plan.build_interview_messages(
        direction, exploration_result=exploration_result, recommendation=recommendation,
        lang=get_ui_lang(request),
    )
    response = await _call_llm_tracked(db, user, "plan_interview", config, messages)
    result = utils.parse_llm_json(response)
    if not isinstance(result, dict):
        result = {"raw_response": response}

    # Normalize questions to guarantee choice-based format
    raw_questions = result.get("questions", [])
    if raw_questions:
        result["questions"] = _normalize_questions(raw_questions, lang=get_ui_lang(request))
    return result


@ai_router.post("/create-plan")
async def create_plan_from_interview(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    from app.agents.schemas import AgentRunCreate
    from app.agents import orchestrator

    direction = data.get("direction", "")
    if not direction:
        raise HTTPException(status_code=400, detail="Direction is required")

    payload = AgentRunCreate(
        direction=direction,
        answers=data.get("answers", {}),
        exploration_result=data.get("exploration_result"),
        recommendation=data.get("recommendation"),
    )
    try:
        run = await orchestrator.create_run(db, user, payload, lang=get_ui_lang(request))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"run_id": run.id, "status": run.status}


@ai_router.post("/lint")
async def lint(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    config = _get_default_config(db, user)
    pages = lint_service.load_pages_with_content(db)

    operator = user.username or user.email or str(user.id)
    with activity.running("lint", "知识库体检", operator):
        messages = prompts.lint.build_lint_messages(pages, lang=get_ui_lang(request))
        # 体检报告逐条列问题，大知识库 + 英文输出容易超 4096
        response = await _call_llm_tracked(db, user, "lint", config, messages, max_tokens=16384)

    llm_result = utils.parse_llm_json(response)
    if not isinstance(llm_result, dict):
        llm_result = {"raw_response": response}

    deterministic = lint_service.run_deterministic_checks(db, pages)
    result = {**llm_result, **deterministic}
    result["summary"] = lint_service.compute_summary(result)
    result["generated_at"] = beijing_now().isoformat()
    result["saved_report_path"] = lint_service.write_lint_report(
        result, username=user.username or user.email or str(user.id)
    )

    report_record = models.LintReport(
        user_id=user.id,
        result_json=json.dumps(result, ensure_ascii=False),
        report_path=result["saved_report_path"],
    )
    db.add(report_record)
    db.commit()
    db.refresh(report_record)

    result["report_id"] = report_record.id

    audit_service.log_action(
        db, user.id, "execute", "lint", resource_id=report_record.id,
        new_value={"summary": result.get("summary")},
    )

    return result


@ai_router.post("/lint-suggest")
async def lint_suggest(
    lint_result: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    config = _get_default_config(db, user)
    messages = lint_suggest_prompts.build_lint_suggest_messages(lint_result, lang=get_ui_lang(request))
    response = await _call_llm_tracked(db, user, "lint_suggest", config, messages)

    result = utils.parse_llm_json(response)
    if not isinstance(result, dict):
        result = {"raw_response": response}

    return result


@ai_router.get("/lint/report")
def get_lint_report(
    path: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    if path:
        # Only allow files directly inside wiki/meta/ to prevent path traversal
        filename = Path(path).name
        report_path = wiki_storage.META_DIR / filename
    else:
        # Default to the most recently modified report
        reports = sorted(
            wiki_storage.META_DIR.glob("lint_report_*.md"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not reports:
            raise HTTPException(status_code=404, detail="Report not found")
        report_path = reports[0]

    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    content = report_path.read_text(encoding="utf-8")
    return {"path": f"wiki/meta/{report_path.name}", "content": content}


@ai_router.get("/lint-reports", response_model=list[schemas.LintReportOut])
def list_lint_reports(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    # 体检报告属于团队知识资产，管理员和研究员均可查看全部
    return db.query(models.LintReport).order_by(
        models.LintReport.created_at.desc()
    ).all()


@ai_router.get("/lint-reports/{report_id}", response_model=schemas.LintReportOut)
def get_lint_report_by_id(
    report_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    report = db.query(models.LintReport).filter(
        models.LintReport.id == report_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@ai_router.delete("/lint-reports/{report_id}")
def delete_lint_report(
    report_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor")),
):
    report = db.query(models.LintReport).filter(
        models.LintReport.id == report_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role != "admin" and report.user_id != user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    db.delete(report)
    db.commit()
    return {"message": "Deleted"}


@ai_router.post("/lint/{report_id}/fix-all")
def fix_all_lint_issues(
    report_id: str,
    fix_type: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """Apply auto-fixable repairs from a lint report.

    fix_type（可选）限定只修某一类：
    - missing_backlinks: add reverse links
    - index_consistency: rebuild _wiki_index.md
    - tag_consistency: rebuild _tag_registry.md
    缺省修全部可自动修复项。

    Other issues (conflicts, outdated content, missing concepts, info gaps)
    require human review and are only reported back, not fixed.
    """
    from app.wiki import models as wiki_models

    report = db.query(models.LintReport).filter(
        models.LintReport.id == report_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if user.role != "admin" and report.user_id != user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    try:
        result = json.loads(report.result_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid report JSON")

    fix_log: list[dict] = []

    allowed_types = {"missing_backlinks", "index_consistency", "tag_consistency"}
    if fix_type is not None and fix_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unknown fix_type: {fix_type}")
    do_all = fix_type is None

    # 1. Fix missing backlinks
    backlinks = (result.get("missing_backlinks") or []) if (do_all or fix_type == "missing_backlinks") else []
    for pair in backlinks:
        from_slug = pair.get("from")
        to_slug = pair.get("to")
        if not from_slug or not to_slug:
            fix_log.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "skipped", "reason": "missing_slug"})
            continue
        page = db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == to_slug).first()
        if not page:
            fix_log.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "page_not_found"})
            continue
        try:
            content = wiki_storage.read_page(page.file_path)
        except Exception as exc:
            fix_log.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "error", "reason": str(exc)})
            continue
        marker = f"[[{from_slug}]]"
        if marker in content:
            fix_log.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "already_exists"})
            continue
        content += f"\n\n{marker}"
        wiki_storage.write_page(page.slug, page.type, content)
        linked = list(page.linked_slugs or [])
        if from_slug not in linked:
            linked.append(from_slug)
        page.linked_slugs = linked
        page.updated_by = user.id
        db.commit()
        fix_log.append({"type": "add_backlink", "from": from_slug, "to": to_slug, "status": "fixed"})

    # 2. Rebuild index if inconsistent
    index_result = result.get("index_consistency") or {}
    if (do_all or fix_type == "index_consistency") and not index_result.get("consistent", True):
        try:
            ingest_service.rebuild_wiki_index(db)
            fix_log.append({"type": "rebuild_index", "status": "fixed"})
        except Exception as exc:
            fix_log.append({"type": "rebuild_index", "status": "error", "reason": str(exc)})

    # 3. Rebuild tag registry if inconsistent
    tag_result = result.get("tag_consistency") or {}
    if (do_all or fix_type == "tag_consistency") and not tag_result.get("consistent", True):
        try:
            ingest_service.rebuild_tag_registry(db)
            fix_log.append({"type": "rebuild_tags", "status": "fixed"})
        except Exception as exc:
            fix_log.append({"type": "rebuild_tags", "status": "error", "reason": str(exc)})

    # Persist what we did inside the report so the UI can show it later
    result["auto_fixes"] = fix_log
    result["fixed_at"] = beijing_now().isoformat()
    report.result_json = json.dumps(result, ensure_ascii=False)
    db.commit()

    # Rewrite the markdown report so it reflects the fixes
    try:
        lint_service.write_lint_report(
            result,
            username=user.username or user.email or str(user.id),
        )
    except Exception:
        pass

    fixed_count = sum(1 for f in fix_log if f.get("status") == "fixed")
    skipped_count = sum(1 for f in fix_log if f.get("status") != "fixed")
    audit_service.log_action(
        db, user.id, "execute", "lint_fix", resource_id=report_id,
        new_value={"fixed_count": fixed_count, "skipped_count": skipped_count},
    )

    return {
        "fixed_count": fixed_count,
        "skipped_count": skipped_count,
        "fixes": fix_log,
    }


@ai_router.post("/lint/{report_id}/dismiss")
def dismiss_lint_issue(
    report_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """将报告中的某条问题标记为已忽略（视为已修复）。

    body: {"issue_key": "<type>:<identifier>"}（由前端按问题类型生成）。
    忽略列表持久化在报告 JSON 的 dismissed 字段，团队共享。
    """
    issue_key = (body.get("issue_key") or "").strip()
    if not issue_key:
        raise HTTPException(status_code=400, detail="issue_key required")

    report = db.query(models.LintReport).filter(
        models.LintReport.id == report_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        result = json.loads(report.result_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid report JSON")

    dismissed = result.get("dismissed") or []
    if issue_key not in dismissed:
        dismissed.append(issue_key)
        result["dismissed"] = dismissed
        report.result_json = json.dumps(result, ensure_ascii=False)
        db.commit()
        audit_service.log_action(
            db, user.id, "update", "lint", resource_id=report_id,
            new_value={"dismissed": issue_key},
        )

    return {"dismissed": dismissed}


_UNSAFE_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|\x00-\x1f]')


def _sanitize_filename(title: str, fallback: str = "download") -> str:
    """清洗文献标题为安全文件名（不含路径分隔符等），截断 80 字符。"""
    name = _UNSAFE_FILENAME_CHARS.sub("_", (title or "").strip())
    name = name.strip(". ") or fallback
    return name[:80]


def _download_one_reading(db: Session, plan, item: dict, user: User) -> dict:
    """下载单篇文献到 pre-raw 并更新 item 状态。成功/失败都返回结果 dict。"""
    url = item.get("url", "")
    title = item.get("title", "")
    if not url:
        return {"status": "skipped", "title": title}
    try:
        info = raw_storage.download_to_pre_raw(url, filename=_sanitize_filename(title))
        raw_file = raw_models.RawFile(
            filename=info["filename"],
            original_name=title or info["filename"],
            storage_type="local",
            storage_path=info["storage_path"],
            file_size=info["file_size"],
            mime_type=info["mime_type"],
            status="pending",
            uploaded_by=user.id,
        )
        db.add(raw_file)
        db.commit()
        db.refresh(raw_file)
        item["status"] = "downloaded"
        item["raw_file_id"] = raw_file.id
        audit_service.log_action(
            db, user.id, "create", "raw", resource_id=raw_file.id,
            new_value={"filename": raw_file.filename, "source": "plan_reading", "plan_id": plan.id},
        )
        return {"status": "downloaded", "title": title, "url": url, "raw_id": raw_file.id}
    except Exception as exc:
        item["status"] = "failed"
        item["error"] = str(exc)
        return {"status": "failed", "title": title, "url": url, "error": str(exc)}


@ai_router.post("/plan/{plan_id}/readings/{index}/download")
async def download_plan_reading(
    plan_id: str,
    index: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """Download a single suggested reading to pre-raw."""
    plan = db.query(plans_models.Plan).filter(plans_models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    readings = list(plan.suggested_readings or [])
    if index < 0 or index >= len(readings):
        raise HTTPException(status_code=404, detail="Reading not found")
    item = readings[index]
    if not isinstance(item, dict):
        raise HTTPException(status_code=400, detail="Invalid reading item")
    if item.get("status") == "downloaded":
        return {"status": "downloaded", "raw_id": item.get("raw_file_id"), "message": "Already downloaded"}

    item = dict(item)
    result = _download_one_reading(db, plan, item, user)
    readings[index] = item
    plan.suggested_readings = readings
    plan.updated_by = user.id
    plan.updated_at = beijing_now()
    db.commit()

    plans_storage.write_plan(plan.slug, plans_storage.build_plan_markdown(plan))
    return result


@ai_router.post("/plan/{plan_id}/download-papers")
async def download_plan_papers(
    plan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "editor"))
):
    """Download all pending papers from plan's suggested_readings to pre-raw."""
    plan = db.query(plans_models.Plan).filter(plans_models.Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    readings = plan.suggested_readings or []
    if not readings:
        return {"downloaded": [], "errors": [], "message": "No suggested readings"}

    downloaded = []
    errors = []
    updated_readings = []

    for item in readings:
        if not isinstance(item, dict):
            updated_readings.append(item)
            continue
        if not item.get("url") or item.get("status") == "downloaded":
            updated_readings.append(item)
            continue

        item = dict(item)
        result = _download_one_reading(db, plan, item, user)
        if result["status"] == "downloaded":
            downloaded.append(result)
        elif result["status"] == "failed":
            errors.append(result)
        updated_readings.append(item)

    plan.suggested_readings = updated_readings
    plan.updated_by = user.id
    plan.updated_at = beijing_now()
    db.commit()

    # Re-export plan markdown to reflect download status
    plans_storage.write_plan(plan.slug, plans_storage.build_plan_markdown(plan))

    return {"downloaded": downloaded, "errors": errors, "message": f"Downloaded {len(downloaded)} papers"}
