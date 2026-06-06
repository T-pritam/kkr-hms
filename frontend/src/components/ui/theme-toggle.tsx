'use client'

import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/lib/theme-provider'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className={cn('flex items-center gap-1 rounded-lg bg-surface-inset p-1', className)}>
      <button
        onClick={() => setTheme('light')}
        className={cn(
          'rounded-md p-1.5 transition-colors',
          theme === 'light'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted hover:text-foreground'
        )}
        title="Light mode"
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          'rounded-md p-1.5 transition-colors',
          theme === 'dark'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted hover:text-foreground'
        )}
        title="Dark mode"
      >
        <Moon className="h-4 w-4" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={cn(
          'rounded-md p-1.5 transition-colors',
          theme === 'system'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted hover:text-foreground'
        )}
        title="System theme"
      >
        <Monitor className="h-4 w-4" />
      </button>
    </div>
  )
}
