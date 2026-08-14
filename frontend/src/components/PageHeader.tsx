import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: React.ReactNode
  meta?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, icon: Icon, actions, meta, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-4', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="shrink-0 w-8 h-8 rounded bg-raised border border-subtle flex items-center justify-center">
              <Icon size={16} className="text-text-secondary" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-text-primary tracking-tight truncate">{title}</h1>
            {meta && <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {description && (
        <p className="mt-2 text-sm text-text-secondary max-w-3xl leading-relaxed">{description}</p>
      )}
    </div>
  )
}
