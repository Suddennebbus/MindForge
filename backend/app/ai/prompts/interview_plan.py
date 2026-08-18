from app.ai.lang import lang_instruction


def build_interview_messages(
    direction: str,
    exploration_result: dict = None,
    recommendation: dict = None,
    lang: str = "zh",
) -> list:
    system = """你是一个资深研究顾问。请根据用户提供的研究背景信息，以专业采访者的身份提出3-5个关键的澄清问题，帮助用户明确研究目标、范围、方法和预期产出。

你需要输出一个 JSON 对象，格式如下：
{
  "questions": [
    {
      "id": "q1",
      "question": "具体问题内容",
      "type": "choice",
      "choices": ["选项A", "选项B", "选项C"],
      "allow_other": true,
      "placeholder": "其他补充说明（可选）"
    },
    {
      "id": "q2",
      "question": "具体问题内容",
      "type": "text",
      "placeholder": "给用户的填写提示"
    }
  ]
}

要求：
1. 问题要具体、有针对性，避免泛泛而谈
2. 必须覆盖：研究目标、研究范围、预期产出形式
3. **第一个问题必须是产出类型选择**：让用户明确选择希望生成什么类型的文档。选项应包括：学术研究计划、技术调研规划、技术实现方案、文献综述报告。id 固定为 "output_type"
4. 可选覆盖：是否需要参考现有wiki知识、时间约束、深度vs广度偏好、是否需要综述还是行动计划
5. **尽量使用选择题（type: "choice"）**：为每个问题提供 3-5 个具体选项，允许用户选择最符合的，同时提供文字补充
6. 当问题确实需要自由发挥时，才使用文本输入（type: "text"）
6. allow_other 表示是否允许用户选择"其他"并手动输入
7. placeholder 用于文字补充框的提示
8. 只输出JSON，不要其他内容

**重要：以下是标准输出示例，请严格遵循此格式：**
{
  "questions": [
    {
      "id": "q1",
      "question": "你期望这项研究最终产出什么形式的内容？",
      "type": "choice",
      "choices": ["结构化研究计划", "文献综述报告", "可执行的行动清单", "概念框架图"],
      "allow_other": true,
      "placeholder": "其他产出形式..."
    },
    {
      "id": "q2",
      "question": "你希望研究覆盖的范围是？",
      "type": "choice",
      "choices": ["深入单一技术方向", "对比多个相关方向", "全面概述整个领域"],
      "allow_other": true,
      "placeholder": "请补充说明..."
    }
  ]
}"""

    context_parts = [f"我的研究方向是：{direction}"]

    if exploration_result:
        areas = exploration_result.get("knowledge_areas", [])
        gaps = exploration_result.get("gaps", [])
        recs = exploration_result.get("recommendations", [])
        context_parts.append(f"\n探索分析结果：")
        context_parts.append(f"- 知识覆盖：{len(areas)} 个领域")
        context_parts.append(f"- 知识缺口：{len(gaps)} 个")
        context_parts.append(f"- 研究建议：{len(recs)} 条")
        if gaps:
            context_parts.append("主要缺口：" + "；".join(
                f"{g['area']}（{g.get('priority', 'medium')}）" for g in gaps[:3]
            ))

    if recommendation:
        context_parts.append(f"\n我选中的具体建议：")
        context_parts.append(f"- 行动：{recommendation.get('action', '')}")
        context_parts.append(f"- 理由：{recommendation.get('rationale', '')}")
        if recommendation.get('resources'):
            context_parts.append(f"- 参考资源：{', '.join(recommendation['resources'])}")

    context_parts.append("\n请基于以上背景向我提出澄清问题，帮助我细化这个研究计划。优先使用选择题形式。")

    user = "\n".join(context_parts)

    return [
        {"role": "system", "content": system + lang_instruction(lang)},
        {"role": "user", "content": user},
    ]


def _format_answers(answers: dict) -> str:
    def fmt(k, v):
        if isinstance(v, dict):
            parts = []
            if v.get("choice"):
                parts.append(f"选择：{v['choice']}")
            if v.get("text"):
                parts.append(f"补充：{v['text']}")
            return f"{k}: {'；'.join(parts)}"
        return f"{k}: {v}"
    return "\n".join(fmt(k, v) for k, v in answers.items())


