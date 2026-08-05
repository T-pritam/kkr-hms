'use client'

import { useState } from 'react'
import { AlertTriangle, Unlock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * The reopen-day confirmation.
 *
 * The reason is mandatory and the submit stays disabled until it is written. A
 * reopen with no stated reason is indistinguishable from tampering, so both this
 * dialog and a CHECK constraint on the closure row insist on one.
 *
 * When later days have already been closed, the dialog says so. Reopening an
 * earlier date changes its closing balance, and every closure after it was
 * derived from that number. Those are not recalculated — silently rewriting
 * reconciled history is worse than telling the admin what they are about to
 * affect.
 */

const MIN_REASON_LENGTH = 10

interface ReopenDayDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  date: string
  closure: {
    version: number
    closed_at: string
    total_credits: number
    total_debits: number
    net_balance: number
    closed_by_user?: { username: string } | null
  } | null
}

const money = (amount: number) =>
  `₹${(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export function ReopenDayDialog({ isOpen, onClose, onSuccess, date, closure }: ReopenDayDialogProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [laterClosures, setLaterClosures] = useState(0)

  if (!isOpen) return null

  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= MIN_REASON_LENGTH && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      setLoading(true)
      const response = await fetch('/api/ledger/reopen-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ closure_date: date, reason: trimmed }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setLaterClosures(data.data?.later_closure_count ?? 0)
        setReason('')
        onSuccess()
        onClose()
      } else {
        setError(data.error || 'Failed to reopen the day')
      }
    } catch (err) {
      console.error('Reopen day error:', err)
      setError('Failed to reopen the day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg max-w-md w-full border border-border max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Unlock size={18} />
            Reopen day — {date}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {closure && (
            <div className="space-y-1.5 p-3 rounded-lg bg-surface-inset border border-border text-sm">
              <div className="flex justify-between text-muted">
                <span>Closed</span>
                <span className="text-foreground">
                  Close #{closure.version}
                  {closure.closed_by_user?.username ? ` · ${closure.closed_by_user.username}` : ''}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Reported net</span>
                <span className="text-foreground">{money(closure.net_balance)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Credits / debits</span>
                <span className="text-foreground">
                  {money(closure.total_credits)} / {money(closure.total_debits)}
                </span>
              </div>
            </div>
          )}

          <p className="text-sm text-muted">
            The existing closure is kept as history, not deleted. Entries can be added or
            corrected while the day is open, and closing again records a new version.
          </p>

          {laterClosures > 0 && (
            <div className="flex gap-2 p-3 rounded-lg bg-warning-subtle border border-warning/30 text-warning-text text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                {laterClosures} later {laterClosures === 1 ? 'closure was' : 'closures were'}{' '}
                calculated from this day&apos;s closing balance. They are not recalculated.
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="reopen_reason">Reason *</Label>
            <textarea
              id="reopen_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              placeholder="e.g. UPI receipt from 6pm was missed before closing"
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted mt-1">
              {trimmed.length < MIN_REASON_LENGTH
                ? `At least ${MIN_REASON_LENGTH} characters — this is recorded against the closure.`
                : 'Recorded against the closure and in the audit log.'}
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {loading ? 'Reopening…' : 'Reopen day'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
