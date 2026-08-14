import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 border border-dashed border-subtle rounded bg-surface/50',
        className,
      )}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-raised border border-subtle flex items-center justify-center mb-3">
          <Icon size={18} className="text-text-tertiary" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-text-tertiary max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