def _format_exploration_context(exploration_result: dict, recommendation: dict) -> str:
    context_parts = []
    if exploration_result:
        areas = exploration_result.get("knowledge_areas", [])
        gaps = exploration_result.get("gaps", [])
        recs = exploration_result.get("recommendations", [])
        context_parts.append(f"探索分析结果：")
        context_parts.append(f"- 知识覆盖：{len(areas)} 个领域")
        context_parts.append(f"- 知识缺口：{len(gaps)} 个")
        context_parts.append(f"- 研究建议：{len(recs)} 条")
        if gaps:
            context_parts.append("主要缺口：" + "；".join(
                f"{g['area']}（{g.get('priority', 'medium')}）" for g in gaps[:3]
            ))
    if recommendation:
        context_parts.append(f"\n用户选中的具体建议：")
        context_parts.append(f"- 行动：{recommendation.get('action', '')}")
        context_parts.append(f"- 理由：{recommendation.get('rationale', '')}")
    return "\n".join(context_parts)


def _format_web_results(web_results: list[dict]) -> str:
    return "\n\n".join(
        f"[{i+1}] {r['title']}\n{r.get('href', '')}\n{r.get('body', '')[:600]}"
        for i, r in enumerate(web_results)
    )


def _format_arxiv_results(arxiv_results: list[dict]) -> str:
    return "\n\n".join(
        f"[arXiv {i+1}] {r['title']}\nAuthors: {r.get('authors', '')}\n{r.get('href', '')}\n{r.get('body', '')[:800]}"
        for i, r in enumerate(arxiv_results)
    )


def build_search_query_expansion_messages(
    direction: str,
    answers: dict,
    exploration_result: dict = None,
    recommendation: dict = None,
    lang: str = "zh",
) -> list:
    """Generate diverse search queries to collect richer external material."""

    system = """你是一位资深研究检索专家。你的任务是根据研究方向，生成一组**多样化、具体、有针对性的搜索查询**，用于后续的网络搜索和 arXiv 学术搜索。

你需要覆盖该方向的多个侧面：
- 主流方法与技术路线
- 关键问题与挑战
- 代表系统、论文或基准
- 评测指标与数据集
- 风险、缺陷或争议
- 应用场景与产业实践
- 最新进展或前沿方向

输出要求：
- 只输出一个 JSON 对象，不要任何其他内容
- 对象包含两个数组字段：
  - "web_queries"：6-10 个多样化查询，用于网页搜索，中英均可
  - "arxiv_queries"：3-5 个**纯英文学术查询**，用于 arXiv 论文检索（arXiv 是英文语料库，中文查询必然零结果）；使用规范学术术语（如 guardrails / jailbreak / watermarking），不要句子，只要关键词组合
- 每个查询应独立、可搜索，避免过于宽泛

示例输出：
{
  "web_queries": [
    "long context LLM safety guardrails survey 2024",
    "大模型 长上下文 安全护栏 评测",
    "AgentSafe SAFEHARNESS AGENTWARD comparison"
  ],
  "arxiv_queries": [
    "long context LLM safety guardrails",
    "jailbreak attacks large language models",
    "memory attack retrieval augmented generation"
  ]
}"""

    context_parts = [f"# 研究方向\n{direction}\n"]

    if exploration_result:
        areas = exploration_result.get("knowledge_areas", [])
        gaps = exploration_result.get("gaps", [])
        recs = exploration_result.get("recommendations", [])
        context_parts.append("# 探索分析上下文")
        context_parts.append(f"- 知识覆盖：{len(areas)} 个领域")
        context_parts.append(f"- 知识缺口：{len(gaps)} 个")
        context_parts.append(f"- 研究建议：{len(recs)} 条")
        if gaps:
            context_parts.append("主要缺口：" + "；".join(
                f"{g['area']}（{g.get('priority', 'medium')}）" for g in gaps[:3]
            ))
        context_parts.append("")

    if recommendation:
        context_parts.append("# 用户选中的具体建议")
        context_parts.append(f"- 行动：{recommendation.get('action', '')}")
        context_parts.append(f"- 理由：{recommendation.get('rationale', '')}")
        if recommendation.get('resources'):
            context_parts.append(f"- 参考资源：{', '.join(recommendation['resources'])}")
        context_parts.append("")

    if answers:
        context_parts.append("# AI 访谈回答")
        for k, v in answers.items():
            if isinstance(v, dict):
                parts = []
                if v.get("choice"):
                    parts.append(f"选择：{v['choice']}")
                if v.get("text"):
                    parts.append(f"补充：{v['text']}")
                context_parts.append(f"{k}: {'；'.join(parts)}")
            else:
                context_parts.append(f"{k}: {v}")
        context_parts.append("")

    context_parts.append("请生成搜索查询 JSON 对象。")
    user = "\n".join(context_parts)

    return [
        {"role": "system", "content": system + lang_instruction(lang)},
        {"role": "user", "content": user},
    ]


