import { Moon, Sun, Monitor } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useT } from '@/i18n'

interface ThemeToggleProps {
  collapsed?: boolean
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore()
  const t = useT()

  const cycle = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const label = theme === 'light' ? t('浅色') : theme === 'dark' ? t('深色') : t('跟随系统')

  return (
    <button
      onClick={cycle}
      className={`nav-item w-full text-left ${collapsed ? '!px-0 justify-center' : ''}`}
      title={`${t('主题')}: ${label}`}
    >
      <Icon size={15} strokeWidth={1.5} />
      {!collapsed && <span>{label}</span>}
    </button>
  )
}
