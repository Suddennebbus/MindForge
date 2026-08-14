import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ReactNode } from 'react'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) {
    return <Navigate to="/login" replace />
  }
  if (user?.must_change_password) {
    return <Navigate to="/change-password" replace />
  }
  return <>{children}</>
}
