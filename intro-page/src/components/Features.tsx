import {
  Hammer,
  Network,
  Compass,
  Telescope,
  MessageSquare,
  Stethoscope,
  Users,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Reveal } from './Reveal'
import { useT, useShot } from '../i18n'

interface Feature {
  id: string
  num: string
  title: string
  icon: LucideIcon
  brief: string
  detail: string
  points: string[]
  image?: string
}

const features: Feature[] = [
  {
    id: 'forge',
    num: 'I',
    title: '知识铸造',
    icon: Hammer,
    brief: '一份资料，铸成多个结构化知识页',
    detail:
      'AI 通过「先规划、人确认」的两阶段摄入，把一份 PDF、Word 或 Markdown 拆分为实体页、概念页、综合页。作者、arXiv、DOI 等元数据从 PDF 真实提取注入，杜绝模型编造引用。入库即完整，拒绝压缩式摘要。',
    points: ['实体页：论文、模型、工具等具体对象', '概念页：方法、理论、技术路线', '综合页：跨资料整合对比，保留完整数据表'],
    image: 'ingest-plan.png',
  },
  {
    id: 'graph',
    num: 'II',
    title: '知识图谱',
    icon: Network,
    brief: '双向链接互联，知识网络一目了然',
    detail:
      '页面间通过 [[slug]] 双向链接互联，形成可导航、可溯源的知识网络。图谱视图支持缩放、悬停高亮关联节点、关键词筛选，单页可聚焦查看某个知识节点的全部关联。关联查询纯本地计算，秒开。',
    points: ['悬停高亮关联节点，节点可筛选', '单页图谱视角，聚焦全部关联', '纯本地计算，零 LLM 调用'],
    image: 'knowledge-graph.png',
  },
  {
    id: 'guide',
    num: 'III',
    title: '研究指导',
    icon: Compass,
    brief: '引导式访谈，生成可执行的研究计划',
    detail:
      'AI 通过选择题式访谈澄清你的真实需求，再结合知识库上下文与网络、学术调研，输出包含目标、方法、里程碑、风险、研究问题、预期贡献的完整研究计划。聚焦高价值方向，不做无用功。',
    points: ['引导式访谈，澄清真实需求', '建议阅读清单一键下载到待入库', '计划状态全程流转，团队可批注'],
    image: 'plan-agent.png',
  },
  {
    id: 'explore',
    num: 'IV',
    title: '知识缺口探索',
    icon: Telescope,
    brief: '发现缺口，给出下一步方向',
    detail:
      '输入一个模糊方向，AI 基于全库做全局分析，输出三栏结果：已有知识覆盖盘点、按优先级排序的知识缺口、可执行的研究建议。有价值的建议可一键生成研究计划，探索历史自动保存，随时回溯。',
    points: ['三栏输出：覆盖 / 缺口 / 建议', '缺口按优先级排序', '一键转为研究计划'],
    image: 'explore.png',
  },
  {
    id: 'chat',
    num: 'V',
    title: '专家问答',
    icon: MessageSquare,
    brief: '基于知识库作答，好答案一键沉淀',
    detail:
      'AI 只基于库内知识作答，流式输出、Markdown 渲染、来源标注可点击溯源，可信可查。有价值的问答支持一键生成综合页面，自动完成摄入流程，好答案反哺知识库，越用越聪明。',
    points: ['只基于库内知识，答案可溯源', '好答案一键沉淀为综合页', '越用越聪明的正向飞轮'],
    image: 'chat-save.png',
  },
  {
    id: 'lint',
    num: 'VI',
    title: '知识体检',
    icon: Stethoscope,
    brief: '一键修复，知识库越用越健康',
    detail:
      '知识库规模扩大后必然出现结构腐化。内置体检机制检测概念冲突、缺失反向链接、缺失概念、信息缺口、孤立页面等；可自动修复项一键批量处理，需判断的由 AI 生成建议。健康度量化评分，在首页实时可见。',
    points: ['检测冲突、断链、缺口、孤立页', '可修复项一键批量处理', '健康度量化，可监控可自愈'],
    image: 'lint.png',
  },
  {
    id: 'collab',
    num: 'VII',
    title: '团队协作',
    icon: Users,
    brief: '计划、文献，处处可批注回复',
    detail:
      '研究计划、待入库资料、已入库文献、人类产出均支持评论与正文批注，团队围绕知识资产直接讨论。团队自产的研究报告、方案、复盘走「人类产出」专区，与 AI 生成内容统一沉淀路径。',
    points: ['计划、文献均可评论与正文批注', '人类产出专区统一沉淀', '重操作全团队可见，避免冲突'],
    image: 'collab.png',
  },
  {
    id: 'privacy',
    num: 'VIII',
    title: '隐私安全',
    icon: ShieldCheck,
    brief: '细粒度权限 + 私有化部署，数据不出域',
    detail:
      'admin / editor / viewer 三级角色，写操作全程留痕，操作日志支持按动作、操作人、日期审计回溯。单 Docker 镜像 + SQLite，全部数据在一个 volume 里，不出你的服务器。API Key 本地加密存储。',
    points: ['三级角色 + 全量审计日志', '私有化部署，数据不出域', 'API Key 本地加密存储'],
    image: 'permission.png',
  },
]

export default function Features() {
  const t = useT()
  const shot = useShot()

  return (
    <section id="features" className="container-page py-24">
      {/* 概述块 */}
      <Reveal>
        <h2 className="text-3xl font-bold tracking-tight">{t('八大亮点，一条知识闭环')}</h2>
        <p className="mt-3 max-w-[64ch] text-lg leading-relaxed text-text-secondary">
          {t('从知识铸造到隐私安全，MindForge 用「探索、计划、摄入、对话、再探索」的闭环把它们串成一个会生长的研究系统。点击任意能力，直达详情。')}
        </p>
      </Reveal>

      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => {
          const Icon = f.icon
          return (
            <Reveal key={f.id} delay={i * 60}>
              <a
                href={`#feature-${f.id}`}
                className="group flex h-full items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-all hover:-translate-y-2 hover:border-accent hover:shadow-xl hover:ring-2 hover:ring-accent/25"
              >
                <span className="font-mono text-base leading-none text-text-muted group-hover:text-accent">
                  {f.num}
                </span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 text-lg font-medium text-text-primary group-hover:text-accent">
                    <Icon size={14} strokeWidth={1.5} className="shrink-0 text-accent" />
                    {t(f.title)}
                  </h3>
                  <p className="mt-1.5 text-base leading-relaxed text-text-tertiary">{t(f.brief)}</p>
                </div>
              </a>
            </Reveal>
          )
        })}
      </div>

      {/* 详细行 */}
      <div className="mt-20 divide-y divide-line border-t border-line">
        {features.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.id} id={`feature-${f.id}`} className="scroll-mt-20 py-16">
              <div className="grid items-center gap-10 lg:grid-cols-[4fr_6fr]">
                <div>
                  <span className="font-mono text-lg text-accent">{f.num}</span>
                  <h3 className="mt-3 text-2xl font-bold tracking-tight">{t(f.title)}</h3>
                  <p className="mt-4 text-lg leading-relaxed text-text-secondary">{t(f.detail)}</p>
                  <ul className="mt-5 space-y-2">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-lg text-text-tertiary">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                        {t(p)}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  {f.image ? (
                    <img
                      src={shot(f.image)}
                      alt={t(f.title)}
                      loading="lazy"
                      className="w-full rounded-lg border border-line transition-all hover:-translate-y-1 hover:shadow-lg"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-line bg-surface">
                      <Icon size={56} strokeWidth={1} className="text-accent/70" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
