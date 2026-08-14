"""update-knowledge-base 新语义测试：只做索引/快照刷新，不直接建页；
被删页面的恢复走两阶段摄入（plan-batch include_orphans）。"""
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.ai import ingest_service
from app.raw import models as raw_models
from app.wiki import models as wiki_models, storage as wiki_storage

client = TestClient(app)


def _login_admin():
    resp = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _write_snapshot(slugs):
    wiki_storage.ensure_dirs()
    snapshot_path = Path(wiki_storage.WIKI_DIR) / "_wiki_index.md.snapshot"
    rows = "\n".join(f"| [[{s}]] | Title | source | 2026-07-03 |" for s in slugs)
    content = f"""# Wiki 索引

## 实体 (entities/)

| 文件 | 标题 | 来源 | 更新日期 |
|------|------|------|----------|
{rows}
"""
    snapshot_path.write_text(content, encoding="utf-8")


def _reset_snapshot():
    snapshot_path = Path(wiki_storage.WIKI_DIR) / "_wiki_index.md.snapshot"
    if snapshot_path.exists():
        snapshot_path.unlink()


def _make_orphan(db, slug="deleted-entity"):
    """建一个 wiki 页 + 关联 raw，写快照后删除页面，制造孤立 raw。"""
    # 防御：清掉之前失败运行的残留
    stale = db.query(wiki_models.WikiPage).filter_by(slug=slug).first()
    if stale:
        db.delete(stale)
        db.commit()
    page = wiki_models.WikiPage(
        id=str(uuid.uuid4()),
        slug=slug,
        title="Deleted Entity",
        type="entity",
        file_path=str(wiki_storage.write_page(slug, "entity", "# Deleted")),
        created_by="admin",
        updated_by="admin",
    )
    db.add(page)
    db.commit()
    db.refresh(page)

    raw = raw_models.RawFile(
        id=str(uuid.uuid4()),
        filename="deleted.pdf",
        original_name="deleted.pdf",
        storage_path="/tmp/deleted.pdf",
        status="ingested",
        uploaded_by="admin",
        entity_page_id=page.id,
    )
    db.add(raw)
    db.commit()
    db.refresh(raw)

    ingest_service.rebuild_wiki_index(db)
    _write_snapshot([slug])
    return page, raw


def _cleanup(db, raw_id, slugs):
    db.query(raw_models.RawFile).filter(raw_models.RawFile.id == raw_id).delete()
    for slug in slugs:
        db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == slug).delete()
    db.commit()
    _reset_snapshot()


def test_update_knowledge_base_reports_orphans_without_reingest():
    """删除页面后：update-knowledge-base 只报告孤立资料并刷新快照，不直接重建页面。"""
    token = _login_admin()
    headers = {"Authorization": f"Bearer {token}"}

    db = SessionLocal()
    try:
        _reset_snapshot()
        page, raw = _make_orphan(db)

        resp = client.delete("/wiki/deleted-entity", headers=headers)
        assert resp.status_code == 200, resp.text

        resp = client.post("/wiki/update-knowledge-base", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # 报告孤立资料，但不重建（reingested_count 恒为 0，不调用 LLM）
        assert "deleted-entity" in body["missing_slugs"]
        assert any(f["id"] == raw.id for f in body["orphan_raw_files"])
        assert body["reingested_count"] == 0
        assert body["snapshot_updated"] is True

        # 页面没有被自动重建
        assert db.query(wiki_models.WikiPage).filter_by(slug="deleted-entity").first() is None
    finally:
        _cleanup(db, raw.id, ["deleted-entity"])
        db.close()


def test_update_knowledge_base_establishes_baseline_when_no_snapshot():
    """无快照时建立基线，不报告历史删除。"""
    token = _login_admin()
    headers = {"Authorization": f"Bearer {token}"}

    _reset_snapshot()
    resp = client.post("/wiki/update-knowledge-base", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["missing_slugs"] == []
    assert body["orphan_raw_files"] == []
    assert body["reingested_count"] == 0
    assert body["snapshot_updated"] is True

    snapshot_path = Path(wiki_storage.WIKI_DIR) / "_wiki_index.md.snapshot"
    assert snapshot_path.exists()
    _reset_snapshot()


def test_detect_orphaned_raw_files_no_side_effects():
    """detect_orphaned_raw_files 只读：不写快照、不改索引。"""
    from app.wiki import service as wiki_service

    db = SessionLocal()
    try:
        _reset_snapshot()
        page, raw = _make_orphan(db)
        db.delete(page)
        db.commit()
        ingest_service.rebuild_wiki_index(db)  # db.delete 不触发索引重建，手动同步

        missing, orphaned = wiki_service.detect_orphaned_raw_files(db)
        assert "deleted-entity" in missing
        assert any(r.id == raw.id for r in orphaned)

        # 无副作用：快照仍是删除前的内容
        snapshot_path = Path(wiki_storage.WIKI_DIR) / "_wiki_index.md.snapshot"
        assert "deleted-entity" in snapshot_path.read_text(encoding="utf-8")
    finally:
        _cleanup(db, raw.id, ["deleted-entity"])
        db.close()
