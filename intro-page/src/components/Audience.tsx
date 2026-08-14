import { Reveal } from './Reveal'

const audiences = [
  { title: '个人研究者', desc: '理解文献、找创新点、生成研究计划，写论文、做研究快人一步。' },
  { title: '内容创作者', desc: '管理素材、发现选题、问答生成文章骨架，写作从翻收藏夹变成对话素材库。' },
  { title: '研究团队', desc: '文献综述、技术预研、课题规划，把零散资料变成可对话、可探索的知识网络。' },
  { title: '技术团队', desc: '沉淀架构方案、技术调研、产品手册、项目复盘，新人快速 onboarding。' },
]

export default function Audience() {
  return (
    <section id="audience" className="border-t border-line bg-surface">
      <div className="container-page py-20">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">适合谁用</h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map((a, i) => (
            <Reveal key={a.title} delay={i * 80}>
              <div className="h-full rounded-lg border border-line bg-base p-5 transition-all hover:-translate-y-1 hover:border-accent hover:shadow-lg">
                <h3 className="text-base font-medium text-text-primary">{a.title}</h3>
                <p className="mt-2 text-lg leading-relaxed text-text-tertiary">{a.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
