import { Github, ArrowDown } from 'lucide-react'
import { GITHUB_URL } from '../constants'

export default function Hero() {
  return (
    <section className="container-page flex min-h-[100dvh] flex-col justify-center py-16">
      {/* 上：介绍文字 */}
      <div className="text-center">
        <h1 className="text-5xl font-bold leading-[1.4] tracking-tighter lg:text-6xl">
          把散落的论文、报告与经验，
          <br />
          铸造成<span className="text-accent">会思考的知识网络</span>
        </h1>
        <p className="mx-auto mt-7 max-w-[64ch] text-lg leading-relaxed text-text-secondary">
          一款基于 Karpathy LLM-Wiki，会思考、探索、规划、生长的知识铸造平台。
          <br />
          面向个人研究者、内容创作者、科研团队、技术团队。
          <br />
          本地部署，数据不出域，隐私安全。
        </p>
      </div>

      {/* 中：按钮 */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <a
          href="#quickstart"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-dim"
        >
          快速开始
        </a>
        <a
          href="#audience"
          className="inline-flex items-center gap-2 rounded-md border border-line-strong px-6 py-3 text-base font-medium text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          适合谁用
        </a>
        <a
          href={GITHUB_URL}
          className="inline-flex items-center gap-2 rounded-md border border-line-strong px-6 py-3 text-base font-medium text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          <Github size={16} strokeWidth={1.75} />
          GitHub
        </a>
        <a
          href="#features"
          className="inline-flex items-center gap-2 rounded-md border border-line-strong px-6 py-3 text-base font-medium text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          <ArrowDown size={16} strokeWidth={1.75} />
          核心能力
        </a>
      </div>

      {/* 下：工作台截图 */}
      <div className="mt-12">
        <img
          src="/screenshots/dashboard.png"
          alt="MindForge 工作台"
          className="w-full rounded-lg border border-line"
        />
      </div>
    </section>
  )
}
