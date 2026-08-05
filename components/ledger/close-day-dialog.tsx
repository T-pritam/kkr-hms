'use client'

import { useState } from 'react'
import { AlertTriangle, Lock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * The close-day confirmation.
 *
 * Everything the admin is signing off is shown before they commit: the per-mode
 * split, the opening balance the day inherits, and the closing cash balance a
 * drawer count has to match.
 *
 * Unverified entries are surfaced here and do not block. Closing is a cash
 * reconciliation; holding a day open because the person who verifies entries has
 * gone home would strand it. The count is recorded on the closure either way.
 */

interface CloseDayDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  date: string
  totals: {
    total_credits: number
    total_debits: number
    net_balance: number
    total_credits_cash: number
    total_credits_upi: number
    total_credits_card: number
    total_credits_other: number
    transaction_count: number
    unverified_count: number
    opening_balance_preview: number
    opening_cash_balance_preview: number
    debit_mode_summary?: Record<string, number>
  }
}

const money = (amount: number) =>
  `₹${(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export function CloseDayDialog({ isOpen, onClose, onSuccess, date, totals }: CloseDayDialogProps) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const debitsCash = totals.debit_mode_summary?.cash ?? 0
  const closingBalance = totals.opening_balance_preview + totals.net_balance
  const closingCash =
    totals.opening_cash_balance_preview + totals.total_credits_cash - debitsCash

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      setLoading(true)
      const response = await fetch('/api/ledger/close-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // No opening_balance: it is derived server-side from the previous close.
        body: JSON.stringify({ closure_date: date, notes: notes.trim() || null }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setNotes('')
        onSuccess()
        onClose()
      } else {
        setError(data.error || 'Failed to close the day')
      }
    } catch (err) {
      console.error('Close day error:', err)
      setError('Failed to close the day')
    } finally {
      setLoading(false)
    }
  }

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between text-sm ${strong ? 'font-semibold text-foreground' : 'text-muted'}`}>
      <span>{label}</span>
      <span className={strong ? '' : 'text-foreground'}>{value}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg max-w-md w-full border border-border max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Lock size={18} />
            Close day — {date}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {totals.unverified_count > 0 && (
            <div className="flex gap-2 p-3 rounded-lg bg-warning-subtle border border-warning/30 text-warning-text text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                <strong>
                  {totals.unverified_count} of {totals.transaction_count}{' '}
                  {totals.unverified_count === 1 ? 'entry is' : 'entries are'} still unverified.
                </strong>
                <div className="mt-0.5">
                  They will be closed as-is, and the count is recorded on the closure.
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5 p-3 rounded-lg bg-surface-inset border border-border">
            <Row label="Cash" value={money(totals.total_credits_cash)} />
            <Row label="UPI" value={money(totals.total_credits_upi)} />
            <Row label="Card" value={money(totals.total_credits_card)} />
            <Row label="Bank transfer / cheque" value={money(totals.total_credits_other)} />
            <div className="border-t border-border my-2" />
            <Row label="Total credits" value={money(totals.total_credits)} strong />
            <Row label="Total debits" value={`− ${money(totals.total_debits)}`} strong />
            <Row label="Net" value={money(totals.net_balance)} strong />
          </div>

          <div className="space-y-1.5 p-3 rounded-lg bg-surface-inset border border-border">
            <Row label="Opening balance" value={money(totals.opening_balance_preview)} />
            <Row label="Closing balance" value={money(closingBalance)} strong />
            <div className="border-t border-border my-2" />
            {/* The number a drawer count has to match — closing_balance includes
                UPI and card and is not cash. */}
            <Row label="Closing cash in hand" value={money(closingCash)} strong />
          </div>

          <div>
            <Label htmlFor="closure_notes">Notes</Label>
            <textarea
              id="closure_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth recording about this day's reconciliation"
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Closing…' : totals.unverified_count > 0 ? 'Close anyway' : 'Close day'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
