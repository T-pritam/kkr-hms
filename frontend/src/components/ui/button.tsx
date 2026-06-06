import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'success' | 'info' | 'accent' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:pointer-events-none",
          {
            'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm': variant === 'default',
            'bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-sm': variant === 'destructive',
            'border border-border bg-transparent hover:bg-surface-hover text-foreground': variant === 'outline',
            'hover:bg-surface-hover text-foreground': variant === 'ghost',
            'bg-success text-success-foreground hover:bg-success-hover shadow-sm': variant === 'success',
            'bg-info text-info-foreground hover:bg-info-hover shadow-sm': variant === 'info',
            'bg-accent text-accent-foreground hover:bg-accent-hover shadow-sm': variant === 'accent',
            'bg-surface-hover text-foreground hover:bg-surface-inset': variant === 'secondary',
          },
          {
            'h-10 px-4 py-2 text-sm': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-11 px-6 text-base': size === 'lg',
            'h-9 w-9 p-0': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
