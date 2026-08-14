"""两阶段摄入测试：plan_ingest / run_ingest_generation / 端点全流程（全部 mock LLM）。"""
import json
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.ai import ingest_service, models as ai_models
from app.auth.models import User
from app.raw import models as raw_models
from app.wiki import models as wiki_models, storage as wiki_storage

client = TestClient(app)

DOC_PATH = Path("/tmp/mf_test_ingest_doc.md")
DOC_TEXT = "# 测试资料\n\n本文介绍测试实体A 与 Agent 安全评估方法，准确率 92.80%，发布于 2026-07-01。"

PLAN_PAGES = [
    {
        "title": "测试实体A",
        "type": "entity",
        "summary": "测试用实体",
        "tags": ["不存在的标签"],          # 不在词表 → 应被移入 new_tags
        "new_tags": ["新标签X"],
        "action": "new",
        "target_slug": "",
    },
    {
        "title": "Agent安全评估",
        "type": "concept",
        "summary": "合并新内容",
        "tags": [],
        "new_tags": [],
        "action": "enrich",
        "target_slug": "test-ingest-concept",
    },
]

NEW_PAGE_BODY = "# 测试实体A\n\n## 摘要\n测试实体A，准确率 92.80%。\n\n## 来源\n- raw/mf_test_ingest_doc.md"
ENRICH_BODY = "# Agent安全评估\n\n## 摘要\n旧内容 + 新资料补充的评估方法。\n\n## 来源\n- raw/old.pdf\n- raw/mf_test_ingest_doc.md"

EXISTING_SLUG = "test-ingest-concept"


def _fake_chat_completion(responses):
    """构造 chat_completion 假实现：按顺序返回完整响应（单 chunk）。"""
    queue = list(responses)

    def _fake(config, messages, **kwargs):
        usage_out = kwargs.get("usage_out")
        if usage_out is not None:
            usage_out["usage"] = {"prompt_tokens": 10, "completion_tokens": 20}
            usage_out["finish_reason"] = "stop"
        resp = queue.pop(0)
        if isinstance(resp, Exception):
            raise resp

        async def gen():
            yield resp

        return gen()

    return _fake


def _dummy_config():
    return SimpleNamespace(
        id="test-llm-config", provider="test", model="test-model",
        api_key_encrypted="x", base_url=None,
    )


@pytest.fixture()
def ctx():
    """准备：临时文档、raw 记录、已有概念页、admin 用户；结束后清理。"""
    DOC_PATH.write_text(DOC_TEXT, encoding="utf-8")
    db = SessionLocal()
    user = db.query(User).filter(User.username == "admin").first()
    assert user, "seed admin user required"

    raw = raw_models.RawFile(
        id=str(uuid.uuid4()),
        filename="mf_test_ingest_doc.md",
        original_name="mf_test_ingest_doc.md",
        storage_type="local",
        storage_path=str(DOC_PATH),
        file_size=DOC_PATH.stat().st_size,
        mime_type="text/markdown",
        status="pending",
        uploaded_by=user.id,
    )
    db.add(raw)

    wiki_storage.ensure_dirs()
    existing = wiki_models.WikiPage(
        id=str(uuid.uuid4()),
        slug=EXISTING_SLUG,
        title="Agent安全评估",
        type="concept",
        tags=["旧标签"],
        summary="旧摘要",
        source_paths=["raw/old.pdf"],
        linked_slugs=[],
        file_path=str(wiki_storage.write_page(EXISTING_SLUG, "concept", "# Agent安全评估\n\n旧内容")),
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(existing)
    db.commit()
    db.refresh(raw)

    created_slugs: list[str] = []
    yield SimpleNamespace(db=db, user=user, raw=raw, existing=existing, created_slugs=created_slugs)

    # 清理
    try:
        db.query(ai_models.IngestSession).filter(
            ai_models.IngestSession.raw_file_id == raw.id
        ).delete()
        db.query(raw_models.RawFile).filter(raw_models.RawFile.id == raw.id).delete()
        for slug in [EXISTING_SLUG, *created_slugs]:
            page = db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == slug).first()
            if page:
                try:
                    wiki_storage.delete_page(page.file_path)
                except Exception:
                    pass
                db.delete(page)
        db.commit()
        ingest_service.rebuild_wiki_index(db)
        ingest_service.rebuild_tag_registry(db)
    finally:
        db.close()
        DOC_PATH.unlink(missing_ok=True)


