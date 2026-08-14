def build_generate_plan_messages(
    wiki_content: str,
    exploration_result: dict,
    selected_recommendation: dict,
    web_results: list[dict],
) -> list:
    web_summaries = "\n\n".join(
        f"[{i+1}] {r['title']}\n{r['href']}\n{r['body'][:500]}"
        for i, r in enumerate(web_results[:5])
    )

    system = """你是一个研究计划制定助手。基于以下信息，生成一个结构化的研究计划：

你需要输出一个 JSON 对象，格式如下：
{
  "title": "研究计划标题（简洁明了）",
  "description": "研究背景与目标描述（200-500字）",
  "direction": "研究方向",
  "goals": ["目标1", "目标2", "目标3"],
  "related_slugs": ["相关的wiki页面slug列表"]
}

要求：
1. 标题必须简洁，不超过50字
2. 描述要详细，说明研究的意义、方法和预期成果
3. 目标要具体、可衡量，列出3-5个
4. related_slugs 必须从现有的知识库页面中选择
5. 只输出JSON，不要其他内容"""

    user = f"""现有知识库内容：
{wiki_content[:8000]}

探索分析结果：
知识覆盖：{len(exploration_result.get('knowledge_areas', []))} 个领域
知识缺口：{len(exploration_result.get('gaps', []))} 个
研究建议：{len(exploration_result.get('recommendations', []))} 条

用户选择的建议：
{selected_recommendation.get('action', '')}
理由：{selected_recommendation.get('rationale', '')}
参考资源：{', '.join(selected_recommendation.get('resources', []))}

网络搜索结果：
{web_summaries}

请基于以上所有信息，生成一个详细的研究计划。"""

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
