import { cn } from '@/lib/utils'

interface DataListColumn<T> {
  key: string
  header: React.ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => React.ReactNode
}

interface DataListProps<T> {
  columns: DataListColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: React.ReactNode
  className?: string
}

export function DataList<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  empty,
  className,
}: DataListProps<T>) {
  if (data.length === 0 && empty) {
    return <div className={className}>{empty}</div>
  }

  const gridTemplateColumns = columns.map((c) => c.width || 'minmax(0,1fr)').join(' ')

  return (
    <div className={cn('border border-subtle rounded bg-surface', className)}>
      <div
        className="grid bg-raised rounded-t-[3px] border-b border-subtle text-xs font-medium text-text-tertiary uppercase tracking-wider"
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              'px-3 py-2 min-w-0',
              col.align === 'right' && 'text-right',
              col.align === 'center' && 'text-center',
            )}
          >
            {col.header}
          </div>
        ))}
      </div>
      <div className="divide-y divide-subtle">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            onClick={() => onRowClick?.(row)}
            className={cn(
              'grid text-sm',
              onRowClick && 'cursor-pointer hover:bg-hover transition-colors',
            )}
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn(
                  'px-3 py-2.5 min-w-0',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                )}
              >
                {col.render(row)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
