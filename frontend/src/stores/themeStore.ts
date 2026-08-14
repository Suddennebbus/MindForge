import { create } from 'zustand'

type Theme = 'dark' | 'light' | 'system'

interface ThemeState {
  theme: Theme
  resolved: 'dark' | 'light'
  setTheme: (theme: Theme) => void
  init: () => void
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('mindforge-theme') as Theme) || 'system',
  resolved: 'dark',
  setTheme: (theme) => {
    const resolved = resolveTheme(theme)
    localStorage.setItem('mindforge-theme', theme)
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.colorScheme = resolved
    set({ theme, resolved })
  },
  init: () => {
    const theme = get().theme
    const resolved = resolveTheme(theme)
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.colorScheme = resolved
    set({ resolved })
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => {
      if (get().theme === 'system') {
        const resolved = resolveTheme('system')
        document.documentElement.setAttribute('data-theme', resolved)
        document.documentElement.style.colorScheme = resolved
        set({ resolved })
      }
    })
  },
}))