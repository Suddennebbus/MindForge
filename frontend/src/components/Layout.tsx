import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/api/client'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { ToastContainer } from './Toast'
import { PageWidthProvider, usePageWidth } from './PageWidth'

function LayoutInner() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, token, setAuth, logout } = useAuthStore()
  const { width } = usePageWidth()

  useEffect(() => {
    if (token && !user) {
      api.get('/auth/me')
        .then((resp) => setAuth(resp.data, token))
        .catch(() => logout())
    }
  }, [token, user, setAuth, logout])

  const containerClass =
    width === 'reader'
      ? 'max-w-3xl mx-auto px-6 py-6'
      : width === 'wide'
        ? 'px-6 py-6'
        : 'max-w-6xl mx-auto px-6 py-6'

  return (
    <div className="flex h-screen bg-base text-text-primary font-sans">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="flex-1 overflow-auto min-w-0">
        <div className={containerClass}>
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <ToastContainer />
    </div>
  )
}

export function Layout() {
  return (
    <PageWidthProvider>
      <LayoutInner />
    </PageWidthProvider>
  )
}
