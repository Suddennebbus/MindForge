import { Moon, Sun, Monitor } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

interface ThemeToggleProps {
  collapsed?: boolean
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore()

  const cycle = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const label = theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'

  return (
    <button
      onClick={cycle}
      className={`nav-item w-full text-left ${collapsed ? '!px-0 justify-center' : ''}`}
      title={`主题: ${label}`}
    >
      <Icon size={15} strokeWidth={1.5} />
      {!collapsed && <span>{label}</span>}
    </button>
  )
}
