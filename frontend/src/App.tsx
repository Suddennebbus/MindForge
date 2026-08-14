import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

export function App() {
  const initTheme = useThemeStore((s) => s.init)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  useEffect(() => {
    initTheme()
    fetchMe()
  }, [initTheme, fetchMe])

  return <RouterProvider router={router} />
}
