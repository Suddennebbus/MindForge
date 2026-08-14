import json
from typing import Any, Awaitable, Callable

from app.ai import prompts


def build_candidates(web_results: list, arxiv_results: list) -> list:
    """把 web/arxiv 检索结果规范化为统一候选列表（arxiv 在前）。"""
    candidates = []
    for r in arxiv_results or []:
        url = (r.get("href") or "").strip()
        title = (r.get("title") or "").strip()
        if not url or not title:
            continue
        candidates.append({
            "title": title,
            "url": url,
            "authors": r.get("authors", "") or "",
            "source": "arxiv",
            "snippet": (r.get("body") or "")[:200],
        })
    for r in web_results or []:
        url = (r.get("href") or "").strip()
        title = (r.get("title") or "").strip()
        if not url or not title:
            continue
        candidates.append({
            "title": title,
            "url": url,
            "authors": "",
            "source": "web",
            "snippet": (r.get("body") or "")[:200],
        })
    return candidates


def map_selections(selections: Any, candidates: list) -> list:
    """把 LLM 输出的序号映射回真实候选，丢弃非法序号并按 URL 去重。"""
    readings = []
    seen = set()
    if not isinstance(selections, list):
        return readings
    for sel in selections:
        if not isinstance(sel, dict):
            continue
        try:
            idx = int(sel.get("index"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= len(candidates):
            continue
        c = candidates[idx]
        if c["url"] in seen:
            continue
        seen.add(c["url"])
        readings.append({
            "title": c["title"],
            "url": c["url"],
            "authors": c["authors"],
            "source": c["source"],
            "reason": str(sel.get("reason") or "")[:500],
            "status": "pending",
        })
    return readings


def fallback_readings(candidates: list) -> list:
    """LLM 失败时的规则降级：arxiv top 6 + web top 4，无推荐理由，按 URL 去重。"""
    picked = [c for c in candidates if c["source"] == "arxiv"][:6]
    picked += [c for c in candidates if c["source"] == "web"][:4]
    seen = set()
    readings = []
    for c in picked:
        if c["url"] in seen:
            continue
        seen.add(c["url"])
        readings.append({
            "title": c["title"],
            "url": c["url"],
            "authors": c["authors"],
            "source": c["source"],
            "reason": "",
            "status": "pending",
        })
    return readings


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


async def select_readings(
    direction: str,
    plan_context: str,
    web_results: list,
    arxiv_results: list,
    llm_call: Callable[[list], Awaitable[str]],
) -> list:
    """LLM 筛选高价值文献。llm_call: async (messages) -> response_text。

    LLM 只输出候选序号，URL 由本函数映射回真实检索结果。
    LLM 失败/输出无效时降级为 fallback_readings；无候选时返回空列表。
    """
    candidates = build_candidates(web_results, arxiv_results)
    if not candidates:
        return []
    messages = prompts.reading_selection.build_reading_selection_messages(
        direction, plan_context, candidates
    )
    try:
        response = await llm_call(messages)
        data = json.loads(_strip_code_fences(response))
        selections = data.get("selections") if isinstance(data, dict) else None
        readings = map_selections(selections, candidates)
        if readings:
            return readings
    except Exception:
        pass
    return fallback_readings(candidates)