def test_plan_ingest_creates_session(ctx):
    """阶段一：mock 规划 JSON → session 落库、new_tags 提取、tags 校验兜底。"""
    plan_json = json.dumps({"pages": PLAN_PAGES}, ensure_ascii=False)
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([f"```json\n{plan_json}\n```"]),
    ):
        import asyncio
        session = asyncio.run(ingest_service.plan_ingest(ctx.db, ctx.raw, ctx.user, _dummy_config()))

    assert session.status == "planned"
    plan = json.loads(session.plan_json)
    pages = plan["pages"]
    assert len(pages) == 2

    new_page = pages[0]
    assert new_page["action"] == "new"
    # 不在词表的 tags 被移入 new_tags
    assert new_page["tags"] == []
    assert "不存在的标签" in new_page["new_tags"]
    assert "新标签X" in new_page["new_tags"]

    enrich_page = pages[1]
    assert enrich_page["action"] == "enrich"
    assert enrich_page["target_slug"] == EXISTING_SLUG


def test_plan_ingest_enrich_unknown_target_downgraded(ctx):
    """enrich 指向不存在的 slug → 降级为 new。"""
    bad_plan = json.dumps({"pages": [{
        "title": "幽灵页面", "type": "concept", "summary": "",
        "tags": [], "new_tags": [], "action": "enrich", "target_slug": "not-exist-slug",
    }]}, ensure_ascii=False)
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([bad_plan]),
    ):
        import asyncio
        session = asyncio.run(ingest_service.plan_ingest(ctx.db, ctx.raw, ctx.user, _dummy_config()))

    page = json.loads(session.plan_json)["pages"][0]
    assert page["action"] == "new"
    assert page["target_slug"] == ""


def test_plan_ingest_salvages_truncated_json(ctx):
    """阶段一输出被 max_tokens 截断（finish_reason=length）时，
    应抢救出已完整的页面对象，而不是整体丢弃为 no_pages_planned。"""
    plan_json = json.dumps({"pages": PLAN_PAGES}, ensure_ascii=False)
    # 模拟截断：第二个页面对象写到一半被切断
    cut = plan_json.rindex('},')
    truncated = plan_json[:cut + 1] + ',"title": "写到一半被截'
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([truncated]),
    ):
        import asyncio
        session = asyncio.run(ingest_service.plan_ingest(ctx.db, ctx.raw, ctx.user, _dummy_config()))

    pages = json.loads(session.plan_json)["pages"]
    assert len(pages) == 1
    assert pages[0]["title"] == "测试实体A"


def _make_session(ctx, pages) -> ai_models.IngestSession:
    session = ai_models.IngestSession(
        id=str(uuid.uuid4()),
        raw_file_id=ctx.raw.id,
        user_id=ctx.user.id,
        status="planned",
        plan_json=json.dumps({"pages": pages}, ensure_ascii=False),
        progress_json="{}",
    )
    ctx.db.add(session)
    ctx.db.commit()
    ctx.db.refresh(session)
    return session


def test_run_ingest_generation_new_and_enrich(ctx):
    """阶段二：new 建页 + tags 过滤；enrich 并集合并 + M2M 血缘；进度与状态收尾。"""
    session = _make_session(ctx, PLAN_PAGES)
    confirmed = [
        {**PLAN_PAGES[0], "tags": ["新标签X", "未批准标签"]},  # 未批准标签应被丢弃
        {**PLAN_PAGES[1], "tags": ["新标签X"]},
    ]
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([NEW_PAGE_BODY, ENRICH_BODY]),
    ), patch.object(ingest_service, "get_default_config_for_user", return_value=_dummy_config()):
        import asyncio
        asyncio.run(ingest_service.run_ingest_generation(ctx.db, session.id, confirmed, ctx.user.id))

    ctx.db.refresh(session)
    assert session.status == "completed"
    progress = json.loads(session.progress_json)
    assert progress["done"] == 2
    assert all(r["status"] == "ok" for r in progress["page_results"])

    # new 页：tags 只保留已批准的新标签，未批准的被过滤
    new_slug = progress["page_results"][0]["slug"]
    ctx.created_slugs.append(new_slug)
    new_page = ctx.db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == new_slug).first()
    assert new_page is not None
    assert new_page.tags == ["新标签X"]
    assert "92.80%" in wiki_storage.read_page(new_page.file_path)
    # M2M 血缘：新页挂到当前 raw
    assert any(r.id == ctx.raw.id for r in new_page.raw_files)

    # enrich 页：sources/tags 取并集，正文被替换，M2M 挂上当前 raw
    ctx.db.refresh(ctx.existing)
    assert set(ctx.existing.source_paths) == {"raw/old.pdf", "raw/mf_test_ingest_doc.md"}
    assert set(ctx.existing.tags) == {"旧标签", "新标签X"}
    enriched_content = wiki_storage.read_page(ctx.existing.file_path)
    assert "新资料补充" in enriched_content
    assert any(r.id == ctx.raw.id for r in ctx.existing.raw_files)

    # raw 状态收尾
    ctx.db.refresh(ctx.raw)
    assert ctx.raw.status == "ingested"


