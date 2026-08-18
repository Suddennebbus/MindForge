import { Languages } from 'lucide-react'
import { useLangStore, useT } from '@/i18n'

interface LangToggleProps {
  collapsed?: boolean
}

export function LangToggle({ collapsed }: LangToggleProps) {
  const toggle = useLangStore((s) => s.toggle)
  const t = useT()

  return (
    <button
      onClick={toggle}
      className={`nav-item w-full text-left ${collapsed ? '!px-0 justify-center' : ''}`}
      title={t('切换语言')}
    >
      <Languages size={15} strokeWidth={1.5} />
      {!collapsed && <span>{t('切换语言')}</span>}
    </button>
  )
}
