import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

function ToastIcon({ variant }: { variant?: string }) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 size={16} className="text-accent-green" strokeWidth={1.5} />
    case 'warning':
      return <AlertTriangle size={16} className="text-accent-amber" strokeWidth={1.5} />
    case 'error':
      return <AlertCircle size={16} className="text-accent-red" strokeWidth={1.5} />
    default:
      return <Info size={16} className="text-accent-cyan" strokeWidth={1.5} />
  }
}

function ToastItem({ toast }: { toast: { id: string; title: string; description?: string; variant?: string } }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const border =
    toast.variant === 'success'
      ? 'border-accent-green/20'
      : toast.variant === 'warning'
        ? 'border-accent-amber/20'
        : toast.variant === 'error'
          ? 'border-accent-red/20'
          : 'border-accent-cyan/20'

  return (
    <div
      className={cn(
        'pointer-events-auto w-80 rounded border bg-surface shadow-lg overflow-hidden',
        border,
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 shrink-0">
          <ToastIcon variant={toast.variant} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-xs text-text-secondary leading-relaxed">{toast.description}</p>
          )}
        </div>
        <button
          onClick={() => dismiss(toast.id)}
          className="shrink-0 p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="关闭"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div
        className={cn(
          'h-0.5 animate-toast-progress',
          toast.variant === 'success'
            ? 'bg-accent-green'
            : toast.variant === 'warning'
              ? 'bg-accent-amber'
              : toast.variant === 'error'
                ? 'bg-accent-red'
                : 'bg-accent-cyan',
        )}
      />
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