def test_run_ingest_generation_page_failure_does_not_block(ctx):
    """单页失败记录进 progress 并继续后续页面。"""
    session = _make_session(ctx, PLAN_PAGES[:1])
    confirmed = [
        {**PLAN_PAGES[0], "title": "会失败的页面", "tags": []},
        {**PLAN_PAGES[0], "title": "会成功的页面", "tags": []},
    ]
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([RuntimeError("LLM down"), NEW_PAGE_BODY]),
    ), patch.object(ingest_service, "get_default_config_for_user", return_value=_dummy_config()):
        import asyncio
        asyncio.run(ingest_service.run_ingest_generation(ctx.db, session.id, confirmed, ctx.user.id))

    ctx.db.refresh(session)
    assert session.status == "completed"
    progress = json.loads(session.progress_json)
    assert progress["done"] == 2
    assert progress["page_results"][0]["status"] == "error"
    assert "LLM down" in progress["page_results"][0]["error"]
    assert progress["page_results"][1]["status"] == "ok"
    ctx.created_slugs.append(progress["page_results"][1]["slug"])


def test_ingest_endpoints_full_flow(ctx):
    """端点全流程：plan → generate（后台）→ 轮询至 completed。"""
    token = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    plan_json = json.dumps({"pages": PLAN_PAGES[:1]}, ensure_ascii=False)
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([plan_json]),
    ), patch("app.ai.router._get_default_config", return_value=_dummy_config()):
        resp = client.post("/ai/ingest/plan", json={"raw_file_id": ctx.raw.id}, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["all_new_tags"] == sorted(["新标签X", "不存在的标签"])
    session_id = data["session_id"]
    ctx_db_session = ctx.db.query(ai_models.IngestSession).filter_by(id=session_id).first()
    assert ctx_db_session is not None

    confirmed = [{**data["pages"][0], "tags": data["pages"][0]["tags"] + ["新标签X"]}]
    with patch(
        "app.ai.ingest_service.ai_service.chat_completion",
        new=_fake_chat_completion([NEW_PAGE_BODY]),
    ):
        resp = client.post(f"/ai/ingest/sessions/{session_id}/generate", json={"pages": confirmed}, headers=headers)
        assert resp.status_code == 200, resp.text

        # 轮询直到终态（后台任务跑在同一事件循环）
        final = None
        for _ in range(40):
            resp = client.get(f"/ai/ingest/sessions/{session_id}", headers=headers)
            assert resp.status_code == 200, resp.text
            body = resp.json()
            if body["status"] in ("completed", "failed", "cancelled"):
                final = body
                break
            time.sleep(0.25)

    assert final is not None, "generation did not reach terminal status in time"
    assert final["status"] == "completed", final
    results = final["progress"]["page_results"]
    assert len(results) == 1 and results[0]["status"] == "ok"
    ctx.created_slugs.append(results[0]["slug"])

    # 终态后 cancel 不再改变状态
    resp = client.post(f"/ai/ingest/sessions/{session_id}/cancel", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


def test_ingest_plan_batch_endpoint(ctx):
    """批量规划：多文件分别建 session；空规划文件进 errors 且不留 orphan session。"""
    token = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    doc2 = Path("/tmp/mf_test_ingest_doc2.md")
    doc2.write_text(DOC_TEXT, encoding="utf-8")
    raw2 = raw_models.RawFile(
        id=str(uuid.uuid4()),
        filename="mf_test_ingest_doc2.md",
        original_name="mf_test_ingest_doc2.md",
        storage_type="local",
        storage_path=str(doc2),
        file_size=doc2.stat().st_size,
        mime_type="text/markdown",
        status="pending",
        uploaded_by=ctx.user.id,
    )
    ctx.db.add(raw2)
    ctx.db.commit()
    ctx.db.refresh(raw2)

    plan_json = json.dumps({"pages": PLAN_PAGES[:1]}, ensure_ascii=False)
    empty_plan = json.dumps({"pages": []})
    try:
        with patch(
            "app.ai.ingest_service.ai_service.chat_completion",
            new=_fake_chat_completion([plan_json, empty_plan]),
        ), patch("app.ai.router._get_default_config", return_value=_dummy_config()):
            resp = client.post(
                "/ai/ingest/plan-batch",
                json={"raw_file_ids": [ctx.raw.id, raw2.id]},
                headers=headers,
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert len(body["sessions"]) == 1
        assert body["sessions"][0]["raw_file_id"] == ctx.raw.id
        assert body["sessions"][0]["filename"] == ctx.raw.original_name
        assert body["sessions"][0]["all_new_tags"]

        assert len(body["errors"]) == 1
        assert body["errors"][0]["raw_file_id"] == raw2.id
        assert body["errors"][0]["error"] == "no_pages_planned"

        # 空规划的 session 被标记 cancelled，不会停留在 planned
        orphan = ctx.db.query(ai_models.IngestSession).filter_by(raw_file_id=raw2.id).first()
        assert orphan.status == "cancelled"

        # 清理批量产生的 session
        ctx.db.query(ai_models.IngestSession).filter(
            ai_models.IngestSession.raw_file_id.in_([ctx.raw.id, raw2.id])
        ).delete(synchronize_session=False)
        ctx.db.commit()
    finally:
        ctx.db.query(raw_models.RawFile).filter(raw_models.RawFile.id == raw2.id).delete()
        ctx.db.commit()
        doc2.unlink(missing_ok=True)


def test_plan_batch_includes_orphaned_raw_files(ctx):
    """删除 wiki 页面后，plan-batch(include_orphans=True) 把孤立资料纳入规划（reason=orphan）。"""
    token = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    from app.ai import ingest_service as _ingest
    from pathlib import Path as _Path

    db = ctx.db
    # 制造孤立 raw：页面 + 关联 raw → 快照 → 删除页面
    page = wiki_models.WikiPage(
        id=str(uuid.uuid4()),
        slug="orphan-restore-entity",
        title="Orphan Entity",
        type="entity",
        file_path=str(wiki_storage.write_page("orphan-restore-entity", "entity", "# Orphan")),
        created_by=ctx.user.id,
        updated_by=ctx.user.id,
    )
    db.add(page)
    orphan_doc = Path("/tmp/mf_test_orphan_doc.md")
    orphan_doc.write_text(DOC_TEXT, encoding="utf-8")
    raw = raw_models.RawFile(
        id=str(uuid.uuid4()),
        filename="mf_test_orphan_doc.md",
        original_name="mf_test_orphan_doc.md",
        storage_type="local",
        storage_path=str(orphan_doc),
        file_size=orphan_doc.stat().st_size,
        mime_type="text/markdown",
        status="ingested",
        uploaded_by=ctx.user.id,
        entity_page_id=page.id,
    )
    db.add(raw)
    db.commit()
    db.refresh(raw)

    _ingest.rebuild_wiki_index(db)
    snapshot_path = _Path(wiki_storage.WIKI_DIR) / "_wiki_index.md.snapshot"
    index_path = _Path(wiki_storage.WIKI_DIR) / "_wiki_index.md"
    snapshot_path.write_text(index_path.read_text(encoding="utf-8"), encoding="utf-8")

    resp = client.delete("/wiki/orphan-restore-entity", headers=headers)
    assert resp.status_code == 200, resp.text

    plan_json = json.dumps({"pages": PLAN_PAGES[:1]}, ensure_ascii=False)
    try:
        with patch(
            "app.ai.ingest_service.ai_service.chat_completion",
            new=_fake_chat_completion([plan_json]),
        ), patch("app.ai.router._get_default_config", return_value=_dummy_config()):
            resp = client.post(
                "/ai/ingest/plan-batch",
                json={"raw_file_ids": [], "include_orphans": True},
                headers=headers,
            )
        assert resp.status_code == 200, resp.text
        orphan_sessions = [s for s in resp.json()["sessions"] if s["raw_file_id"] == raw.id]
        assert orphan_sessions, "orphan raw file should be planned for restore"
        assert orphan_sessions[0]["reason"] == "orphan"
    finally:
        db.query(ai_models.IngestSession).filter(ai_models.IngestSession.raw_file_id == raw.id).delete()
        db.query(raw_models.RawFile).filter(raw_models.RawFile.id == raw.id).delete()
        db.query(wiki_models.WikiPage).filter(wiki_models.WikiPage.slug == "orphan-restore-entity").delete()
        db.commit()
        snapshot_path.unlink(missing_ok=True)
        orphan_doc.unlink(missing_ok=True)