def build_academic_query_messages(direction: str, title: str, description: str = "") -> list:
    """为存量计划生成英文学术检索查询（arXiv 是英文语料库，中文查询必然零结果）。"""
    system = """你是学术检索专家。根据研究计划信息，生成 2-3 个**纯英文** arXiv 检索查询。

要求：
- 只输出一个 JSON 数组，不要任何其他内容
- 每个查询是学术关键词组合（非句子），使用规范英文术语
- 覆盖该方向的核心方法、攻击面/问题、评测等侧面

示例输出：
["LLM safety guardrails long context", "prompt injection defense agents"]"""

    user = f"研究方向：{direction}\n计划标题：{title}"
    if description:
        user += f"\n计划简介：{description[:300]}"

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_plan_critique_messages(
    direction: str,
    plan_json_text: str,
    research_analysis: str,
    output_type: str = "plan",
    lang: str = "zh",
) -> list:
    """Critique a generated plan against the research analysis and quality rubric."""

    ot = (output_type or "plan").strip().lower()
    if "survey" in ot or "调研" in ot:
        type_label = "技术调研规划"
    elif "proposal" in ot or "方案" in ot:
        type_label = "技术实现方案"
    elif "literature" in ot or "综述" in ot:
        type_label = "文献综述报告"
    else:
        type_label = "学术研究计划"

    system = f"""你是一位严格的研究计划评审专家。你的任务是基于首席科学家的深度调研报告，评审一份{type_label}，找出它的不足并给出具体改进建议。

评审维度（每项 0-5 分）：
1. **领域覆盖度**：是否梳理了主流方法、代表工作、关键概念
2. **批判性分析**：是否有明确的方法优劣判断、被高估/低估方向、根本分歧
3. **缺口识别**：是否找到 2-3 个具体、有价值的研究机会
4. **研究问题质量**：核心问题是否具体、有边界、可验证
5. **方法路径**：是否给出 2-3 条可选路径及明确推荐
6. **可执行性**：里程碑、目标、交付物是否具体可落地
7. **来源多样性**：是否综合了多源信息，而非仅复述访谈
8. **结构与表达**：结构是否清晰、专业术语是否准确

输出格式（只输出 JSON）：
{{
  "score": 0-100,
  "dimensions": {{
    "coverage": 0-5,
    "critical_analysis": 0-5,
    "gap_identification": 0-5,
    "research_questions": 0-5,
    "methodology_path": 0-5,
    "actionability": 0-5,
    "source_diversity": 0-5,
    "structure": 0-5
  }},
  "strengths": ["..."],
  "weaknesses": ["..."],
  "concrete_suggestions": ["..."]
}}

要求：
- 评审要苛刻、具体，不要泛泛夸
- 每条建议都要 actionable，能直接用于修改计划
- 只输出 JSON，不要其他内容"""

    user = f"""# 研究方向
{direction}

# 首席科学家的深度调研报告
{research_analysis}

# 待评审的{type_label}（JSON）
{plan_json_text}

请严格评审这份{type_label}，输出 JSON 格式的评审结果。"""

    return [
        {"role": "system", "content": system + lang_instruction(lang)},
        {"role": "user", "content": user},
    ]


