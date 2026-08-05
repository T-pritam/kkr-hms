'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, Lock, RefreshCw, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { CloseDayDialog } from '@/components/ledger/close-day-dialog'

/**
 * Every date still awaiting a close, oldest first, with the action next to it.
 *
 * The alternative was walking the Daily Ledger date picker one day at a time,
 * which is why production accumulated six dates of activity and zero closures.
 * A backlog nobody can see is a backlog nobody clears.
 */

interface OpenDay {
  date: string
  transaction_count: number
  credit_count: number
  debit_count: number
  total_credits: number
  total_debits: number
  net_balance: number
  cash_credits: number
  unverified_count: number
  reopened: boolean
  last_reopened_at: string | null
  last_reopen_reason: string | null
}

const money = (amount: number) =>
  `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

/** How overdue a day is. The oldest entry is the one that matters most. */
const ageInDays = (value: string) => {
  const then = new Date(`${value}T00:00:00`).getTime()
  const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()
  return Math.max(0, Math.round((now - then) / 86_400_000))
}

interface DayCloseWorklistProps {
  onCountChange?: (count: number) => void
}

export function DayCloseWorklist({ onCountChange }: DayCloseWorklistProps) {
  const [openDays, setOpenDays] = useState<OpenDay[]>([])
  const [loading, setLoading] = useState(true)
  const [closingDate, setClosingDate] = useState<string | null>(null)
  const [summary, setSummary] = useState<any | null>(null)

  const fetchOpenDays = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/ledger/open-days?limit=100', { credentials: 'include' })
      if (!response.ok) {
        setOpenDays([])
        return
      }
      const data = await response.json()
      const days = data.data?.open_days ?? []
      setOpenDays(days)
      onCountChange?.(days.length)
    } catch (error) {
      console.error('Failed to fetch open days:', error)
      setOpenDays([])
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    fetchOpenDays()
  }, [fetchOpenDays])

  useRealtimeRefetch(['daily_ledger_transactions', 'daily_ledger_closures'], fetchOpenDays)

  /**
   * The close dialog shows the opening balance and the per-mode split, which the
   * worklist row does not carry. Fetch the day's summary before opening it.
   */
  const startClose = async (date: string) => {
    try {
      const response = await fetch(`/api/ledger/daily-summary/${date}`, { credentials: 'include' })
      const data = await response.json()
      if (response.ok && data.success) {
        setSummary(data.data)
        setClosingDate(date)
      } else {
        alert(data.error || 'Failed to load the day')
      }
    } catch (error) {
      console.error('Failed to load day summary:', error)
      alert('Failed to load the day')
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Day Close
              {openDays.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-warning-subtle text-warning-text border border-warning/30">
                  {openDays.length} open
                </span>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchOpenDays} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-sm text-muted mt-2">
            Dates with ledger activity and no closure, oldest first. Today is excluded — it
            is still in progress.
          </p>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="animate-spin h-6 w-6 text-primary" />
            </div>
          ) : openDays.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="mx-auto h-10 w-10 text-success-text mb-2" />
              <p className="text-foreground font-medium">Everything is closed</p>
              <p className="text-muted text-sm mt-1">No past day is left outstanding.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-muted font-medium">Date</th>
                    <th className="text-right py-3 px-2 text-muted font-medium hidden sm:table-cell">Entries</th>
                    <th className="text-right py-3 px-2 text-muted font-medium">Credits</th>
                    <th className="text-right py-3 px-2 text-muted font-medium">Debits</th>
                    <th className="text-right py-3 px-2 text-muted font-medium hidden md:table-cell">Net</th>
                    <th className="text-right py-3 px-2 text-muted font-medium hidden lg:table-cell">Cash</th>
                    <th className="text-center py-3 px-2 text-muted font-medium hidden md:table-cell">Unverified</th>
                    <th className="text-right py-3 px-2 text-muted font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openDays.map((day) => (
                    <tr key={day.date} className="border-b border-border hover:bg-surface-hover transition-colors">
                      <td className="py-3 px-2 text-sm whitespace-nowrap">
                        <div className="font-medium text-foreground">{formatDate(day.date)}</div>
                        <div className="text-xs text-muted flex items-center gap-1.5">
                          {ageInDays(day.date)}d ago
                          {/* A day that was closed and reopened reads very
                              differently from one nobody has ever closed. */}
                          {day.reopened && (
                            <span
                              className="inline-flex items-center gap-0.5 text-warning-text"
                              title={day.last_reopen_reason ?? undefined}
                            >
                              <RotateCcw size={11} />
                              reopened
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-muted hidden sm:table-cell">
                        {day.transaction_count}
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-success-text font-medium">
                        {money(day.total_credits)}
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-destructive font-medium">
                        {money(day.total_debits)}
                      </td>
                      <td className="py-3 px-2 text-sm text-right font-semibold text-foreground hidden md:table-cell">
                        {money(day.net_balance)}
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-muted hidden lg:table-cell">
                        {money(day.cash_credits)}
                      </td>
                      <td className="py-3 px-2 text-center hidden md:table-cell">
                        {day.unverified_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-warning-subtle text-warning-text">
                            <AlertTriangle size={11} />
                            {day.unverified_count}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => startClose(day.date)}>
                          Close
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {closingDate && summary && (
        <CloseDayDialog
          isOpen
          onClose={() => {
            setClosingDate(null)
            setSummary(null)
          }}
          onSuccess={fetchOpenDays}
          date={closingDate}
          totals={summary}
        />
      )}
    </>
  )
}
