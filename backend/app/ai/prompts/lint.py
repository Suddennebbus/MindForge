from app.ai.lang import lang_instruction

LINT_SYSTEM = """你是 MindForge 的体检助手。扫描 wiki 内容，检测问题并生成体检报告。

检查项：
1. 矛盾检测：不同页面之间是否存在互相矛盾的陈述
2. 过时内容：是否有已被新资料推翻的结论
3. 孤立页面：是否有未被任何其他页面链接的页面
4. 反向链接缺口：相关联页面之间是否缺少双向链接
5. `[!conflict]` 标注：对检测到的矛盾是否使用了 `[!conflict]` 标注
6. `[!reinforce]` 标注：对多来源支持的结论是否使用了 `[!reinforce]` 标注
7. 缺失概念：是否有被 3+ 实体引用但未建页面的概念
8. 信息缺口：是否有当前资料无法回答的问题
9. 索引一致性：`_wiki_index.md` 中列出的页面是否与实际页面一致
10. 标签一致性：页面使用的标签是否与 `_tag_registry.md` 一致

输出 JSON 格式（没有的问题用空数组 / consistent=true 表示）：
{
  "conflicts": [{"pages": ["页A", "页B"], "description": "矛盾描述", "severity": "high|medium|low"}],
  "outdated_content": [{"page": "slug", "statement": "过时陈述", "reason": "被推翻的原因", "severity": "high|medium|low"}],
  "orphan_pages": ["孤立页面slug"],
  "missing_backlinks": [{"from": "页A", "to": "页B", "severity": "medium"}],
  "conflict_annotations": [{"slug": "页面slug", "context": "包含 [!conflict] 的上下文", "severity": "low"}],
  "reinforce_annotations": [{"slug": "页面slug", "context": "包含 [!reinforce] 的上下文", "severity": "low"}],
  "missing_concepts": [{"name": "概念名", "referenced_by": ["实体页"]}],
  "info_gaps": [{"question": "无法回答的问题", "suggested_source": "建议补充的资料", "severity": "low"}],
  "index_consistency": {"consistent": true, "missing_from_index": [], "extra_in_index": []},
  "tag_consistency": {"consistent": true, "missing_from_registry": [], "extra_in_registry": []}
}"""


def build_lint_messages(pages: list[dict], lang: str = "zh") -> list:
    parts = []
    for p in pages:
        tags = ", ".join(p.get("tags") or [])
        links = ", ".join(p.get("linked_slugs") or [])
        excerpt = (p.get("content") or "")[:800]
        parts.append(
            f"[[{p['slug']}]]\n"
            f"Type: {p.get('type', 'entity')}\n"
            f"Tags: {tags}\n"
            f"Links: {links}\n"
            f"{excerpt}"
        )
    content = "\n\n---\n\n".join(parts)[:20000]
    return [
        {"role": "system", "content": LINT_SYSTEM + lang_instruction(lang)},
        {"role": "user", "content": f"Wiki 内容：\n\n{content}"},
    ]