def build_plan_revision_messages(
    direction: str,
    plan_json_text: str,
    critique_json_text: str,
    research_analysis: str,
    output_type: str = "plan",
    lang: str = "zh",
) -> list:
    """Revise a plan based on critique feedback."""

    ot = (output_type or "plan").strip().lower()
    if "survey" in ot or "调研" in ot:
        doc_type = "technical_survey"
        type_label = "技术调研规划"
        title_prefix = "调研规划"
    elif "proposal" in ot or "方案" in ot:
        doc_type = "technical_proposal"
        type_label = "技术实现方案"
        title_prefix = "技术方案"
    elif "literature" in ot or "综述" in ot:
        doc_type = "literature_review"
        type_label = "文献综述报告"
        title_prefix = "文献综述"
    else:
        doc_type = "academic_plan"
        type_label = "学术研究计划"
        title_prefix = "研究计划"

    system = f"""你是一位资深研究规划专家。你收到一份{type_label}和一位严格评审专家的反馈意见。请基于反馈意见，对计划进行**深度修订**，输出改进后的最终 JSON。

修订原则：
- 保留原计划的优点
- 针对每条批评和建议进行实质性修改，不要只调整措辞
- 补充缺失的内容：方法对比、具体研究问题、可执行里程碑、风险分析等
- 增强批判性：明确哪些方法真正有前景，哪些是炒作
- 保持结构清晰、专业术语准确

输出格式（只输出 JSON）：
{{
  "title": "{title_prefix}：...（不超过50字）",
  "description": "...",
  "direction": "研究方向标签",
  "research_questions": ["..."],
  "methodology": "...",
  "goals": ["[ ] ..."],
  "milestones": ["..."],
  "key_challenges": ["..."],
  "expected_contributions": ["..."],
  "related_slugs": ["..."],
  "output_type": "{doc_type}"
}}

要求：
- 所有内容必须基于首席科学家的调研报告
- description 必须是独立的{type_label}文档，可独立阅读
- 只输出 JSON，不要其他内容
- output_type 必须设置为 "{doc_type}"
"""

    user = f"""# 研究方向
{direction}

# 首席科学家的深度调研报告
{research_analysis}

# 待修订的{type_label}（JSON）
{plan_json_text}

# 评审意见（JSON）
{critique_json_text}

请基于评审意见，输出修订后的最终{type_label} JSON。"""

    return [
        {"role": "system", "content": system + lang_instruction(lang)},
        {"role": "user", "content": user},
    ]


