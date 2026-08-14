import re
from pathlib import Path
from sqlalchemy.orm import Session
from app.wiki import models, storage
from app.auth.models import User
from app.raw import models as raw_models
from app.ai import ingest_service


def extract_yaml_frontmatter(content: str) -> dict:
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return {"yaml": parts[1].strip(), "body": parts[2].strip()}
    return {"yaml": "", "body": content.strip()}


def create_page(db: Session, data: dict, user: User) -> models.WikiPage:
    file_path = storage.write_page(data["slug"], data["type"], data["content"])
    page = models.WikiPage(
        slug=data["slug"],
        title=data["title"],
        type=data["type"],
        tags=data.get("tags", []),
        summary=data.get("summary", ""),
        source_paths=data.get("source_paths", []),
        linked_slugs=data.get("linked_slugs", []),
        file_path=file_path,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


def get_page(db: Session, slug: str) -> dict:
    page = db.query(models.WikiPage).filter(models.WikiPage.slug == slug).first()
    if not page:
        return None
    content = storage.read_page(page.file_path)
    return {
        **page.__dict__,
        "content": content,
        "raw_files": [{"id": r.id, "original_name": r.original_name} for r in page.raw_files],
    }


def update_page(db: Session, slug: str, data: dict, user: User) -> models.WikiPage:
    page = db.query(models.WikiPage).filter(models.WikiPage.slug == slug).first()
    if not page:
        return None
    for key in ["title", "tags", "summary", "source_paths", "linked_slugs", "status"]:
        if key in data and data[key] is not None:
            setattr(page, key, data[key])
    if "content" in data and data["content"] is not None:
        storage.write_page(page.slug, page.type, data["content"])
    page.updated_by = user.id
    db.commit()
    db.refresh(page)
    return page


def delete_page(db: Session, slug: str) -> bool:
    page = db.query(models.WikiPage).filter(models.WikiPage.slug == slug).first()
    if not page:
        return False
    storage.delete_page(page.file_path)
    db.delete(page)
    db.commit()
    return True


def list_pages(db: Session, page_type: str = None) -> list:
    q = db.query(models.WikiPage)
    if page_type:
        q = q.filter(models.WikiPage.type == page_type)
    return q.all()


def search_pages(db: Session, query: str) -> list:
    return db.query(models.WikiPage).filter(
        models.WikiPage.title.ilike(f"%{query}%") |
        models.WikiPage.summary.ilike(f"%{query}%") |
        models.WikiPage.slug.ilike(f"%{query}%")
    ).all()


def get_sync_status(db: Session) -> dict:
    pending = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.storage_path.like("%/raw/%"),
        raw_models.RawFile.status != "ingested",
    ).count()
    return {"pending_count": pending, "has_pending": pending > 0}


def _extract_slugs_from_index(text: str) -> set[str]:
    return set(re.findall(r"\[\[([^\]]+)\]\]", text))


def detect_orphaned_raw_files(db: Session) -> tuple[list[str], list[raw_models.RawFile]]:
    """对比 _wiki_index.md 与其快照，找出被删 wiki 页面对应的孤立 raw 文件。

    无副作用。返回 (missing_slugs, orphaned_raw_files)。
    """
    index_path = Path(storage.WIKI_DIR) / "_wiki_index.md"
    snapshot_path = Path(storage.WIKI_DIR) / "_wiki_index.md.snapshot"

    current_slugs: set[str] = set()
    if index_path.exists():
        current_slugs = _extract_slugs_from_index(index_path.read_text(encoding="utf-8"))

    snapshot_slugs: set[str] = set()
    if snapshot_path.exists():
        snapshot_slugs = _extract_slugs_from_index(snapshot_path.read_text(encoding="utf-8"))

    missing_slugs = sorted(snapshot_slugs - current_slugs)

    # Find raw files that were ingested but at least one of their linked wiki pages no longer exists.
    current_page_ids = {row.id for row in db.query(models.WikiPage.id).all()}
    orphaned_raw_ids = {
        link.raw_file_id
        for link in db.query(raw_models.raw_file_wiki_page_links).all()
        if link.wiki_page_id not in current_page_ids
    }
    # Also cover legacy raw files that only have entity_page_id set without link rows.
    orphaned_raw_ids.update(
        row.id for row in db.query(raw_models.RawFile.id).filter(
            raw_models.RawFile.status == "ingested",
            raw_models.RawFile.entity_page_id.isnot(None),
            ~raw_models.RawFile.entity_page_id.in_(current_page_ids),
        ).all()
    )
    orphaned_raw_files = db.query(raw_models.RawFile).filter(
        raw_models.RawFile.id.in_(orphaned_raw_ids)
    ).all() if orphaned_raw_ids else []

    return missing_slugs, orphaned_raw_files


async def update_knowledge_base(db: Session, user: User) -> dict:
    """重建索引/标签注册表并把当前索引固化为新快照基线（不调用 LLM、不直接建页）。

    被删页面的恢复统一走两阶段摄入流程：
    plan-batch(include_orphans=True) 规划 → 用户确认 → 逐页生成 → 最后调用本函数收尾。
    """
    missing_slugs, orphaned_raw_files = detect_orphaned_raw_files(db)

    ingest_service.rebuild_wiki_index(db)
    ingest_service.rebuild_tag_registry(db)

    index_path = Path(storage.WIKI_DIR) / "_wiki_index.md"
    snapshot_path = Path(storage.WIKI_DIR) / "_wiki_index.md.snapshot"
    snapshot_updated = False
    if index_path.exists():
        snapshot_path.write_text(index_path.read_text(encoding="utf-8"), encoding="utf-8")
        snapshot_updated = True

    return {
        "missing_slugs": missing_slugs,
        "orphan_raw_files": [
            {"id": r.id, "original_name": r.original_name} for r in orphaned_raw_files
        ],
        "reingested_count": 0,
        "errors": 0,
        "details": [],
        "snapshot_updated": snapshot_updated,
    }
