import asyncio
import json

from app.ai import reading_service

WEB = [{"title": "Blog Post", "href": "https://blog.example.com/x", "body": "A blog."}]
ARXIV = [{
    "title": "Paper A",
    "href": "https://arxiv.org/pdf/1234.5678",
    "body": "Abstract text",
    "authors": "Alice, Bob",
    "source": "arxiv",
}]


def test_build_candidates_normalizes_sources():
    candidates = reading_service.build_candidates(WEB, ARXIV)
    assert len(candidates) == 2
    # arxiv 排在 web 前面
    assert candidates[0]["source"] == "arxiv"
    assert candidates[0]["url"] == "https://arxiv.org/pdf/1234.5678"
    assert candidates[0]["authors"] == "Alice, Bob"
    assert candidates[1]["source"] == "web"
    assert candidates[1]["authors"] == ""


def test_build_candidates_skips_empty_url_or_title():
    bad = [{"title": "", "href": "https://x.com"}, {"title": "T", "href": ""}]
    assert reading_service.build_candidates(bad, []) == []


def test_map_selections_drops_invalid_indices():
    candidates = reading_service.build_candidates(WEB, ARXIV)
    selections = [
        {"index": 0, "reason": "核心论文"},
        {"index": 99, "reason": "越界"},
        {"index": "not-a-number"},
        "garbage",
    ]
    readings = reading_service.map_selections(selections, candidates)
    assert len(readings) == 1
    assert readings[0]["url"] == candidates[0]["url"]
    assert readings[0]["reason"] == "核心论文"
    assert readings[0]["status"] == "pending"


def test_map_selections_dedupes_urls():
    candidates = reading_service.build_candidates(WEB, ARXIV)
    readings = reading_service.map_selections([{"index": 0}, {"index": 0}], candidates)
    assert len(readings) == 1


def test_select_readings_maps_llm_indices():
    async def fake_llm(messages):
        return json.dumps({"selections": [{"index": 0, "reason": "综述性强"}]})

    readings = asyncio.run(
        reading_service.select_readings("dir", "ctx", WEB, ARXIV, fake_llm)
    )
    assert len(readings) == 1
    assert readings[0]["title"] == "Paper A"
    assert readings[0]["reason"] == "综述性强"


def test_select_readings_strips_code_fences():
    async def fence_llm(messages):
        return "```json\n{\"selections\": [{\"index\": 1, \"reason\": \"r\"}]}\n```"

    readings = asyncio.run(
        reading_service.select_readings("dir", "ctx", WEB, ARXIV, fence_llm)
    )
    assert len(readings) == 1
    assert readings[0]["title"] == "Blog Post"


def test_select_readings_falls_back_on_invalid_json():
    async def bad_llm(messages):
        return "not json at all"

    readings = asyncio.run(
        reading_service.select_readings("dir", "ctx", WEB, ARXIV, bad_llm)
    )
    # 降级：arxiv top 6 + web top 4 → 两个候选都入选，reason 为空
    assert len(readings) == 2
    assert readings[0]["source"] == "arxiv"
    assert all(r["reason"] == "" for r in readings)


def test_select_readings_falls_back_on_llm_exception():
    async def raising_llm(messages):
        raise RuntimeError("boom")

    readings = asyncio.run(
        reading_service.select_readings("dir", "ctx", WEB, ARXIV, raising_llm)
    )
    assert len(readings) == 2


def test_select_readings_empty_candidates_returns_empty():
    async def fake_llm(messages):
        return "{}"

    assert asyncio.run(
        reading_service.select_readings("d", "", [], [], fake_llm)
    ) == []


def test_fallback_readings_dedupes_urls():
    dup_web = WEB + [{"title": "Dup", "href": ARXIV[0]["href"], "body": "same url"}]

    async def bad_llm(messages):
        return "not json at all"

    readings = asyncio.run(
        reading_service.select_readings("dir", "ctx", dup_web, ARXIV, bad_llm)
    )
    urls = [r["url"] for r in readings]
    assert len(urls) == len(set(urls))
    assert len(readings) == 2
    assert readings[0]["source"] == "arxiv"


# ---------- Task 4: download endpoints ----------
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.plans import models as plans_models

client = TestClient(app)