def build_research_analysis_messages(
    direction: str,
    answers: dict,
    wiki_content: str,
    web_results: list[dict],
    arxiv_results: list[dict],
    exploration_result: dict = None,
    recommendation: dict = None,
    lang: str = "zh",
) -> list:
    """Phase 1: Deep research analysis. Produces an analytical report, not a plan."""

    answers_text = _format_answers(answers)
    exploration_context = _format_exploration_context(exploration_result, recommendation)
    web_summaries = _format_web_results(web_results)
    arxiv_summaries = _format_arxiv_results(arxiv_results)

    system = """你是一位顶尖研究机构的资深首席科学家，拥有跨学术界和产业界的深厚经验。你的任务是对一个研究方向进行**独立的深度调研分析**，产出一份将被另一位研究规划专家直接使用的高质量调研报告。

## 你的核心职责

你接收到的素材包括：用户访谈回答、网络搜索结果、学术论文摘要、现有知识库内容。**这些素材是原始输入，你的输出必须是对这些素材的超越**——不是整理，而是分析、判断、提炼。

另一位研究员（规划专家）将**只看到你这份报告**，看不到任何原始素材。因此你的报告必须：
- 包含足够的深度和细节，让规划专家能独立制定研究计划
- 体现你自己的专业判断，不是素材的搬运工
- 明确指出哪些结论是可靠的、哪些需要进一步验证

## 分析框架（必须遵循）

### 一、领域概览与核心概念
- 定义该领域的边界，区分核心概念和边缘概念
- 梳理主要技术路线或理论流派，给出你的分类框架

### 二、文献综述与现状分析（核心章节，不少于1500字）
基于搜索素材和论文，完成真正的文献综述：

**2.1 主流方法与代表性成果**
- 当前学术界最关注的方法是什么？
- 有哪些里程碑式的论文或系统？（基于arXiv和搜索结果具体指出）
- 这些方法解决了什么问题？又带来了什么新问题？

**2.2 关键洞察与批判性判断**
- **哪些方法被过度炒作？为什么？**
- **哪些方向被低估但值得投入？**
- **不同技术路线之间的根本分歧是什么？**
- 产业界和学术界的关注点有何差异？

**2.3 技术成熟度评估**
- 对关键技术给出TRL（技术成熟度）判断
- 指出从实验室到实际应用的关键鸿沟

### 三、研究空白与机会识别（核心章节，不少于800字）
- 当前尚未解决的核心问题是什么？按优先级排序
- 存在哪些技术瓶颈？瓶颈的根本原因是什么？
- 用户访谈中提到的需求，与现有研究能力之间存在什么系统性差距？
- **明确给出2-3个最具价值的研究机会，并说明为什么**（不是泛泛而谈，要有具体论证）

### 四、方法路径评估（不少于800字）
- 针对该方向，给出2-3条可能的研究路径
- 对每条路径进行SWOT分析（优势、劣势、机会、威胁）
- **明确推荐一条主路径和一条备选路径，给出充分的理由**
- 分析容易被忽视的风险和边缘案例

### 五、核心研究问题（不少于500字）
提炼3-5个核心研究问题。每个问题必须包含：
- 问题陈述（具体、明确）
- 为什么这个问题重要？
- 当前研究进展到什么阶段？
- 解决这个问题的关键挑战是什么？
- 建议采用什么方法？

## 绝对禁止的行为

以下输出会被视为不合格：
- ❌ 简单罗列搜索结果的标题和摘要
- ❌ 复述用户的访谈回答
- ❌ 使用"研究表明..."但没有指出具体是哪项研究
- ❌ 给出泛泛而谈的结论，如"这个领域很有前景"
- ❌ 回避批判性判断，只做中性描述

## 输出要求
- 这是一份内部专家报告，不是面向普通读者的科普文章
- 使用专业术语，保持学术严谨性
- 充分展开分析，总字数不少于5000字
- 使用Markdown格式，结构清晰
- 不要输出JSON"""

    user_parts = [f"# 研究方向\n{direction}\n"]
    if exploration_context:
        user_parts.append(f"# 探索分析上下文\n{exploration_context}\n")
    user_parts.append(f"# AI访谈回答（原始素材）\n{answers_text}\n")
    user_parts.append(f"# 现有知识库内容\n{wiki_content[:6000]}\n")
    if web_summaries:
        user_parts.append(f"# 网络搜索结果\n{web_summaries}\n")
    if arxiv_summaries:
        user_parts.append(f"# arXiv学术论文\n{arxiv_summaries}\n")
    user_parts.append("""请撰写深度调研分析报告。

重要提醒：
1. 阅读上述素材后，先进行独立思考，再撰写报告
2. 你的报告将被另一位研究员直接用于制定研究计划——他看不到这些原始素材
3. 所以报告必须包含足够的深度、细节和独立判断
4. 不要复述访谈内容，要进行超越素材的分析""")

    user = "\n".join(user_parts)

    return [
        {"role": "system", "content": system + lang_instruction(lang)},
        {"role": "user", "content": user},
    ]


