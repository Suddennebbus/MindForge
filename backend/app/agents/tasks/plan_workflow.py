import asyncio
import json
from datetime import datetime
from app.utils_time import beijing_now
from typing import Any
from app.ai import prompts, service


# 计划生成链路长输出步骤（analysis 调研报告 / plan_draft 计划草稿 / revision 修订稿）的
# max_tokens 上限。description 要求 3000-5000 字，实测输出可达 1.3w+ 字符，8192 会截断，
# 其中 plan_draft 的 JSON 截断直接导致 "Failed to parse plan draft JSON"。32768 彻底消除截断。
PLAN_LONG_OUTPUT_MAX_TOKENS = 32768


async def _llm_completion_text(config: Any, messages: list, max_tokens: int = 4096, run_id: str | None = None) -> str:
    """Run a non-streaming LLM call and return the full text, checking control signals before the call."""
    from app.agents.executor import check_control_signals

    if run_id:
        check_control_signals(run_id)
    text = ""
    async for chunk in service.chat_completion(config, messages, max_tokens=max_tokens):
        text += chunk
    return text


def _parse_json_safely(text: str, fallback: Any = None) -> Any:
    """Parse JSON from LLM output, allowing fallback on failure.

    兼容 LLM 偶发的 ```json ... ``` 代码块包裹（json.loads 对代码块会失败）。
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass
    return fallback


async def step_query_expansion(ctx: dict, config: Any) -> dict:
    direction = ctx["direction"]
    answers = ctx.get("answers", {})
    exploration_result = ctx.get("exploration_result")
    recommendation = ctx.get("recommendation")

    base_queries = []
    if recommendation and recommendation.get("action"):
        base_queries.append(recommendation["action"])
    base_queries.append(direction)
    answers_text = " ".join(str(v) for v in answers.values())
    if len(answers_text) > 10:
        combined = f"{direction} {' '.join(answers_text.split()[:20])}"
        if len(combined) > 30:
            base_queries.append(combined[:200])

    messages = prompts.interview_plan.build_search_query_expansion_messages(
        direction, answers,
        exploration_result=exploration_result,
        recommendation=recommendation,
        lang=ctx.get("lang", "zh"),
    )
    run_id = ctx.get("_run_id")
    response = await _llm_completion_text(config, messages, max_tokens=1024, run_id=run_id)
    expanded_raw = _parse_json_safely(response, [])
    # 新契约：{"web_queries": [...], "arxiv_queries": [...]}（arxiv 为纯英文学术查询）；
    # 兼容旧契约：纯数组视为 web_queries
    if isinstance(expanded_raw, dict):
        expanded = expanded_raw.get("web_queries") or []
        arxiv_expanded = expanded_raw.get("arxiv_queries") or []
    else:
        expanded, arxiv_expanded = expanded_raw, []
    if not isinstance(expanded, list):
        expanded = []
    expanded = [str(q).strip() for q in expanded if str(q).strip()]
    if not isinstance(arxiv_expanded, list):
        arxiv_expanded = []
    arxiv_expanded = [str(q).strip() for q in arxiv_expanded if str(q).strip()]

    search_queries = base_queries + expanded
    seen = set()
    final_queries = []
    for q in search_queries:
        q = q.strip()
        if not q or q.lower() in seen:
            continue
        seen.add(q.lower())
        final_queries.append(q)

    # arxiv_queries 独立去重，不与 base_queries（中文）混合
    final_arxiv = []
    for q in arxiv_expanded:
        if q.lower() not in seen:
            seen.add(q.lower())
            final_arxiv.append(q)

    return {"search_queries": final_queries[:8], "arxiv_queries": final_arxiv[:5]}


async def step_web_search(ctx: dict, config: Any) -> dict:
    from app.agents.executor import check_control_signals

    queries = ctx.get("search_queries", [])[:6]
    run_id = ctx.get("_run_id")
    if run_id:
        check_control_signals(run_id)

    async def search_one(q: str):
        if run_id:
            check_control_signals(run_id)
        return await asyncio.to_thread(service.search_web, q, 5)

    results_list = await asyncio.gather(*[search_one(q) for q in queries])

    seen = set()
    web_results = []
    for results in results_list:
        for r in results:
            href = r.get("href", "")
            if href and href not in seen:
                seen.add(href)
                web_results.append(r)

    return {"web_results": web_results[:12]}


async def step_arxiv_search(ctx: dict, config: Any) -> dict:
    from app.agents.executor import check_control_signals

    # 优先用英文学术查询（arXiv 是英文语料库，中文查询必然零结果）；
    # 无 arxiv_queries（旧契约/LLM 未给出）时回退 search_queries
    queries = (ctx.get("arxiv_queries") or ctx.get("search_queries", []))[:4]
    run_id = ctx.get("_run_id")
    if run_id:
        check_control_signals(run_id)

    # arXiv API 限流严格（约 1 次/3 秒），串行请求并保持间隔，避免并发触发 429
    results_list = []
    for i, q in enumerate(queries):
        if run_id:
            check_control_signals(run_id)
        if i > 0:
            await asyncio.sleep(3.5)
        results_list.append(await asyncio.to_thread(service.search_arxiv, q, 5))

    seen = set()
    arxiv_results = []
    for results in results_list:
        for r in results:
            href = r.get("href", "")
            if href and href not in seen:
                seen.add(href)
                arxiv_results.append(r)

    return {"arxiv_results": arxiv_results[:10]}


async def step_analysis(ctx: dict, config: Any) -> dict:
    direction = ctx["direction"]
    answers = ctx.get("answers", {})
    wiki_content = ctx.get("wiki_content", "")
    web_results = ctx.get("web_results", [])
    arxiv_results = ctx.get("arxiv_results", [])
    exploration_result = ctx.get("exploration_result")
    recommendation = ctx.get("recommendation")

    messages = prompts.interview_plan.build_research_analysis_messages(
        direction, answers, wiki_content, web_results, arxiv_results,
        exploration_result=exploration_result, recommendation=recommendation,
        lang=ctx.get("lang", "zh"),
    )
    run_id = ctx.get("_run_id")
    analysis_response = await _llm_completion_text(config, messages, max_tokens=PLAN_LONG_OUTPUT_MAX_TOKENS, run_id=run_id)
    return {"analysis_response": analysis_response}


async def step_plan_draft(ctx: dict, config: Any) -> dict:
    direction = ctx["direction"]
    wiki_content = ctx.get("wiki_content", "")
    analysis_response = ctx.get("analysis_response", "")
    exploration_result = ctx.get("exploration_result")
    recommendation = ctx.get("recommendation")

    output_type = "plan"
    answers = ctx.get("answers", {})
    ot_answer = answers.get("output_type")
    if isinstance(ot_answer, dict):
        output_type = ot_answer.get("choice") or ot_answer.get("text") or "plan"
    elif isinstance(ot_answer, str):
        output_type = ot_answer

    messages = prompts.interview_plan.build_create_plan_messages(
        direction, wiki_content,
        research_analysis=analysis_response,
        output_type=output_type,
        exploration_result=exploration_result, recommendation=recommendation,
        lang=ctx.get("lang", "zh"),
    )
    run_id = ctx.get("_run_id")
    plan_response = await _llm_completion_text(config, messages, max_tokens=PLAN_LONG_OUTPUT_MAX_TOKENS, run_id=run_id)
    plan_data = _parse_json_safely(plan_response)
    if not isinstance(plan_data, dict):
        raise ValueError("Failed to parse plan draft JSON")

    return {"plan_data": plan_data, "output_type": output_type}


async def step_critique(ctx: dict, config: Any) -> dict:
    direction = ctx["direction"]
    plan_data = ctx.get("plan_data", {})
    analysis_response = ctx.get("analysis_response", "")
    output_type = ctx.get("output_type", "plan")

    messages = prompts.interview_plan.build_plan_critique_messages(
        direction, json.dumps(plan_data, ensure_ascii=False),
        research_analysis=analysis_response,
        output_type=output_type,
        lang=ctx.get("lang", "zh"),
    )
    run_id = ctx.get("_run_id")
    critique_response = await _llm_completion_text(config, messages, max_tokens=4096, run_id=run_id)
    critique_json = _parse_json_safely(critique_response, {})
    if not isinstance(critique_json, dict):
        critique_json = {}

    return {"critique_json": critique_json}


async def step_revision(ctx: dict, config: Any) -> dict:
    direction = ctx["direction"]
    plan_data = ctx.get("plan_data", {})
    critique_json = ctx.get("critique_json", {})
    analysis_response = ctx.get("analysis_response", "")
    output_type = ctx.get("output_type", "plan")

    messages = prompts.interview_plan.build_plan_revision_messages(
        direction, json.dumps(plan_data, ensure_ascii=False),
        json.dumps(critique_json, ensure_ascii=False),
        research_analysis=analysis_response,
        output_type=output_type,
        lang=ctx.get("lang", "zh"),
    )
    run_id = ctx.get("_run_id")
    revision_response = await _llm_completion_text(config, messages, max_tokens=PLAN_LONG_OUTPUT_MAX_TOKENS, run_id=run_id)
    revised_plan = _parse_json_safely(revision_response)
    if revised_plan and isinstance(revised_plan, dict):
        plan_data = revised_plan

    return {"plan_data": plan_data}

async def step_reading_selection(ctx: dict, config: Any) -> dict:
    from app.ai import reading_service

    direction = ctx.get("direction", "")
    plan_data = ctx.get("plan_data", {})
    web_results = ctx.get("web_results", [])
    arxiv_results = ctx.get("arxiv_results", [])
    run_id = ctx.get("_run_id")
    plan_context = ""
    if isinstance(plan_data, dict):
        plan_context = (plan_data.get("description") or "")[:500]

    async def llm_call(messages):
        return await _llm_completion_text(config, messages, max_tokens=2048, run_id=run_id)

    readings = await reading_service.select_readings(
        direction, plan_context, web_results, arxiv_results, llm_call,
        lang=ctx.get("lang", "zh"),
    )
    return {"suggested_readings": readings}


async def step_save_plan(ctx: dict, config: Any) -> dict:
    db = ctx.get("_db")
    user_id = ctx.get("_user_id")
    plan_id = ctx.get("_plan_id")
    if db is None or user_id is None:
        raise ValueError("Missing database session or user_id in context")

    from app.plans import models as plans_models, storage as plans_storage

    plan_data = ctx.get("plan_data", {})
    direction = ctx.get("direction", "")

    plan = None
    if plan_id:
        plan = db.query(plans_models.Plan).filter(
            plans_models.Plan.id == plan_id
        ).first()

    def _pick(field: str, default=None):
        return plan_data.get(field, getattr(plan, field, default) if plan else default)

    title = plan_data.get("title", plan.title if plan else "未命名研究计划")
    if plan is None:
        slug = plans_storage.unique_slug(db, title)
        plan = plans_models.Plan(
            slug=slug,
            title=title,
            description=plan_data.get("description", ""),
            topic=plan_data.get("topic") or "",
            direction=plan_data.get("direction", direction),
            goals=plan_data.get("goals", []),
            related_slugs=plan_data.get("related_slugs", []),
            methodology=plan_data.get("methodology", ""),
            milestones=plan_data.get("milestones", []),
            key_challenges=plan_data.get("key_challenges", []),
            expected_contributions=plan_data.get("expected_contributions", []),
            research_questions=plan_data.get("research_questions", []),
            suggested_readings=ctx.get("suggested_readings", []),
            created_by=user_id,
            updated_by=user_id,
        )
        db.add(plan)
    else:
        plan.title = title
        plan.description = plan_data.get("description", plan.description or "")
        plan.topic = plan_data.get("topic") or plan.topic or ""
        plan.direction = plan_data.get("direction", plan.direction or direction)
        plan.goals = plan_data.get("goals", plan.goals or [])
        plan.related_slugs = plan_data.get("related_slugs", plan.related_slugs or [])
        plan.methodology = plan_data.get("methodology", plan.methodology or "")
        plan.milestones = plan_data.get("milestones", plan.milestones or [])
        plan.key_challenges = plan_data.get("key_challenges", plan.key_challenges or [])
        plan.expected_contributions = plan_data.get("expected_contributions", plan.expected_contributions or [])
        plan.research_questions = plan_data.get("research_questions", plan.research_questions or [])
        readings = ctx.get("suggested_readings")
        if readings:
            plan.suggested_readings = readings
        plan.status = "draft"
        plan.updated_by = user_id
        plan.updated_at = beijing_now()
        db.add(plan)

    db.commit()
    db.refresh(plan)

    if not plan.slug:
        plan.slug = plans_storage.unique_slug(db, plan.title, exclude_id=plan.id)
    plan.file_path = plans_storage.write_plan(plan.slug, plans_storage.build_plan_markdown(plan))
    db.commit()

    return {"plan_id": plan.id}
