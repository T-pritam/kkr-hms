'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** When true (default), modal becomes full-screen on mobile */
  mobileFullScreen?: boolean
}

const sizeClasses = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-6xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  className,
  mobileFullScreen = true,
}: ModalProps) {
  React.useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div
        className={cn(
          'relative w-full bg-surface shadow-lg animate-scaleIn flex flex-col',
          mobileFullScreen
            ? 'h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl border-0 sm:border sm:border-border'
            : 'max-h-[90vh] rounded-xl border border-border m-4',
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 sm:px-6 py-3 sm:py-4 shrink-0">
            <div className="space-y-0.5 sm:space-y-1 min-w-0">
              {title && (
                <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h2>
              )}
              {description && (
                <p className="text-xs sm:text-sm text-muted">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Close button if no header */}
        {!title && !description && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-border px-4 sm:px-6 py-3 sm:py-4 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
