from app.ai.lang import lang_instruction

CHAT_INGEST_SYSTEM = """你是 MindForge 的 wiki 管理员。用户认可了一段 AI 对话回答的价值，需要你把它沉淀为知识库中的结构化 wiki 页面。

## 输入

- 用户的原始问题
- AI 基于知识库页面给出的回答（可能引用多个 [[页面]]）

## 任务

把回答内容整理为 1 个 wiki 页面（通常为 synthesis 综合页；若回答聚焦于单一抽象概念，也可以是 concept 概念页）。

## 页面类型

- **synthesis**：综合对比/跨页面总结/多维度梳理。大多数对话回答属于此类。
- **concept**：回答深入定义了某个可独立引用的方法/理论/范式。

## 页面结构要求

综合页建议结构：
```
# 标题

## 摘要
2-3 句概括综合结论。

## 主体内容
- 按回答的维度/主题组织二级、三级标题
- 对比数据用 markdown 表格完整呈现（保留所有数值）
- 保留回答中的关键事实：模型规格、准确率、日期、arXiv 号、框架名称等

## 来源
- 回答中引用的 [[wiki 页面]]
```

## 内容要求

1. **忠于回答**：只整理回答中已有的内容，不编造回答之外的信息（日期、作者、arXiv 号等）。
2. **结构化**：不要直接复制回答原文，按 wiki 页面规范重新组织标题层级。
3. **保留数据**：回答中的具体数字、对比表格、版本号必须完整保留。
4. **去除对话痕迹**：删掉「提议」「希望对你有帮助」等对话口吻的语句。
5. **使用中文**。
6. **tags**：从现有标签中选 3-8 个最合适的；遇到无法描述的核心主题可提出新标签。
7. **links**：用 [[页面标题]] 格式在 YAML `links` 字段中引用回答中提到的已有 wiki 页面。
8. **sources**：填写回答中引用过的 wiki 页面 slug，格式为 wiki/slug；若无明确引用则留空。

## YAML frontmatter 格式

---
title: "标题"
type: synthesis | concept
tags: [标签1, 标签2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: ["wiki/页面slug"]
links: [[相关页面1]], [[相关页面2]]
summary: "一句话摘要"
---

输出必须是纯 markdown（1 个页面），不要包含其他说明文字。"""


def build_chat_ingest_messages(question: str, answer: str, existing_tags: list, suggested_title: str = "", lang: str = "zh") -> list:
    title_hint = f"\n\n建议页面标题（来自对话中的提议，可选用或优化）：{suggested_title}" if suggested_title else ""
    system = CHAT_INGEST_SYSTEM
    if lang == "en":
        system = system.replace("5. **使用中文**。", "5. **使用英文**。") + lang_instruction(lang)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"现有标签：{', '.join(existing_tags)}{title_hint}\n\n用户问题：{question}\n\nAI 回答：\n\n{answer[:30000]}"},
    ]
