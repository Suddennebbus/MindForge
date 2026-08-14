# ----- 两阶段摄入：阶段一规划 + 阶段二单页生成 -----

INGEST_PLAN_SYSTEM = """你是 MindForge 的 wiki 管理员。阅读原始资料，规划要创建的 wiki 页面清单。

## 页面类型

- **entity**：论文/工具/数据集/模型/项目/标准等具体实体。每个核心实体单独成页。
- **concept**：方法/理论/指标/攻击面/防御策略/范式等抽象概念。
- **synthesis**：综合对比/攻防矩阵/跨实体总结。

## 规划原则

1. **拆分粒度要细，完整覆盖资料核心信息**，不要把多个主题硬塞进一页。一份信息密度高的论文/报告通常应产出 3-8 页：
   - 每个核心实体（论文/模型/框架/数据集/标准/工具）单独一个 entity 页；
   - 资料中深入阐述的每个可独立引用的话题（方法/理论/指标/攻击面/防御策略/范式），各拆一个 concept 页；
   - 涉及多方案对比、攻防矩阵、跨实体关系梳理时，拆 synthesis 页。
2. 对照已有页面清单：若某页面已存在且本资料能补充实质内容，用 "action": "enrich" 并给出 target_slug，不要重复建页；否则用 "action": "new"。
3. tags 尽量从现有标签中选（每页 3-8 个）；确实无法描述的核心主题可提议新标签，放入 new_tags（将由管理员审核）。
4. 不编造资料中没有的信息。

## 输出格式（纯 JSON，不要包含其他文字）

{"pages": [{"title": "页面标题", "type": "entity|concept|synthesis", "summary": "一句话摘要（不超过 60 字，勿展开论述）", "tags": ["已有标签"], "new_tags": ["提议新标签"], "action": "new|enrich", "target_slug": "enrich 时填已有页 slug，否则为空字符串"}]}"""


INGEST_PAGE_SYSTEM = """你是 MindForge 的 wiki 管理员。根据原始资料，为指定页面撰写正文 markdown。

## 内容要求

1. **完整提取**：不要遗漏资料中与本页主题相关的核心方法、关键数字、实验结论、作者/机构、标准号。
2. **有逻辑结构**：用二级/三级标题组织（## 摘要、## 核心框架/方法、## 关键事实、## 来源 等），不要只是零散 bullet。
3. **具体数字**：保留准确率、参数量、开销、年份、样本量、版本号等；对比数据用 markdown 表格完整呈现。
4. **拒绝资料搬运**：不逐字复述原文，提炼关键结论和数据。
5. **不编造**：资料中未提供的信息不要推测或编造。
6. **引用**：正文中可用 [[页面标题]] 引用相关页面（包括已有页面和本次同批生成的其他页面），用 wikilink 建立知识关联。
7. **使用中文**。
8. 若提供了该页面的现有内容，请把新资料的信息合并进去：保留原有结构与事实，新增/更新本资料带来的内容，不要丢失旧信息。

## 输出格式

只输出页面正文 markdown（以 # 标题开头），**不要输出 YAML frontmatter**，不要包含其他说明文字。"""


def build_ingest_plan_messages(
    document_text: str,
    filename: str,
    existing_tags: list,
    existing_pages: list,
    doc_metadata: dict | None = None,
) -> list:
    pages_text = "\n".join(
        f"- {p['slug']} | {p['title']} | {p['type']}" for p in existing_pages
    ) or "（空）"
    meta_text = ""
    if doc_metadata:
        pairs = "；".join(f"{k}: {v}" for k, v in doc_metadata.items() if v)
        if pairs:
            meta_text = f"\n\n文档元数据（来自文件属性，可信；作者/日期/arXiv 号以此为准）：{pairs}"
    return [
        {"role": "system", "content": INGEST_PLAN_SYSTEM},
        {"role": "user", "content": (
            f"现有标签：{', '.join(existing_tags)}\n\n"
            f"已有页面（slug | 标题 | 类型）：\n{pages_text}\n\n"
            f"来源文件：{filename}{meta_text}\n\n"
            f"资料内容：\n\n{document_text[:30000]}"
        )},
    ]


def build_ingest_page_messages(
    document_text: str,
    filename: str,
    page_spec: dict,
    allowed_tags: list,
    existing_page_content: str | None = None,
    sibling_pages: list | None = None,
) -> list:
    spec_text = (
        f"页面标题：{page_spec.get('title', '')}\n"
        f"页面类型：{page_spec.get('type', 'entity')}\n"
        f"页面摘要：{page_spec.get('summary', '')}\n"
        f"页面标签：{', '.join(page_spec.get('tags', []))}"
    )
    sibling_text = ""
    if sibling_pages:
        titles = [p.get("title") for p in sibling_pages if (p.get("title") or "").strip()]
        if titles:
            sibling_text = (
                "\n\n本次摄入同批生成的其他页面（若与本页相关，请在正文中用 [[页面标题]] 引用，"
                "标题需与下列完全一致）：\n" + "\n".join(f"- {t}" for t in titles)
            )
    existing_text = ""
    if existing_page_content:
        existing_text = f"\n\n该页面现有内容（请合并新资料信息，不要丢失旧内容）：\n\n{existing_page_content[:15000]}"
    return [
        {"role": "system", "content": INGEST_PAGE_SYSTEM},
        {"role": "user", "content": (
            f"本页可用的标签：{', '.join(allowed_tags)}\n\n"
            f"来源文件：{filename}\n\n"
            f"{spec_text}{sibling_text}\n\n"
            f"资料内容：\n\n{document_text[:30000]}{existing_text}"
        )},
    ]