def build_create_plan_messages(
    direction: str,
    wiki_content: str,
    research_analysis: str,
    output_type: str = "plan",
    exploration_result: dict = None,
    recommendation: dict = None,
    lang: str = "zh",
) -> list:
    """Phase 2: Generate structured plan/document based solely on the research analysis.

    CRITICAL: This function does NOT receive raw interview answers, web results,
    or arxiv results. The output must be derived entirely from the research_analysis report.
    """

    exploration_context = _format_exploration_context(exploration_result, recommendation)

    # Normalize output_type
    ot = (output_type or "plan").strip().lower()
    if "survey" in ot or "调研" in ot:
        doc_type = "technical_survey"
        type_label = "技术调研规划"
        title_prefix = "调研规划"
    elif "proposal" in ot or "方案" in ot:
        doc_type = "technical_proposal"
        type_label = "技术实现方案"
        title_prefix = "技术方案"
    elif "literature" in ot or "综述" in ot:
        doc_type = "literature_review"
        type_label = "文献综述报告"
        title_prefix = "文献综述"
    else:
        doc_type = "academic_plan"
        type_label = "学术研究计划"
        title_prefix = "研究计划"

    if doc_type == "technical_survey":
        type_guidance = """你正在制定一份**技术调研规划**。这不是学术性的"研究计划"，而是面向工程团队或决策者的技术方向调研文档。

输出要求：
- title: 使用"调研规划：{主题}"或"{主题} 技术调研"格式，不超过50字
- description: 技术调研报告（3000-5000字，Markdown），必须包含：
  ## 1. 调研背景与目标（为什么要做这个调研？要解决什么工程/产品问题？）
  ## 2. 技术现状与主流方案（基于调研报告，对比不同技术路线的优缺点、适用场景）
  ## 3. 关键技术问题（列出3-5个需要回答的技术问题，不是学术问题，是工程问题）
  ## 4. 方案对比与推荐（给出2-3个候选方案，明确推荐哪一个及理由）
  ## 5. 技术风险与依赖（风险、外部依赖、前置条件）
  ## 6. 调研结论与下一步行动（清晰的结论和可执行的后续步骤）
- research_questions: 工程技术问题，具体可验证
- methodology: 调研方法（benchmark对比、POC验证、专家访谈等）
- goals: 调研目标，使用 `[ ]` 前缀
- milestones: 调研阶段划分
- key_challenges: 技术落地挑战
- expected_contributions: 调研交付物（如：选型建议、POC报告、评估指标等）"""
    elif doc_type == "technical_proposal":
        type_guidance = """你正在制定一份**技术实现方案**。这是面向工程师的落地文档，需要明确"做什么、怎么做、用什么做"。

输出要求：
- title: 使用"{主题} 技术方案"格式，可包含"调研规划："前缀，不超过50字
- description: 技术方案文档（3000-5000字，Markdown），必须包含：
  ## 1. 背景与目标（业务/技术背景、要解决的问题、目标范围）
  ## 2. 需求分析（功能需求、非功能需求、约束条件）
  ## 3. 总体架构设计（系统架构图/模块划分、数据流、接口设计思路）
  ## 4. 关键技术选型（对比后给出明确选型，说明理由）
  ## 5. 详细设计方案（核心模块设计、算法/策略、异常处理）
  ## 6. 实施计划与里程碑（阶段划分、时间节点、交付物）
  ## 7. 风险与应对（技术风险、数据风险、运维风险）
- research_questions: 实现过程中需要解决的关键技术问题
- methodology: 实现方法（开发、验证、迭代策略）
- goals: 实现目标，使用 `[ ]` 前缀
- milestones: 开发/实施里程碑
- key_challenges: 实现难点
- expected_contributions: 交付产物（系统、模块、指标、文档）"""
    elif doc_type == "literature_review":
        type_guidance = """你正在制定一份**文献综述报告**。重点是对领域现有研究进行系统性梳理和评述。

输出要求：
- title: 使用"文献综述：{主题}"格式，不超过50字
- description: 文献综述（3000-5000字，Markdown），必须包含：
  ## 1. 研究背景与意义
  ## 2. 文献检索策略与来源
  ## 3. 研究现状分类与评述（按方法/场景/时间线分类，批判性评述）
  ## 4. 主要研究发现与共识
  ## 5. 研究空白与未来方向
  ## 6. 结论
- research_questions: 综述试图回答的核心问题
- methodology: 综述方法（检索策略、筛选标准、分析框架）
- goals: 综述目标
- milestones: 综述撰写阶段
- key_challenges: 综述难点（文献冲突、数据不足等）
- expected_contributions: 综述贡献（领域地图、研究空白识别）"""
    else:
        type_guidance = """你正在制定一份**学术研究计划**。这是面向研究者或学术评审的正式文档，强调研究问题、方法论和学术贡献。

输出要求：
- title: 使用"研究计划：{主题}"或直接用主题名，不超过50字
- description: 研究综述（3000-5000字，Markdown），必须包含：
  ## 1. 研究背景与意义
  ## 2. 文献综述与现状分析（批判性，不是中立描述）
  ## 3. 核心研究问题（3-5个，有深度、有边界）
  ## 4. 研究方法与创新点
  ## 5. 预期贡献（理论/方法/实践）
  ## 6. 实施路径与里程碑
  ## 7. 风险与对策
- research_questions: 学术研究问题
- methodology: 研究方法（理论分析、实验、系统构建等）
- goals: 研究目标，使用 `[ ]` 前缀
- milestones: 研究阶段
- key_challenges: 研究难点
- expected_contributions: 学术贡献"""

    system = f"""你是一位资深研究规划专家。你的唯一任务是根据**首席科学家撰写的深度调研报告**，制定一份结构化的{type_label}。

## 极其重要的约束

**你没有看到任何原始素材**——没有访谈记录、没有搜索网页、没有论文全文。你只有首席科学家提供的一份调研报告。

这意味着：
1. 你的{type_label}必须**完全基于调研报告**中的分析结论和洞察
2. 你**不能引用任何原始素材**（因为你没有看到过）
3. 你的工作是"翻译"——把分析报告中的学术判断转化为可执行的{type_label}
4. 如果调研报告中有你不理解的地方，基于你的专业知识进行合理推断，不要编造

## 文档类型说明

{type_guidance}

## 通用输出格式

只输出一个 JSON 对象，所有字段都必须提供：

{{
  "title": "{title_prefix}：...（不超过50字）",
  "description": "...",
  "direction": "研究方向标签",
  "research_questions": ["..."],
  "methodology": "...",
  "goals": ["[ ] ..."],
  "milestones": ["..."],
  "key_challenges": ["..."],
  "expected_contributions": ["..."],
  "related_slugs": ["..."],
  "output_type": "{doc_type}"
}}

## 质量标准（违反任何一条都是不合格）

- ❌ **绝对禁止复述访谈内容**——你没有看到过访谈
- ❌ **绝对禁止简单罗列搜索结果**——你没有看到过原始搜索结果
- ❌ **description 必须是独立的{type_label}文档**，可以独立阅读，不依赖任何外部上下文
- ✅ 所有内容必须能从调研报告中找到依据，或基于调研报告进行合理推导
- ✅ 批判性判断：哪些方法真正有前景？哪些是炒作？瓶颈在哪里？
- ✅ 具体可操作：方法、指标、资源、时间节点都要具体
- ✅ 只输出JSON，不要任何其他内容
- ✅ output_type 必须设置为 "{doc_type}"
"""

    user_parts = [f"# 文档类型\n{type_label}\n", f"# 研究方向\n{direction}\n"]
    if exploration_context:
        user_parts.append(f"# 探索分析上下文\n{exploration_context}\n")
    user_parts.append(f"# 首席科学家的深度调研报告（这是你唯一的素材来源）\n\n{research_analysis}\n\n")
    user_parts.append(f"# 现有知识库内容（仅用于选择 related_slugs）\n{wiki_content[:2000]}\n")
    user_parts.append(f"""请基于首席科学家的调研报告，制定一份{type_label}。

再次提醒：
- 你没有看到过任何访谈记录
- 你没有看到过任何搜索网页或论文全文
- 你的所有判断必须来自调研报告，或基于报告进行合理推导
- 输出必须是{type_label}，不是素材总结""")

    user = "\n".join(user_parts)

    return [
        {"role": "system", "content": system + lang_instruction(lang)},
        {"role": "user", "content": user},
    ]
