import { cn } from '@/lib/utils'

interface ToolbarProps {
  children: React.ReactNode
  className?: string
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2 border-b border-subtle bg-surface/50 sticky top-0 z-10',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ToolbarGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>
}
