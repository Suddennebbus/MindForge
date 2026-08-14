import { create } from 'zustand'

export type ToastVariant = 'default' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  add: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  add: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    set({ toasts: [...get().toasts, { ...toast, id }] })
    const duration = toast.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration)
    }
  },
  dismiss: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

export function toast(toast: Omit<Toast, 'id'>) {
  useToastStore.getState().add(toast)
}