def _login_admin():
    resp = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _make_plan(db, readings):
    plan = plans_models.Plan(
        id=str(uuid.uuid4()),
        slug=f"test-readings-{uuid.uuid4().hex[:8]}",
        title="测试计划",
        status="draft",
        suggested_readings=readings,
        created_by="admin",
        updated_by="admin",
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _cleanup_plan(db, plan_id):
    plan = db.query(plans_models.Plan).filter_by(id=plan_id).first()
    if plan:
        db.delete(plan)
    from app.raw import models as raw_models
    db.query(raw_models.RawFile).filter(
        raw_models.RawFile.storage_path.like("/tmp/test-dl-%")
    ).delete(synchronize_session=False)
    db.commit()


def test_download_single_reading_success():
    headers = _login_admin()
    db = SessionLocal()
    plan = _make_plan(db, [
        {"title": "Paper/A: B?", "url": "https://arxiv.org/pdf/1.pdf", "status": "pending"},
    ])
    try:
        with patch("app.ai.router.raw_storage.download_to_pre_raw") as mock_dl:
            mock_dl.return_value = {
                "filename": "Paper_A_ B_.pdf",
                "storage_path": "/tmp/test-dl-1.pdf",
                "file_size": 10,
                "mime_type": "application/pdf",
            }
            resp = client.post(f"/ai/plan/{plan.id}/readings/0/download", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "downloaded"
        called_filename = mock_dl.call_args.kwargs["filename"]
        assert "/" not in called_filename and ":" not in called_filename

        db.expire_all()
        refreshed = db.query(plans_models.Plan).filter_by(id=plan.id).first()
        assert refreshed.suggested_readings[0]["status"] == "downloaded"
        assert refreshed.suggested_readings[0]["raw_file_id"]
    finally:
        _cleanup_plan(db, plan.id)
        db.close()


def test_download_single_reading_out_of_range():
    headers = _login_admin()
    db = SessionLocal()
    plan = _make_plan(db, [])
    try:
        resp = client.post(f"/ai/plan/{plan.id}/readings/3/download", headers=headers)
        assert resp.status_code == 404
    finally:
        _cleanup_plan(db, plan.id)
        db.close()


def test_download_papers_partial_failure_continues():
    headers = _login_admin()
    db = SessionLocal()
    plan = _make_plan(db, [
        {"title": "Bad", "url": "https://bad.example.com/x.pdf", "status": "pending"},
        {"title": "Good", "url": "https://arxiv.org/pdf/2.pdf", "status": "pending"},
    ])
    try:
        with patch("app.ai.router.raw_storage.download_to_pre_raw") as mock_dl:
            mock_dl.side_effect = [
                Exception("timeout"),
                {
                    "filename": "Good.pdf",
                    "storage_path": "/tmp/test-dl-2.pdf",
                    "file_size": 10,
                    "mime_type": "application/pdf",
                },
            ]
            resp = client.post(f"/ai/plan/{plan.id}/download-papers", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["downloaded"]) == 1
        assert len(body["errors"]) == 1

        db.expire_all()
        refreshed = db.query(plans_models.Plan).filter_by(id=plan.id).first()
        statuses = [r["status"] for r in refreshed.suggested_readings]
        assert statuses == ["failed", "downloaded"]
        assert refreshed.suggested_readings[0]["error"]
    finally:
        _cleanup_plan(db, plan.id)
        db.close()


def test_generate_readings_backfills_plan():
    headers = _login_admin()
    db = SessionLocal()
    plan = _make_plan(db, [])
    try:
        with patch("app.ai.service.search_web", return_value=WEB), \
             patch("app.ai.service.search_arxiv", return_value=ARXIV), \
             patch("app.ai.router._get_default_config",
                   return_value=SimpleNamespace(id="cfg", model="m", provider="p")), \
             patch("app.ai.router._call_llm_tracked",
                   new=AsyncMock(return_value=json.dumps(
                       {"selections": [{"index": 0, "reason": "核心综述"}]}
                   ))):
            resp = client.post(f"/plans/{plan.id}/generate-readings", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["count"] == 1
        assert body["suggested_readings"][0]["title"] == "Paper A"
        assert body["suggested_readings"][0]["reason"] == "核心综述"

        db.expire_all()
        refreshed = db.query(plans_models.Plan).filter_by(id=plan.id).first()
        assert len(refreshed.suggested_readings) == 1
    finally:
        _cleanup_plan(db, plan.id)
        db.close()


# ---------- arXiv 英文查询修复（中文查询在 arXiv 恒返回 0）----------

from app.agents.tasks import plan_workflow


def test_step_query_expansion_parses_new_contract():
    """新契约 {"web_queries": [...], "arxiv_queries": [...]}：arxiv_queries 独立返回。"""
    payload = json.dumps({
        "web_queries": ["LLM guardrails survey", "大模型 护栏 评测"],
        "arxiv_queries": ["LLM safety guardrails", "jailbreak attacks LLM"],
    })
    with patch.object(plan_workflow, "_llm_completion_text", new=AsyncMock(return_value=payload)):
        out = asyncio.run(plan_workflow.step_query_expansion({"direction": "大模型安全护栏"}, None))
    # base_queries（中文 direction）只进 web 查询，不进 arxiv 查询
    assert any("大模型安全护栏" in q for q in out["search_queries"])
    assert out["arxiv_queries"] == ["LLM safety guardrails", "jailbreak attacks LLM"]


def test_step_query_expansion_legacy_list_contract():
    """旧契约纯数组：arxiv_queries 为空，step_arxiv_search 将回退 search_queries。"""
    payload = json.dumps(["q1", "q2"])
    with patch.object(plan_workflow, "_llm_completion_text", new=AsyncMock(return_value=payload)):
        out = asyncio.run(plan_workflow.step_query_expansion({"direction": "d"}, None))
    assert out["arxiv_queries"] == []
    assert "q1" in out["search_queries"]


def test_step_arxiv_search_prefers_english_arxiv_queries():
    """arxiv 检索必须用英文学术查询，而不是中文 base_queries。"""
    seen = []

    def fake_search(query, n):
        seen.append(query)
        return ARXIV

    ctx = {
        "search_queries": ["大模型安全护栏", "LLM guardrails survey"],
        "arxiv_queries": ["LLM safety guardrails"],
    }
    with patch.object(plan_workflow.service, "search_arxiv", side_effect=fake_search):
        out = asyncio.run(plan_workflow.step_arxiv_search(ctx, None))
    assert seen == ["LLM safety guardrails"]
    assert out["arxiv_results"]


def test_step_arxiv_search_falls_back_to_search_queries():
    seen = []

    def fake_search(query, n):
        seen.append(query)
        return ARXIV

    ctx = {"search_queries": ["q1", "q2"], "arxiv_queries": []}
    with patch.object(plan_workflow.service, "search_arxiv", side_effect=fake_search):
        asyncio.run(plan_workflow.step_arxiv_search(ctx, None))
    assert seen == ["q1", "q2"]


def test_generate_readings_uses_english_academic_queries():
    """generate-readings：先用 LLM 生成英文查询再查 arXiv。"""
    headers = _login_admin()
    db = SessionLocal()
    plan = _make_plan(db, [])
    arxiv_seen = []
    llm_responses = [
        json.dumps(["LLM safety guardrails"]),  # 第一次：英文学术查询
        json.dumps({"selections": [{"index": 0, "reason": "核心综述"}]}),  # 第二次：筛选
    ]

    def fake_arxiv(query, n):
        arxiv_seen.append(query)
        return ARXIV

    try:
        with patch("app.ai.service.search_web", return_value=WEB), \
             patch("app.ai.service.search_arxiv", side_effect=fake_arxiv), \
             patch("app.ai.router._get_default_config",
                   return_value=SimpleNamespace(id="cfg", model="m", provider="p")), \
             patch("app.ai.router._call_llm_tracked",
                   new=AsyncMock(side_effect=llm_responses)):
            resp = client.post(f"/plans/{plan.id}/generate-readings", headers=headers)
        assert resp.status_code == 200, resp.text
        assert arxiv_seen == ["LLM safety guardrails"]
        body = resp.json()
        assert body["count"] == 1
        assert body["suggested_readings"][0]["source"] == "arxiv"
    finally:
        _cleanup_plan(db, plan.id)
        db.close()


def test_generate_readings_falls_back_when_academic_query_llm_fails():
    """学术查询 LLM 失败时回退 direction/title 原样查询，功能不中断。"""
    headers = _login_admin()
    db = SessionLocal()
    plan = _make_plan(db, [])
    arxiv_seen = []

    def fake_arxiv(query, n):
        arxiv_seen.append(query)
        return ARXIV

    async def flaky_llm(*args, **kwargs):
        # 第一次（学术查询）抛异常；第二次（筛选）正常返回
        if flaky_llm.calls == 0:
            flaky_llm.calls += 1
            raise RuntimeError("LLM down")
        return json.dumps({"selections": [{"index": 0, "reason": "r"}]})
    flaky_llm.calls = 0

    try:
        with patch("app.ai.service.search_web", return_value=WEB), \
             patch("app.ai.service.search_arxiv", side_effect=fake_arxiv), \
             patch("app.ai.router._get_default_config",
                   return_value=SimpleNamespace(id="cfg", model="m", provider="p")), \
             patch("app.ai.router._call_llm_tracked", new=flaky_llm):
            resp = client.post(f"/plans/{plan.id}/generate-readings", headers=headers)
        assert resp.status_code == 200, resp.text
        # 回退为用 direction/title（_make_plan 标题为「测试计划」）查询
        assert arxiv_seen and all("测试计划" in q for q in arxiv_seen)
        assert resp.json()["count"] == 1
    finally:
        _cleanup_plan(db, plan.id)
        db.close()
