import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'destructive' | 'warning' | 'info' | 'accent' | 'outline'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-primary-subtle text-primary border-primary/20',
  success: 'bg-success-subtle text-success-text border-success/20',
  destructive: 'bg-destructive-subtle text-destructive border-destructive/20',
  warning: 'bg-warning-subtle text-warning-text border-warning/20',
  info: 'bg-info-subtle text-info-text border-info/20',
  accent: 'bg-accent-subtle text-accent border-accent/20',
  outline: 'bg-transparent text-muted border-border',
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
          variantClasses[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = 'Badge'

export { Badge }
export type { BadgeVariant }
