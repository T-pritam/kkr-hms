'use client'

import { cn } from '@/lib/utils'

/**
 * "Updated by Anita - 02 Aug 2026, 4:12 PM"
 *
 * One component for every record in the app that carries attribution columns,
 * so the wording and the date format stay identical across charges, payments,
 * billing, lab orders, doctor visits, patient info and case sheets. Several of
 * those tables have stored `created_by` / `updated_by` all along; nothing ever
 * showed it.
 *
 * Renders nothing at all when there is no-one to name — an unattributed record
 * should look plain, not say "Updated by Unknown".
 */

interface UpdatedStampProps {
  by?: string | null
  at?: string | null
  /** 'Updated' by default; pass 'Added', 'Entered', 'Finalised' etc. */
  action?: string
  className?: string
}

function when(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function UpdatedStamp({ by, at, action = 'Updated', className }: UpdatedStampProps) {
  const time = when(at)
  if (!by && !time) return null

  return (
    <p className={cn('text-xs text-muted', className)}>
      {by ? `${action} by ${by}` : action}
      {by && time ? ' · ' : ''}
      {!by && time ? ' ' : ''}
      {time}
    </p>
  )
}
