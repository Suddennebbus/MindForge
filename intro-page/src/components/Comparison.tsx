import { Reveal } from './Reveal'

const rows: { dim: string; others: [string, string, string]; mindforge: string }[] = [
  { dim: '知识形态', others: ['静态文档', '向量切片', '文档 + AI 润色'], mindforge: '结构化多页 Wiki 网络' },
  { dim: '信息保真', others: ['原文堆积，无提炼', '摘要压缩，细节丢失', '依赖人工整理'], mindforge: '入库即完整结构化提取' },
  { dim: '跨文档洞察', others: ['无', '弱（切片级检索）', '无'], mindforge: '综合页 + 全局探索分析' },
  { dim: '缺口发现', others: ['无', '无', '无'], mindforge: '主动识别知识缺口并生成计划' },
  { dim: '知识治理', others: ['人工维护', '无治理概念', '无'], mindforge: '体检 + 一键修复 + 健康度量化' },
  { dim: '研究规划', others: ['无', '无', '无'], mindforge: '探索 → 计划 → 执行闭环' },
  { dim: '可控性', others: ['依厂商而定', '依厂商而定', '云端绑定'], mindforge: 'LLM 可配置，完全私有化' },
]

const cols = ['传统知识库', '通用 RAG 问答', '笔记型 AI', 'MindForge']

export default function Comparison() {
  return (
    <section className="container-page py-24">
      <Reveal>
        <h2 className="text-3xl font-bold tracking-tight">与同类工具的差异</h2>
        <p className="mt-3 max-w-[60ch] text-lg text-text-secondary">
          MindForge 不是又一个「存文件」的知识库，而是会探索、会规划、会生长的研究助手。
        </p>
      </Reveal>

      <Reveal delay={100}>
        <div className="mt-12 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] text-lg">
            <thead>
              <tr className="border-b border-line bg-surface text-left">
                <th className="px-4 py-3 font-medium text-text-secondary">维度</th>
                {cols.slice(0, 3).map((c) => (
                  <th key={c} className="px-4 py-3 font-medium text-text-tertiary">
                    {c}
                  </th>
                ))}
                <th className="border-x-2 border-t-2 border-accent bg-accent/10 px-4 py-3 font-medium text-accent">
                  MindForge
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.dim} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 text-text-secondary">{r.dim}</td>
                  {r.others.map((v) => (
                    <td key={v} className="px-4 py-3 text-text-tertiary">
                      {v}
                    </td>
                  ))}
                  <td
                    className={`border-x-2 border-accent bg-accent/5 px-4 py-3 font-medium text-text-primary ${
                      ri === rows.length - 1 ? 'border-b-2' : ''
                    }`}
                  >
                    {r.mindforge}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </section>
  )
}
