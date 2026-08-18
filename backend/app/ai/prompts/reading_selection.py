from app.ai.lang import lang_instruction

READING_SELECTION_SYSTEM = """你是研究助手，负责为研究计划筛选高价值文献资源。

从给定的候选资源编号列表中选出 8-12 个最有价值的，优先考虑：
- 与研究方向直接相关的综述、方法论论文、权威来源
- arXiv 论文优先于普通网页；内容空泛的网页（导航页、列表页）不要选
- 覆盖不同子主题，避免重复内容

只输出一个 JSON 对象，不要输出任何其他文字：
{"selections": [{"index": 0, "reason": "选择理由（一句话）"}]}

规则：
- index 必须是候选列表中的编号，不要编造列表之外的资源
- 不要输出 URL，URL 由系统按编号自动关联
- reason 说明该资源对研究计划的具体价值"""


def build_reading_selection_messages(direction: str, plan_context: str, candidates: list, lang: str = "zh") -> list:
    lines = [f"研究方向：{direction}"]
    if plan_context:
        lines.append(f"计划概要：{plan_context[:500]}")
    lines.append("\n候选资源列表：")
    for i, c in enumerate(candidates):
        authors = f" — {c['authors']}" if c.get("authors") else ""
        lines.append(f"[{i}] ({c['source']}) {c['title']}{authors}")
        snippet = (c.get("snippet") or "").strip()
        if snippet:
            lines.append(f"    {snippet}")
    return [
        {"role": "system", "content": READING_SELECTION_SYSTEM + lang_instruction(lang)},
        {"role": "user", "content": "\n".join(lines)},
    ]
