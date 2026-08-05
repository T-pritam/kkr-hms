'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LedgerClosure } from '@/lib/ledger/closure'

/**
 * Two facts the Daily Ledger screen has never shown, both persistent:
 *
 *   1. This date is closed — by whom, when, and which close it was, with the way
 *      back for an admin.
 *   2. Earlier days are still open. Without this the backlog is invisible unless
 *      somebody walks the date picker, which is how six dates of activity ended
 *      up with no closure at all.
 */

interface OpenDay {
  date: string
  transaction_count: number
  net_balance: number
}

interface DayCloseBannerProps {
  date: string
  closure: LedgerClosure | null
  canReopen: boolean
  onReopen: () => void
  /** Bumped by the parent after a close or reopen so the backlog refetches. */
  refreshKey?: number
}

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export function DayCloseBanner({ date, closure, canReopen, onReopen, refreshKey }: DayCloseBannerProps) {
  const [openDays, setOpenDays] = useState<OpenDay[]>([])

  useEffect(() => {
    // Ignore a response that arrives after the component has moved on.
    let active = true

    const fetchOpenDays = async () => {
      try {
        const response = await fetch('/api/ledger/open-days?limit=50', { credentials: 'include' })
        if (!active) return

        if (!response.ok) {
          // 403 for roles that do not reconcile the day — show them nothing.
          setOpenDays([])
          return
        }

        const data = await response.json()
        if (active) setOpenDays(data.data?.open_days ?? [])
      } catch (error) {
        console.error('Failed to fetch open days:', error)
        if (active) setOpenDays([])
      }
    }

    fetchOpenDays()
    return () => {
      active = false
    }
  }, [refreshKey])

  // The day being viewed is not "outstanding" while you are looking at it.
  const backlog = openDays.filter((d) => d.date !== date)

  return (
    <div className="space-y-3">
      {closure && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-accent-subtle border border-accent/20">
          <Lock size={18} className="text-accent shrink-0" />
          <div className="text-sm text-foreground flex-1">
            <strong>This day is closed.</strong>{' '}
            <span className="text-muted">
              Close #{closure.version}
              {closure.closed_by_user?.username ? ` by ${closure.closed_by_user.username}` : ''}
              {closure.closed_at
                ? ` at ${new Date(closure.closed_at).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
              . No entry can be added, amended or removed until it is reopened.
            </span>
          </div>
          {canReopen && (
            <Button size="sm" variant="outline" onClick={onReopen} className="shrink-0">
              <Unlock size={14} className="mr-1" />
              Reopen day
            </Button>
          )}
        </div>
      )}

      {backlog.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-warning-subtle border border-warning/30">
          <AlertTriangle size={18} className="text-warning-text shrink-0" />
          <div className="text-sm text-warning-text flex-1">
            <strong>
              {backlog.length} earlier {backlog.length === 1 ? 'day is' : 'days are'} still open
            </strong>{' '}
            <span className="opacity-90">— oldest {formatDate(backlog[0].date)}.</span>
          </div>
          <Link href="/finances?tab=dayclose" className="shrink-0">
            <Button size="sm" variant="outline">
              Review
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
