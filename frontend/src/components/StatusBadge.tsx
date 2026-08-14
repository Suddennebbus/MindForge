import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badge = cva(
  'inline-flex items-center gap-1.5 h-5 px-1.5 rounded text-[11px] font-medium uppercase tracking-wide whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-raised text-text-secondary border border-subtle',
        active: 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20',
        success: 'bg-accent-green/10 text-accent-green border border-accent-green/20',
        warning: 'bg-accent-amber/10 text-accent-amber border border-accent-amber/20',
        danger: 'bg-accent-red/10 text-accent-red border border-accent-red/20',
        muted: 'bg-transparent text-text-tertiary',
      },
      dot: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      dot: false,
    },
  },
)

export interface StatusBadgeProps
  extends VariantProps<typeof badge>,
    React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode
}

export function StatusBadge({ children, variant, className, ...props }: StatusBadgeProps) {
  const dotColor =
    variant === 'active'
      ? 'bg-accent-cyan'
      : variant === 'success'
        ? 'bg-accent-green'
        : variant === 'warning'
          ? 'bg-accent-amber'
          : variant === 'danger'
            ? 'bg-accent-red'
            : 'bg-text-tertiary'

  return (
    <span className={cn(badge({ variant }), className)} {...props}>
      <span className={cn('w-1 h-1 rounded-full', dotColor)} />
      {children}
    </span>
  )
}
