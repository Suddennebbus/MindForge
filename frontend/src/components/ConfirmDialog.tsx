import { X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-lg border border-subtle bg-surface shadow-xl">
        <div className="flex items-start gap-4 p-5">
          {variant === 'danger' && (
            <div className="shrink-0 w-10 h-10 rounded-full bg-accent-red/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-accent-red" strokeWidth={1.5} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-text-primary">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">{description}</p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="关闭"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-subtle bg-raised/30 rounded-b-lg">
          <button
            onClick={onCancel}
            className="btn-secondary h-8 px-3 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'h-8 px-3 text-sm rounded font-medium transition-colors',
              variant === 'danger'
                ? 'bg-accent-red/10 text-accent-red border border-accent-red/20 hover:bg-accent-red/20'
                : 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
