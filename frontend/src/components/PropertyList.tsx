import { cn } from '@/lib/utils'

interface Property {
  label: string
  value: React.ReactNode
  fullWidth?: boolean
}

interface PropertyListProps {
  properties: Property[]
  columns?: 1 | 2 | 3
  className?: string
}

export function PropertyList({ properties, columns = 2, className }: PropertyListProps) {
  return (
    <div
      className={cn(
        'grid gap-px bg-subtle border border-subtle rounded overflow-hidden',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 md:grid-cols-2',
        columns === 3 && 'grid-cols-1 md:grid-cols-3',
        className,
      )}
    >
      {properties.map((prop, idx) => (
        <div
          key={idx}
          className={cn(
            'bg-surface px-3 py-2.5',
            prop.fullWidth && 'md:col-span-full',
          )}
        >
          <dt className="text-[11px] uppercase tracking-wider text-text-tertiary mb-0.5">{prop.label}</dt>
          <dd className="text-sm text-text-primary">{prop.value || <span className="text-text-muted">-</span>}</dd>
        </div>
      ))}
    </div>
  )
}
