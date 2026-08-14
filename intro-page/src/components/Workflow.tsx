import { ArrowRight } from 'lucide-react'
import { Reveal } from './Reveal'

const steps = ['探索方向', '生成计划', '收集资料', '人审核', 'AI 摄入', '形成 Wiki', '再探索']

export default function Workflow() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="container-page py-20">
        <Reveal>
          <h2 className="text-2xl font-bold tracking-tight">一条闭环，让知识持续增值</h2>
          <p className="mt-2 max-w-[60ch] text-lg text-text-secondary">
            信息不再只是被「存起来」，而是被结构化、链接化、可对话化，随使用越用越聪明。
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-y-3">
            {steps.map((s, i) => (
              <span key={s} className="flex items-center">
                <span className="rounded-md border border-line bg-base px-3.5 py-2 text-lg text-text-secondary">
                  {s}
                </span>
                {i < steps.length - 1 && (
                  <ArrowRight size={15} strokeWidth={1.5} className="mx-2 shrink-0 text-text-muted" />
                )}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
