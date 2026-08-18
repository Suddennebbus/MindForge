import { Reveal } from './Reveal'
import { useT } from '../i18n'

const pains = [
  { title: '知识沉寂', desc: '文档越堆越多，检索靠关键词，找得到却读不完，读完也难提炼出结论。' },
  { title: '有信息，没洞察', desc: '积累上百份资料，却回答不了"研究到什么程度了？还缺什么？下一步做什么？"。' },
  { title: '各自为战，重复劳动', desc: '立项、调研、写方案从零手搓，团队之间不知道别人已经做过什么。' },
  { title: '知识质量无人把关', desc: '低质信息污染知识库；规模扩大后必然出现概念冲突、信息缺口、孤立页面。' },
]

export default function PainPoints() {
  const t = useT()

  return (
    <section className="container-page py-24">
      <Reveal>
        <h2 className="text-3xl font-bold tracking-tight">{t('传统知识库之痛')}</h2>
        <p className="mt-3 max-w-[60ch] text-lg text-text-secondary">
          {t('当信息不再稀缺，真正稀缺的是洞察力、方向感，以及把信息转化为行动的能力。')}
        </p>
      </Reveal>

      <div className="mt-12 grid gap-3 lg:grid-cols-4">
        {pains.map((p, i) => (
          <Reveal key={p.title} delay={i * 60}>
            <div className="h-full rounded-lg border border-line bg-surface p-4 transition-all hover:-translate-y-1 hover:border-accent hover:shadow-lg">
              <h3 className="text-lg font-medium text-text-primary">{t(p.title)}</h3>
              <p className="mt-1.5 text-base leading-relaxed text-text-tertiary">{t(p.desc)}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
