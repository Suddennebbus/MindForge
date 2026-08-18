/** 英文文案表：key 为中文原文，value 为英文翻译。缺失时回退中文原文。 */
export const en: Record<string, string> = {
  // Nav
  知乎: 'Zhihu',
  文档: 'Docs',
  切换语言: 'Switch language',

  // Hero
  '把散落的论文、报告与经验，': 'Turn scattered papers, reports, and hard-won experience',
  铸造成: 'into ',
  会思考的知识网络: 'a knowledge network that thinks',
  '一款基于 Karpathy LLM-Wiki，会思考、探索、规划、生长的知识铸造平台。':
    "A knowledge-forging platform built on Karpathy's LLM-Wiki idea — one that thinks, explores, plans, and grows.",
  '面向个人研究者、内容创作者、科研团队、技术团队。':
    'For individual researchers, content creators, research groups, and engineering teams.',
  '本地部署，数据不出域，隐私安全。': 'Self-hosted. Your data never leaves your server. Private by design.',
  快速开始: 'Quick Start',
  适合谁用: "Who It's For",
  核心能力: 'Core Features',
  'MindForge 工作台': 'MindForge dashboard',

  // PainPoints
  传统知识库之痛: 'The Pain of Traditional Knowledge Bases',
  '当信息不再稀缺，真正稀缺的是洞察力、方向感，以及把信息转化为行动的能力。':
    "When information is no longer scarce, what's scarce is insight, direction, and the ability to turn information into action.",
  知识沉寂: 'Knowledge Goes Silent',
  '文档越堆越多，检索靠关键词，找得到却读不完，读完也难提炼出结论。':
    'Documents pile up. Keyword search finds them, but you can never read them all — let alone distill conclusions.',
  '有信息，没洞察': 'Information, but No Insight',
  '积累上百份资料，却回答不了"研究到什么程度了？还缺什么？下一步做什么？"。':
    'Hundreds of sources collected, yet no answer to "How far has this research come? What\'s missing? What\'s next?"',
  '各自为战，重复劳动': 'Siloed Work, Duplicated Effort',
  '立项、调研、写方案从零手搓，团队之间不知道别人已经做过什么。':
    'Proposals, surveys, and plans written from scratch — teammates have no idea what others have already done.',
  知识质量无人把关: 'No One Guards Knowledge Quality',
  '低质信息污染知识库；规模扩大后必然出现概念冲突、信息缺口、孤立页面。':
    'Low-quality content pollutes the Wiki; at scale, concept conflicts, information gaps, and orphan pages are inevitable.',

  // Workflow
  '一条闭环，让知识持续增值': 'One Loop That Keeps Compounding Knowledge',
  '信息不再只是被「存起来」，而是被结构化、链接化、可对话化，随使用越用越聪明。':
    "Information isn't just stored — it's structured, linked, and conversational, getting smarter with every use.",
  探索方向: 'Explore',
  生成计划: 'Plan',
  收集资料: 'Collect',
  人审核: 'Review',
  'AI 摄入': 'Ingest',
  '形成 Wiki': 'Build Wiki',
  再探索: 'Explore Again',

  // Features
  '八大亮点，一条知识闭环': 'Eight Pillars, One Knowledge Loop',
  '从知识铸造到隐私安全，MindForge 用「探索、计划、摄入、对话、再探索」的闭环把它们串成一个会生长的研究系统。点击任意能力，直达详情。':
    'From knowledge forging to privacy, MindForge ties everything into a growing research system through a loop of Explore, Plan, Ingest, Chat, and re-Explore. Click any capability to jump to the details.',
  知识铸造: 'Knowledge Forging',
  '一份资料，铸成多个结构化知识页': 'One document, forged into many structured knowledge pages',
  'AI 通过「先规划、人确认」的两阶段摄入，把一份 PDF、Word 或 Markdown 拆分为实体页、概念页、综合页。作者、arXiv、DOI 等元数据从 PDF 真实提取注入，杜绝模型编造引用。入库即完整，拒绝压缩式摘要。':
    'Through a two-phase "AI plans, human confirms" Ingest, AI splits a PDF, Word, or Markdown file into entity pages, concept pages, and synthesis pages. Metadata such as authors, arXiv IDs, and DOIs is extracted from the actual PDF — no hallucinated citations. Complete on ingest, never a lossy summary.',
  '实体页：论文、模型、工具等具体对象': 'Entity pages: papers, models, tools, and other concrete objects',
  '概念页：方法、理论、技术路线': 'Concept pages: methods, theories, technical approaches',
  '综合页：跨资料整合对比，保留完整数据表': 'Synthesis pages: cross-source comparisons with full data tables preserved',
  知识图谱: 'Knowledge Graph',
  '双向链接互联，知识网络一目了然': 'Bidirectional links make the knowledge network visible at a glance',
  '页面间通过 [[slug]] 双向链接互联，形成可导航、可溯源的知识网络。图谱视图支持缩放、悬停高亮关联节点、关键词筛选，单页可聚焦查看某个知识节点的全部关联。关联查询纯本地计算，秒开。':
    'Pages interconnect via [[slug]] bidirectional links, forming a navigable, traceable knowledge network. The graph view supports zooming, hover-highlighting related nodes, and keyword filtering; each page can focus on the full neighborhood of a node. All graph queries run locally — instant.',
  '悬停高亮关联节点，节点可筛选': 'Hover to highlight related nodes; filter by keyword',
  '单页图谱视角，聚焦全部关联': 'Per-page graph view focused on every connection',
  '纯本地计算，零 LLM 调用': 'Fully local computation, zero LLM calls',
  研究指导: 'Research Guidance',
  '引导式访谈，生成可执行的研究计划': 'Guided interviews that produce executable Research Plans',
  'AI 通过选择题式访谈澄清你的真实需求，再结合知识库上下文与网络、学术调研，输出包含目标、方法、里程碑、风险、研究问题、预期贡献的完整研究计划。聚焦高价值方向，不做无用功。':
    'AI clarifies your real needs through a multiple-choice interview, then combines Wiki context with web and academic research to output a complete Research Plan covering goals, methods, milestones, risks, research questions, and expected contributions. Focus on high-value directions — no wasted effort.',
  '引导式访谈，澄清真实需求': 'Guided interview that clarifies real needs',
  建议阅读清单一键下载到待入库: 'One-click download of suggested reading into the Ingest queue',
  '计划状态全程流转，团队可批注': 'Full lifecycle plan states, with team annotations',
  知识缺口探索: 'Knowledge Gap Explore',
  '发现缺口，给出下一步方向': 'Discover gaps and get your next direction',
  '输入一个模糊方向，AI 基于全库做全局分析，输出三栏结果：已有知识覆盖盘点、按优先级排序的知识缺口、可执行的研究建议。有价值的建议可一键生成研究计划，探索历史自动保存，随时回溯。':
    'Give it a fuzzy direction and AI analyzes your entire Wiki, returning a three-column result: existing coverage, knowledge gaps ranked by priority, and actionable research suggestions. Valuable suggestions become Research Plans in one click; Explore history is saved for anytime review.',
  '三栏输出：覆盖 / 缺口 / 建议': 'Three columns: coverage / gaps / suggestions',
  缺口按优先级排序: 'Gaps ranked by priority',
  一键转为研究计划: 'One-click conversion into a Research Plan',
  专家问答: 'Expert Q&A',
  '基于知识库作答，好答案一键沉淀': 'Answers grounded in your Wiki; great answers saved in one click',
  'AI 只基于库内知识作答，流式输出、Markdown 渲染、来源标注可点击溯源，可信可查。有价值的问答支持一键生成综合页面，自动完成摄入流程，好答案反哺知识库，越用越聪明。':
    'AI answers strictly from your Wiki, with streaming output, Markdown rendering, and clickable source citations — trustworthy and verifiable. Valuable answers can be distilled into synthesis pages in one click, completing the Ingest flow automatically. Good answers feed back into the Wiki, so it gets smarter with use.',
  '只基于库内知识，答案可溯源': 'Answers only from your Wiki, fully traceable',
  好答案一键沉淀为综合页: 'Great answers distilled into synthesis pages in one click',
  越用越聪明的正向飞轮: 'A positive flywheel that gets smarter with use',
  知识体检: 'Knowledge Health Check',
  '一键修复，知识库越用越健康': 'One-click fixes keep your Wiki healthy as it grows',
  '知识库规模扩大后必然出现结构腐化。内置体检机制检测概念冲突、缺失反向链接、缺失概念、信息缺口、孤立页面等；可自动修复项一键批量处理，需判断的由 AI 生成建议。健康度量化评分，在首页实时可见。':
    'Structural decay is inevitable as a Wiki scales. The built-in Health Check detects concept conflicts, missing backlinks, missing concepts, information gaps, orphan pages, and more. Auto-fixable issues are handled in one batch click; judgment calls get AI-generated suggestions. A quantified health score is visible on the home page in real time.',
  '检测冲突、断链、缺口、孤立页': 'Detects conflicts, broken links, gaps, and orphan pages',
  可修复项一键批量处理: 'Auto-fixable issues resolved in one batch',
  '健康度量化，可监控可自愈': 'Quantified health — monitorable and self-healing',
  团队协作: 'Team Collaboration',
  '计划、文献，处处可批注回复': 'Annotate and reply anywhere — plans, papers, and more',
  '研究计划、待入库资料、已入库文献、人类产出均支持评论与正文批注，团队围绕知识资产直接讨论。团队自产的研究报告、方案、复盘走「人类产出」专区，与 AI 生成内容统一沉淀路径。':
    'Research Plans, the Ingest queue, ingested papers, and Human Outputs all support comments and inline annotations, so teams discuss right where knowledge lives. Team-authored reports, proposals, and retrospectives go to the Human Outputs section, sharing one unified path with AI-generated content.',
  '计划、文献均可评论与正文批注': 'Comments and inline annotations on plans and papers',
  人类产出专区统一沉淀: 'Human Outputs section for unified capture',
  '重操作全团队可见，避免冲突': 'Heavy operations visible to the whole team, avoiding conflicts',
  隐私安全: 'Privacy & Security',
  '细粒度权限 + 私有化部署，数据不出域': 'Fine-grained permissions + self-hosting — data never leaves',
  'admin / editor / viewer 三级角色，写操作全程留痕，操作日志支持按动作、操作人、日期审计回溯。单 Docker 镜像 + SQLite，全部数据在一个 volume 里，不出你的服务器。API Key 本地加密存储。':
    'Three roles — admin / editor / viewer — with full audit trails for every write, searchable by action, actor, and date. One Docker image plus SQLite; all data lives in a single volume on your server. API keys are encrypted locally.',
  '三级角色 + 全量审计日志': 'Three roles + full audit logs',
  '私有化部署，数据不出域': 'Self-hosted; data never leaves your domain',
  'API Key 本地加密存储': 'API keys encrypted and stored locally',

  // QuickStart
  一分钟跑起来: 'Up and Running in One Minute',
  '单 Docker 镜像，一条命令部署。全部数据（数据库、文件、密钥）都在一个 volume 里，备份即复制。':
    'A single Docker image, deployed with one command. All data — database, files, keys — lives in one volume; backup is just a copy.',
  首次使用: 'First Run',
  登录并改密: 'Log in and change password',
  '用 admin / admin 登录，首次登录强制修改密码。': 'Log in with admin / admin; a password change is enforced on first login.',
  '配置你的 LLM': 'Configure your LLM',
  '在设置页填自己的 API Key、Base URL、模型名，OpenAI 兼容即可。':
    'Enter your API key, base URL, and model name in Settings — any OpenAI-compatible provider works.',
  上传资料开始铸造: 'Upload and start forging',
  '上传论文或报告到待入库，审核后摄入，AI 自动生成结构化知识页。':
    'Upload papers or reports to the Ingest queue, review, and AI generates structured knowledge pages.',

  // Comparison
  与同类工具的差异: 'How MindForge Differs',
  'MindForge 不是又一个「存文件」的知识库，而是会探索、会规划、会生长的研究助手。':
    "MindForge isn't another file-storing knowledge base — it's a research assistant that explores, plans, and grows.",
  维度: 'Dimension',
  传统知识库: 'Traditional KB',
  '通用 RAG 问答': 'Generic RAG Q&A',
  '笔记型 AI': 'Note-taking AI',
  知识形态: 'Knowledge Form',
  静态文档: 'Static documents',
  向量切片: 'Vector chunks',
  '文档 + AI 润色': 'Docs + AI polish',
  '结构化多页 Wiki 网络': 'Structured multi-page Wiki network',
  信息保真: 'Fidelity',
  '原文堆积，无提炼': 'Raw piles, no distillation',
  '摘要压缩，细节丢失': 'Compressed summaries, details lost',
  依赖人工整理: 'Manual curation',
  入库即完整结构化提取: 'Complete structured extraction on ingest',
  跨文档洞察: 'Cross-doc Insight',
  无: 'None',
  '弱（切片级检索）': 'Weak (chunk-level retrieval)',
  '综合页 + 全局探索分析': 'Synthesis pages + global Explore analysis',
  缺口发现: 'Gap Discovery',
  主动识别知识缺口并生成计划: 'Proactively finds gaps and generates plans',
  知识治理: 'Knowledge Governance',
  人工维护: 'Manual upkeep',
  无治理概念: 'No governance concept',
  '体检 + 一键修复 + 健康度量化': 'Health Check + one-click fixes + quantified health',
  研究规划: 'Research Planning',
  '探索 → 计划 → 执行闭环': 'Explore → Plan → Execute loop',
  可控性: 'Control',
  依厂商而定: 'Vendor-dependent',
  云端绑定: 'Cloud-locked',
  'LLM 可配置，完全私有化': 'Configurable LLM, fully self-hosted',

  // Audience
  个人研究者: 'Individual Researchers',
  '理解文献、找创新点、生成研究计划，写论文、做研究快人一步。':
    'Understand literature, find novel angles, and generate Research Plans — write papers and do research a step ahead.',
  内容创作者: 'Content Creators',
  '管理素材、发现选题、问答生成文章骨架，写作从翻收藏夹变成对话素材库。':
    'Manage materials, discover topics, and generate article outlines via Q&A — writing becomes a conversation with your library, not digging through bookmarks.',
  研究团队: 'Research Teams',
  '文献综述、技术预研、课题规划，把零散资料变成可对话、可探索的知识网络。':
    'Literature reviews, tech scouting, project planning — turn scattered materials into a conversational, explorable knowledge network.',
  技术团队: 'Engineering Teams',
  '沉淀架构方案、技术调研、产品手册、项目复盘，新人快速 onboarding。':
    'Capture architecture decisions, tech research, product manuals, and retrospectives — new hires onboard fast.',

  // Footer
  '面向科研与技术团队的 AI 知识铸造平台。把散落的论文、报告与经验，铸造成会思考的知识网络。':
    'An AI knowledge-forging platform for research and engineering teams. Turn scattered papers, reports, and experience into a knowledge network that thinks.',
  社区: 'Community',
  关注: 'Follow',
  '公众号：sudden的AI日常': "WeChat Official Account: sudden's AI Diary",
  'MindForge 以 BUSL-1.1 许可开源：个人、学习、研究、企业内部自部署免费；每个版本发布四年后转为 GPLv3。':
    'MindForge is open source under BUSL-1.1: free for personal, learning, research, and internal enterprise self-hosting; each release converts to GPLv3 four years after publication.',
  '这是我第一次独立开源一个完整系统，肯定还有很多不足，欢迎 Star、Issue 与 PR，一起把它变得更好。':
    "This is my first time independently open-sourcing a complete system — there's surely room to improve. Stars, issues, and PRs are all welcome. Let's make it better together.",
}
