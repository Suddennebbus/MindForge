import { create } from 'zustand'
import { api } from '@/api/client'

interface User {
  id: string
  username: string
  email: string
  role: string
  must_change_password?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token })
  },
  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },
  fetchMe: async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const resp = await api.get('/auth/me')
      set({ user: resp.data as User, token })
    } catch {
      localStorage.removeItem('token')
      set({ user: null, token: null })
    }
  },
}))
