import { Star, Languages } from 'lucide-react'
import { GITHUB_URL, ZHIHU_URL, DOCS_URL } from '../constants'
import { useT, useLang, toggleLang } from '../i18n'

const links = [
  { label: 'GitHub', href: GITHUB_URL },
  { label: '知乎', href: ZHIHU_URL },
  { label: '文档', href: DOCS_URL },
]

export default function Nav() {
  const t = useT()
  const lang = useLang()

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-base/80 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="MindForge" className="h-7 w-7 rounded-sm" />
          <span className="text-lg font-semibold tracking-tight">MindForge</span>
        </a>

        <div className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-md px-3 py-2 text-lg text-text-secondary transition-colors hover:text-text-primary"
            >
              {t(l.label)}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-lg font-medium text-[#072e36] transition-colors hover:bg-accent-dim hover:text-white"
          >
            <Star size={15} strokeWidth={2} />
            Star
          </a>
          <button
            onClick={toggleLang}
            title={t('切换语言')}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-lg text-text-secondary transition-colors hover:text-text-primary"
          >
            <Languages size={15} strokeWidth={2} />
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </nav>
    </header>
  )
}
