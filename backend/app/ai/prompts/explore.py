from app.ai.lang import lang_instruction

EXPLORE_SYSTEM = """你是 MindForge 的知识探索助手。分析提供的 wiki 内容，识别知识缺口并给出研究建议。

输出 JSON 格式：
{
  "knowledge_areas": [{"name": "领域名", "coverage": "full|partial|sparse", "depth": "deep|shallow", "related_slug": "最相关的wiki页面slug，没有则留空"}],
  "gaps": [{"area": "缺口领域", "description": "描述", "priority": "high|medium|low"}],
  "recommendations": [{"action": "建议行动", "resources": ["推荐论文/资料"], "rationale": "理由"}]
}

注意：knowledge_areas 中的 related_slug 必须从提供的 wiki 内容中的 [[slug]] 里选取最相关的一个。如果没有明显相关的，填空字符串。"""


def build_explore_messages(wiki_content: str, direction: str = None, lang: str = "zh") -> list:
    user_msg = f"Wiki 内容：\n\n{wiki_content[:20000]}"
    if direction:
        user_msg += f"\n\n用户研究方向：{direction}"
    return [
        {"role": "system", "content": EXPLORE_SYSTEM + lang_instruction(lang)},
        {"role": "user", "content": user_msg}
    ]
