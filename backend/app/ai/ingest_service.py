import json
import re
import uuid
import time
from datetime import datetime
from app.utils_time import beijing_now
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.ai import document_parser, prompts, service as ai_service, models as ai_models
from app.ai.audit_logger import log_ai_call
from app.auth.models import User
from app.raw import models as raw_models
from app.wiki import models as wiki_models, service as wiki_service, storage as wiki_storage


def get_default_config_for_user(db: Session, user: User):
    return db.query(ai_models.LLMConfig).filter(
        ai_models.LLMConfig.user_id == user.id,
        ai_models.LLMConfig.is_default == True,
    ).first()


def _slugify(name: str) -> str:
    base = Path(name).stem
    # Keep CJK characters, alphanumeric, and hyphens
    base = re.sub(r"[^\w一-鿿-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base.lower() or f"raw-{uuid.uuid4().hex[:8]}"


def _unique_slug(db: Session, base_slug: str, reserved: set[str] | None = None) -> str:
    slug = base_slug
    counter = 1
    taken = reserved or set()
    while slug in taken or db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter and return (metadata, body)."""
    meta = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            yaml_text = parts[1].strip()
            body = parts[2].strip()
            for line in yaml_text.split("\n"):
                line = line.rstrip()
                if not line.strip():
                    continue
                if ":" in line and not line.startswith("-"):
                    key, val = line.split(":", 1)
                    key = key.strip()
                    val = val.strip()
                    if key == "links":
                        meta[key] = re.findall(r"\[\[([^\]]+)\]\]", val)
                    elif val.startswith("["):
                        val = val.strip("[]")
                        meta[key] = [v.strip().strip('"').strip("'") for v in val.split(",") if v.strip()]
                    else:
                        meta[key] = val.strip('"').strip("'")
    return meta, body


def _extract_links(content: str) -> list[str]:
    return re.findall(r"\[\[([^\]]+)\]\]", content)


def _today() -> str:
    return beijing_now().strftime("%Y-%m-%d")


def _relative_source_path(storage_path: str) -> str:
    """Convert absolute storage path to 'raw/...' relative path."""
    path = Path(storage_path)
    parts = path.parts
    if "raw" in parts:
        idx = parts.index("raw")
        return "/".join(parts[idx:])
    return f"raw/{path.name}"


_WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def _normalize_links(body: str) -> tuple[str, list[str]]:
    """Rewrite [[display]] wiki links to [[display|slug]] and collect slugs.

    Slugs are lowercased by _slugify, so a link written with title casing
    (e.g. [[Chinese ModernBERT]]) would not resolve to the page slug
    (chinese-modernbert). Normalizing here keeps display text readable while
    making the link target match the slug the page will be saved under.
    """
    slugs: list[str] = []

    def _sub(m: re.Match) -> str:
        display = m.group(1).strip()
        target = (m.group(2) or m.group(1)).strip()
        slug = _slugify(target)
        if slug not in slugs:
            slugs.append(slug)
        if m.group(2) is None and display == slug:
            return m.group(0)
        return f"[[{display}|{slug}]]"

    return _WIKILINK_RE.sub(_sub, body), slugs


def _existing_tags(db: Session) -> list[str]:
    """Collect all tags currently used across wiki pages."""
    tags = set()
    for (page_tags,) in db.query(wiki_models.WikiPage.tags).all():
        tags.update(page_tags or [])
    return sorted(tags)


def _split_pages(text: str) -> list[str]:
    """Split an LLM response into multiple page blocks."""
    if "<<<PAGE_BREAK>>>" in text:
        return [p.strip() for p in text.split("<<<PAGE_BREAK>>>") if p.strip()]
    return [text.strip()] if text.strip() else []


# Ingest asks for multiple structured pages in one completion; reasoning models
# (e.g. deepseek-v4-pro) also spend reasoning tokens from the same budget, so
# the 4096 default truncates output mid-page. Give ingest a generous ceiling.
INGEST_MAX_TOKENS = 16384


def _resolve_batch_links(db: Session, parsed_pages: list[dict]) -> None:
    """Remap linked slugs that don't exist to a unique in-batch prefix match.

    The LLM references sibling pages by title (e.g. [[Chinese ModernBERT]])
    before their final slugs are known (chinese-modernbert-中文现代bert模型),
    so exact matching fails. A unique prefix match in either direction is a
    safe remap; ambiguous or unmatched links are left for the lint pass.
    """
    existing_slugs = {row.slug for row in db.query(wiki_models.WikiPage.slug).all()}
    batch_slugs = [p["slug"] for p in parsed_pages]
    for page in parsed_pages:
        resolved = []
        for link_slug in page["linked_slugs"]:
            target = link_slug
            if link_slug not in existing_slugs and link_slug not in batch_slugs:
                candidates = [
                    s for s in batch_slugs
                    if s != page["slug"] and (s.startswith(link_slug) or link_slug.startswith(s))
                ]
                if len(candidates) == 1:
                    target = candidates[0]
                    page["body"] = page["body"].replace(f"|{link_slug}]]", f"|{target}]]")
                    page["body"] = page["body"].replace(f"[[{link_slug}]]", f"[[{target}]]")
            if target not in resolved:
                resolved.append(target)
        page["linked_slugs"] = resolved


def persist_pages_from_response(
    db: Session,
    response: str,
    *,
    fallback_title: str,
    default_source_paths: list[str],
    user: User,
    default_type: str = "entity",
    log_action: str = "收资料",
) -> list[wiki_models.WikiPage]:
    """Parse an LLM page-generation response and create wiki pages from it.

    Shared by raw-file ingest and chat-answer save: both ask the LLM for
    frontmatter-tagged markdown page blocks, then persist them identically.
    """
    page_blocks = _split_pages(response)

    # Phase 1: parse all blocks and assign final slugs (intra-batch safe)
    parsed_pages = []
    reserved_slugs: set[str] = set()
    for block in page_blocks:
        meta, body = _parse_frontmatter(block)
        title = meta.get("title") or fallback_title
        slug = _unique_slug(db, _slugify(title), reserved_slugs)
        reserved_slugs.add(slug)
        page_type = meta.get("type") or default_type
        if page_type not in {"entity", "concept", "synthesis"}:
            page_type = default_type
        tags = meta.get("tags", [])
        if isinstance(tags, str):
            tags = [tags]
        summary = meta.get("summary", "")
        source_paths = meta.get("sources", default_source_paths)
        if isinstance(source_paths, str):
            source_paths = [source_paths]
        body, body_link_slugs = _normalize_links(body)
        linked_slugs = []
        for link in list(meta.get("links", [])) + body_link_slugs:
            link_slug = _slugify(link)
            if link_slug not in linked_slugs:
                linked_slugs.append(link_slug)
        parsed_pages.append({
            "title": title,
            "slug": slug,
            "type": page_type,
            "tags": tags,
            "summary": summary,
            "source_paths": source_paths,
            "body": body.strip() or block.strip(),
            "linked_slugs": linked_slugs,
        })

    # Phase 2: link sibling pages whose final slugs differ from the LLM's guess
    _resolve_batch_links(db, parsed_pages)

    created_pages = []
    for spec in parsed_pages:
        # Ensure frontmatter has correct metadata even if LLM omitted it
        content_lines = ["---"]
        content_lines.append(f'title: "{spec["title"]}"')
        content_lines.append(f'type: {spec["type"]}')
        content_lines.append(f'tags: [{", ".join(spec["tags"])}]')
        content_lines.append(f"created: {_today()}")
        content_lines.append(f"updated: {_today()}")
        content_lines.append(f'sources: [{" | ".join(spec["source_paths"])}]')
        content_lines.append(f'links: {", ".join(f"[[{l}]]" for l in spec["linked_slugs"])}')
        content_lines.append(f'summary: "{spec["summary"]}"')
        content_lines.append("---")
        content_lines.append("")
        content_lines.append(spec["body"])
        content = "\n".join(content_lines)

        page_data = {
            "slug": spec["slug"],
            "title": spec["title"],
            "type": spec["type"],
            "content": content,
            "tags": spec["tags"],
            "summary": spec["summary"],
            "source_paths": spec["source_paths"],
            "linked_slugs": spec["linked_slugs"],
        }
        page = wiki_service.create_page(db, page_data, user)
        created_pages.append(page)

        _append_wiki_log(db, spec["title"], spec["slug"], spec["source_paths"], user, spec["type"], action=log_action)

    return created_pages


_PAGE_TYPE_NAMES = {"entity": "实体页", "concept": "概念页", "synthesis": "综合页"}


async def save_chat_answer_as_page(
    db: Session,
    question: str,
    answer: str,
    suggested_title: str,
    user: User,
    config,
) -> dict:
    """Ingest an accepted chat answer into the wiki as a synthesis/concept page.

    Mirrors the raw-file ingest flow, but the source material is the Q&A
    content rather than a parsed document.
    """
    messages = prompts.chat_ingest.build_chat_ingest_messages(
        question, answer, _existing_tags(db), suggested_title
    )

    start_ms = time.time() * 1000
    try:
        response = ""
        usage_info: dict = {}
        async for chunk in ai_service.chat_completion(
            config, messages, max_tokens=INGEST_MAX_TOKENS, usage_out=usage_info
        ):
            response += chunk
        duration_ms = int(time.time() * 1000 - start_ms)
        usage = usage_info.get("usage") or {}
        log_ai_call(
            db, user.id, "chat_ingest", config.id,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            duration_ms=duration_ms,
            status="success",
            metadata={
                "question": question[:200],
                "suggested_title": suggested_title,
                "finish_reason": usage_info.get("finish_reason"),
            },
        )
    except Exception as exc:
        duration_ms = int(time.time() * 1000 - start_ms)
        log_ai_call(
            db, user.id, "chat_ingest", config.id, duration_ms=duration_ms,
            status="failed", error_message=str(exc),
            metadata={"question": question[:200], "suggested_title": suggested_title},
        )
        return {"status": "error", "message": str(exc)}

    try:
        created_pages = persist_pages_from_response(
            db,
            response,
            fallback_title=suggested_title or "AI 对话综合页",
            default_source_paths=[],
            user=user,
            default_type="synthesis",
            log_action="存对话",
        )
    except Exception as exc:
        return {"status": "error", "message": str(exc)}

    if not created_pages:
        return {"status": "error", "message": "no_pages_generated"}

    rebuild_wiki_index(db)
    rebuild_tag_registry(db)

    return {
        "status": "created",
        "pages": [
            {"slug": p.slug, "title": p.title, "type": p.type}
            for p in created_pages
        ],
    }


def _append_wiki_log(
    db: Session,
    title: str,
    slug: str,
    source_paths: list[str],
    user: User,
    page_type: str = "entity",
    action: str = "收资料",
):
    log_path = Path(wiki_storage.WIKI_DIR) / "_wiki_log.md"
    today = _today()
    source_names = [Path(p).name for p in source_paths]
    type_name = _PAGE_TYPE_NAMES.get(page_type, "实体页")
    entry = (
        f"\n## [{today}] {action} | {title}\n"
        f"- 新建{type_name} [[{slug}]]\n"
        f"- 来源：{', '.join(source_names) if source_names else 'AI 对话'}\n"
        f"- 操作人：{user.username}\n"
    )
    if log_path.exists():
        existing = log_path.read_text(encoding="utf-8")
    else:
        existing = "# Wiki 操作日志\n"
    log_path.write_text(existing + entry, encoding="utf-8")


def rebuild_wiki_index(db: Session):
    """Rebuild _wiki_index.md from all wiki pages."""
    pages = db.query(wiki_models.WikiPage).order_by(wiki_models.WikiPage.updated_at.desc()).all()

    entities = [p for p in pages if p.type == "entity"]
    concepts = [p for p in pages if p.type == "concept"]
    syntheses = [p for p in pages if p.type == "synthesis"]

    # Count how many entities link to each concept slug
    concept_reference_counts = {}
    for p in pages:
        for link in p.linked_slugs or []:
            concept_reference_counts[link] = concept_reference_counts.get(link, 0) + 1

    def entity_rows(page_list):
        rows = []
        for p in page_list:
            sources = ", ".join(p.source_paths or [])
            updated = (p.updated_at or p.created_at).strftime("%Y-%m-%d")
            rows.append(f"| [[{p.slug}]] | {p.title} | {sources} | {updated} |")
        return "\n".join(rows)

    def concept_rows(page_list):
        rows = []
        for p in page_list:
            count = concept_reference_counts.get(p.slug, 0)
            updated = (p.updated_at or p.created_at).strftime("%Y-%m-%d")
            rows.append(f"| [[{p.slug}]] | {p.title} | {count} | {updated} |")
        return "\n".join(rows)

    def synthesis_rows(page_list):
        rows = []
        for p in page_list:
            sources = ", ".join(p.source_paths or [])
            updated = (p.updated_at or p.created_at).strftime("%Y-%m-%d")
            rows.append(f"| [[{p.slug}]] | {p.title} | {sources} | {updated} |")
        return "\n".join(rows)

    content = f"""# Wiki 索引

## 实体 (entities/)

| 文件 | 标题 | 来源 | 更新日期 |
|------|------|------|----------|
{entity_rows(entities) or "| （暂无） | | | |"}

## 概念 (concepts/)

| 文件 | 标题 | 引用实体数 | 更新日期 |
|------|------|------------|----------|
{concept_rows(concepts) or "| （暂无） | | | |"}

## 综合 (syntheses/)

| 文件 | 标题 | 来源 | 更新日期 |
|------|------|------|----------|
{synthesis_rows(syntheses) or "| （暂无） | | | |"}
"""
    index_path = Path(wiki_storage.WIKI_DIR) / "_wiki_index.md"
    index_path.write_text(content, encoding="utf-8")


def rebuild_tag_registry(db: Session):
    """Rebuild _tag_registry.md from all wiki page tags."""
    pages = db.query(wiki_models.WikiPage).all()
    tag_counts = {}
    for p in pages:
        for tag in p.tags or []:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    sorted_tags = sorted(tag_counts.items(), key=lambda x: (-x[1], x[0]))
    rows = []
    for tag, count in sorted_tags:
        rows.append(f"| `#{tag}` | | {count} |")

    content = f"""# 标签注册表

## 活跃标签

| 标签 | 含义 | 覆盖页面数 |
|------|------|------------|
{chr(10).join(rows) or "| （暂无） | | |"}

## 已废弃标签

（暂无）
"""
    registry_path = Path(wiki_storage.WIKI_DIR) / "_tag_registry.md"
    registry_path.write_text(content, encoding="utf-8")


def get_pending_raw_files(db: Session) -> list[raw_models.RawFile]:
    return db.query(raw_models.RawFile).filter(
        raw_models.RawFile.storage_path.like("%/raw/%"),
        raw_models.RawFile.status != "ingested",
    ).all()


# ----- 两阶段摄入：先规划页面清单，用户确认后逐页生成 -----

# 阶段一规划只输出 JSON 清单；信息密度高的论文细拆 6-8 页时 4096 会被截断
# （finish_reason=length，实测中文长摘要规划 3/4 次顶满 4096 导致整份规划丢失）。
# max_tokens 是上限而非实际消耗，32768 彻底消除规划截断风险（需模型输出上限支持，
# 主流模型均 ≥8K；若所用端点上限更低会被服务端钳制或报错，届时再回调）。
INGEST_PLAN_MAX_TOKENS = 32768
# 阶段二单页正文：4096 时约 7% 的页面被静默截断（正文不完整且无报错），16384 覆盖长文
INGEST_PAGE_MAX_TOKENS = 16384

_VALID_PAGE_TYPES = {"entity", "concept", "synthesis"}


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


async def _llm_complete_tracked(
    db: Session,
    user: User,
    operation_type: str,
    config,
    messages: list,
    max_tokens: int,
    metadata: dict | None = None,
) -> str:
    """单次 LLM 补全 + 审计日志。"""
    start_ms = time.time() * 1000
    try:
        response = ""
        usage_info: dict = {}
        async for chunk in ai_service.chat_completion(
            config, messages, max_tokens=max_tokens, usage_out=usage_info
        ):
            response += chunk
        duration_ms = int(time.time() * 1000 - start_ms)
        usage = usage_info.get("usage") or {}
        log_ai_call(
            db, user.id, operation_type, config.id,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            duration_ms=duration_ms,
            status="success",
            metadata={**(metadata or {}), "finish_reason": usage_info.get("finish_reason")},
        )
        return response
    except Exception as exc:
        duration_ms = int(time.time() * 1000 - start_ms)
        log_ai_call(
            db, user.id, operation_type, config.id, duration_ms=duration_ms,
            status="failed", error_message=str(exc), metadata=metadata or {},
        )
        raise


def _validate_plan_pages(db: Session, raw_pages: list, existing_tags: list[str]) -> list[dict]:
    """校验/兜底阶段一规划：非法 action→new；tags 不在词表→移入 new_tags；
    enrich 的 target_slug 不存在→降级 new。"""
    existing_tag_set = set(existing_tags)
    existing_slugs = {row.slug for row in db.query(wiki_models.WikiPage.slug).all()}
    pages = []
    for raw_page in raw_pages:
        if not isinstance(raw_page, dict):
            continue
        title = (raw_page.get("title") or "").strip()
        if not title:
            continue
        page_type = raw_page.get("type") or "entity"
        if page_type not in _VALID_PAGE_TYPES:
            page_type = "entity"
        tags = raw_page.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        new_tags = raw_page.get("new_tags") or []
        if isinstance(new_tags, str):
            new_tags = [new_tags]
        known_tags, proposed = [], list(new_tags)
        for tag in tags:
            (known_tags if tag in existing_tag_set else proposed).append(tag)
        action = raw_page.get("action") or "new"
        target_slug = (raw_page.get("target_slug") or "").strip()
        if action != "enrich" or target_slug not in existing_slugs:
            action, target_slug = "new", ""
        pages.append({
            "title": title,
            "type": page_type,
            "summary": (raw_page.get("summary") or "").strip(),
            "tags": list(dict.fromkeys(known_tags)),
            "new_tags": list(dict.fromkeys(t for t in proposed if t not in existing_tag_set)),
            "action": action,
            "target_slug": target_slug,
        })
    return pages


def _salvage_truncated_pages(text: str) -> list[dict]:
    """从被 max_tokens 截断的规划输出中抢救已完整的页面对象。

    截断发生在 JSON 数组中部时，前面已写完的 {...} 对象仍可直接使用，
    避免整份规划因最后一个对象不完整而被丢弃（零额外 LLM 调用）。
    """
    start = text.find("[")
    if start == -1:
        return []
    pages = []
    depth = 0
    in_str = False
    escape = False
    obj_start = -1
    for i in range(start + 1, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start != -1:
                try:
                    obj = json.loads(text[obj_start:i + 1])
                    if isinstance(obj, dict):
                        pages.append(obj)
                except json.JSONDecodeError:
                    pass
                obj_start = -1
        elif ch == "]" and depth == 0:
            break
    return pages


async def plan_ingest(
    db: Session,
    raw: raw_models.RawFile,
    user: User,
    config,
) -> ai_models.IngestSession:
    """阶段一：1 次 LLM 调用生成页面规划，落库为 IngestSession（status=planned）。"""
    text = document_parser.parse_document(raw.storage_path)
    if not text or not text.strip():
        raise ValueError("empty_content")

    existing_tags = _existing_tags(db)
    existing_pages = [
        {"slug": p.slug, "title": p.title, "type": p.type}
        for p in db.query(wiki_models.WikiPage).all()
    ]
    messages = prompts.ingest.build_ingest_plan_messages(
        text,
        raw.original_name,
        existing_tags,
        existing_pages,
        document_parser.parse_document_metadata(raw.storage_path),
    )
    response = await _llm_complete_tracked(
        db, user, "ingest_plan", config, messages, INGEST_PLAN_MAX_TOKENS,
        metadata={"raw_id": raw.id, "filename": raw.original_name},
    )

    try:
        plan_data = json.loads(_strip_code_fences(response))
        raw_pages = plan_data.get("pages") or []
    except (json.JSONDecodeError, AttributeError):
        # 输出被 max_tokens 截断（finish_reason=length）时抢救已完整的页面对象
        raw_pages = _salvage_truncated_pages(_strip_code_fences(response))
    pages = _validate_plan_pages(db, raw_pages, existing_tags)

    session = ai_models.IngestSession(
        raw_file_id=raw.id,
        user_id=user.id,
        status="planned",
        plan_json=json.dumps({"pages": pages}, ensure_ascii=False),
        progress_json=json.dumps(
            {"total": len(pages), "done": 0, "current_title": "", "page_results": []},
            ensure_ascii=False,
        ),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _session_progress(session: ai_models.IngestSession) -> dict:
    try:
        return json.loads(session.progress_json or "{}")
    except json.JSONDecodeError:
        return {"total": 0, "done": 0, "current_title": "", "page_results": []}


def _build_page_content(spec: dict, body: str) -> str:
    """后端组装 frontmatter + 正文（单页生成时 LLM 只输出正文）。"""
    content_lines = ["---"]
    content_lines.append(f'title: "{spec["title"]}"')
    content_lines.append(f'type: {spec["type"]}')
    content_lines.append(f'tags: [{", ".join(spec["tags"])}]')
    content_lines.append(f"created: {_today()}")
    content_lines.append(f"updated: {_today()}")
    content_lines.append(f'sources: [{" | ".join(spec["source_paths"])}]')
    content_lines.append(f'links: {", ".join(f"[[{l}]]" for l in spec["linked_slugs"])}')
    content_lines.append(f'summary: "{spec["summary"]}"')
    content_lines.append("---")
    content_lines.append("")
    content_lines.append(body.strip())
    return "\n".join(content_lines)


async def _generate_page_body(
    db: Session,
    user: User,
    config,
    text: str,
    raw: raw_models.RawFile,
    spec: dict,
    allowed_tags: list[str],
    existing_page_content: str | None = None,
    sibling_pages: list | None = None,
) -> str:
    messages = prompts.ingest.build_ingest_page_messages(
        text, raw.original_name, spec, allowed_tags, existing_page_content, sibling_pages
    )
    body = await _llm_complete_tracked(
        db, user, "ingest_page", config, messages, INGEST_PAGE_MAX_TOKENS,
        metadata={"raw_id": raw.id, "title": spec.get("title"), "action": spec.get("action")},
    )
    return _strip_code_fences(body)


async def _ingest_new_page(
    db: Session,
    user: User,
    config,
    text: str,
    raw: raw_models.RawFile,
    spec: dict,
    allowed_tags: list[str],
    source_path: str,
    reserved_slugs: set[str],
    sibling_pages: list | None = None,
) -> wiki_models.WikiPage:
    body = await _generate_page_body(db, user, config, text, raw, spec, allowed_tags, sibling_pages=sibling_pages)
    slug = _unique_slug(db, _slugify(spec["title"]), reserved_slugs)
    reserved_slugs.add(slug)
    body, body_link_slugs = _normalize_links(body)
    linked_slugs = []
    for link_slug in body_link_slugs:
        if link_slug != slug and link_slug not in linked_slugs:
            linked_slugs.append(link_slug)

    page_spec = {**spec, "slug": slug, "source_paths": [source_path], "linked_slugs": linked_slugs}
    content = _build_page_content(page_spec, body)
    page = wiki_service.create_page(db, {
        "slug": slug,
        "title": spec["title"],
        "type": spec["type"],
        "content": content,
        "tags": spec["tags"],
        "summary": spec["summary"],
        "source_paths": [source_path],
        "linked_slugs": linked_slugs,
    }, user)
    _append_wiki_log(db, spec["title"], slug, [source_path], user, spec["type"])
    return page


async def _ingest_enrich_page(
    db: Session,
    user: User,
    config,
    text: str,
    raw: raw_models.RawFile,
    spec: dict,
    allowed_tags: list[str],
    source_path: str,
    sibling_pages: list | None = None,
) -> wiki_models.WikiPage | None:
    page = db.query(wiki_models.WikiPage).filter(
        wiki_models.WikiPage.slug == spec["target_slug"]
    ).first()
    if not page:
        return None
    old_content = wiki_storage.read_page(page.file_path)
    body = await _generate_page_body(
        db, user, config, text, raw, spec, allowed_tags,
        existing_page_content=old_content, sibling_pages=sibling_pages,
    )
    body, body_link_slugs = _normalize_links(body)

    # 知识血缘：sources/tags/links 取并集，M2M 挂上当前 raw
    merged_sources = list(dict.fromkeys(list(page.source_paths or []) + [source_path]))
    merged_tags = list(dict.fromkeys(list(page.tags or []) + spec["tags"]))
    merged_links = [
        l for l in list(page.linked_slugs or []) + body_link_slugs
        if l != page.slug
    ]
    merged_links = list(dict.fromkeys(merged_links))
    summary = spec["summary"] or page.summary or ""

    content = _build_page_content({
        "title": page.title,
        "type": page.type,
        "tags": merged_tags,
        "source_paths": merged_sources,
        "linked_slugs": merged_links,
        "summary": summary,
    }, body)
    wiki_storage.write_page(page.slug, page.type, content)

    page.tags = merged_tags
    page.source_paths = merged_sources
    page.linked_slugs = merged_links
    page.summary = summary
    page.updated_by = user.id
    if raw not in page.raw_files:
        page.raw_files.append(raw)
    db.commit()
    _append_wiki_log(db, page.title, page.slug, [source_path], user, page.type, action="完善页面")
    return page


async def run_ingest_generation(
    db: Session,
    session_id: str,
    confirmed_pages: list[dict],
    user_id: str,
) -> None:
    """阶段二：按用户确认的页面清单逐页生成（后台任务，独立 db session）。

    单页失败记录进 progress 后继续；每页完成即更新 progress_json 供前端轮询。
    """
    session = db.query(ai_models.IngestSession).filter(
        ai_models.IngestSession.id == session_id
    ).first()
    if not session or session.status not in ("planned", "generating"):
        return

    user = db.query(User).filter(User.id == user_id).first()
    raw = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.id == session.raw_file_id
    ).first()
    config = get_default_config_for_user(db, user) if user else None
    if not user or not raw or not config:
        if session:
            session.status = "failed"
            session.error = "missing user/raw/config"
            db.commit()
        return

    session.status = "generating"
    db.commit()

    try:
        text = document_parser.parse_document(raw.storage_path)
        if not text or not text.strip():
            raise ValueError("empty_content")

        # 允许的标签 = 现有词表 ∪ 阶段一提议的新标签（前端确认时已剔除未批准的）
        existing_tags = set(_existing_tags(db))
        planned_new_tags: set[str] = set()
        try:
            for p in (json.loads(session.plan_json or "{}").get("pages") or []):
                planned_new_tags.update(p.get("new_tags") or [])
        except json.JSONDecodeError:
            pass
        allowed_tags = sorted(existing_tags | planned_new_tags)
        allowed_set = set(allowed_tags)

        source_path = _relative_source_path(raw.storage_path)
        progress = {"total": len(confirmed_pages), "done": 0, "current_title": "", "page_results": []}
        session.progress_json = json.dumps(progress, ensure_ascii=False)
        db.commit()

        reserved_slugs: set[str] = set()
        created_pages: list[wiki_models.WikiPage] = []
        ok_count = 0
        # 同批页面标题清单（供 LLM 在正文中建立跨页面 wikilink 引用）
        batch_titles = [
            (p.get("title") or "").strip()
            for p in confirmed_pages
            if (p.get("title") or "").strip()
        ]

        for spec in confirmed_pages:
            db.refresh(session)
            if session.status == "cancelled":
                break

            spec = {**spec}
            spec["title"] = (spec.get("title") or "").strip()
            if not spec["title"]:
                progress["done"] += 1
                continue
            spec["type"] = spec.get("type") if spec.get("type") in _VALID_PAGE_TYPES else "entity"
            tags = spec.get("tags") or []
            if isinstance(tags, str):
                tags = [tags]
            # 超出现有词表+已批准新标签的丢弃
            spec["tags"] = [t for t in tags if t in allowed_set]
            spec["summary"] = (spec.get("summary") or "").strip()

            progress["current_title"] = spec["title"]
            session.progress_json = json.dumps(progress, ensure_ascii=False)
            db.commit()

            sibling_pages = [
                {"title": t} for t in batch_titles if t != spec["title"]
            ]

            try:
                if spec.get("action") == "enrich" and spec.get("target_slug"):
                    page = await _ingest_enrich_page(
                        db, user, config, text, raw, spec, allowed_tags, source_path,
                        sibling_pages=sibling_pages,
                    )
                    if page is None:
                        raise ValueError(f"target page not found: {spec['target_slug']}")
                    progress["page_results"].append({
                        "title": page.title, "slug": page.slug, "action": "enriched", "status": "ok",
                    })
                else:
                    page = await _ingest_new_page(
                        db, user, config, text, raw, spec, allowed_tags, source_path, reserved_slugs,
                        sibling_pages=sibling_pages,
                    )
                    created_pages.append(page)
                    if raw not in page.raw_files:
                        page.raw_files.append(raw)
                        db.commit()
                    progress["page_results"].append({
                        "title": page.title, "slug": page.slug, "action": "created", "status": "ok",
                    })
                ok_count += 1
            except Exception as exc:
                progress["page_results"].append({
                    "title": spec["title"], "action": spec.get("action", "new"),
                    "status": "error", "error": str(exc),
                })

            progress["done"] += 1
            session.progress_json = json.dumps(progress, ensure_ascii=False)
            db.commit()

        db.refresh(session)
        cancelled = session.status == "cancelled"
        if ok_count > 0:
            rebuild_wiki_index(db)
            rebuild_tag_registry(db)
            raw.status = "ingested"
            if created_pages:
                raw.entity_page_id = created_pages[0].id
            db.commit()
        if not cancelled:
            session.status = "completed" if ok_count > 0 or progress["total"] == 0 else "failed"
            if ok_count == 0 and progress["total"] > 0:
                session.error = "all_pages_failed"
            session.progress_json = json.dumps(progress, ensure_ascii=False)
            db.commit()
    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)
        db.commit()
