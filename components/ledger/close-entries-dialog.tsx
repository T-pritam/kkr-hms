'use client'

/**
 * "Mark closed" and "Reopen" over any set of ledger rows (PRD v2, CR-06).
 *
 * Closing carries an optional note and the amount the admin actually counted
 * (Q-27 = B); reopening requires a reason, because it is the only record of why
 * a counted set was opened again (Q-04 = B). Neither asks for a date or a user:
 * the rows were already chosen on the log.
 */

import { useEffect, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  mode: 'close' | 'reopen' | null
  ids: string[]
  total: number
  byMode: Record<string, number>
  onClose: () => void
  onDone: () => void
}

const inr = (value: number) =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function CloseEntriesDialog({ mode, ids, total, byMode, onClose, onDone }: Props) {
  const [note, setNote] = useState('')
  const [amountReceived, setAmountReceived] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (mode) {
      setNote('')
      setAmountReceived('')
      setReason('')
      setError('')
    }
  }, [mode])

  if (!mode) return null

  const closing = mode === 'close'

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(closing ? '/api/ledger/close' : '/api/ledger/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          closing
            ? { ids, note: note || null, amount_received: amountReceived || null }
            : { ids, reason },
        ),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'That did not work')
      onDone()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          {closing ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
          {closing ? `Mark ${ids.length} entries closed` : `Reopen ${ids.length} entries`}
        </h2>

        <div className="rounded-lg bg-surface-inset p-3 text-sm">
          <p className="text-foreground">
            {ids.length} rows · {inr(total)}
          </p>
          <p className="text-muted">
            {Object.entries(byMode)
              .map(([m, amount]) => `${m.replace('_', ' ')} ${inr(amount)}`)
              .join(' · ') || '—'}
          </p>
        </div>

        {closing ? (
          <>
            <div>
              <label className="text-sm text-muted">Amount received (optional)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={String(total)}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">What you actually counted, if it differs.</p>
            </div>
            <div>
              <label className="text-sm text-muted">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. evening count" />
            </div>
          </>
        ) : (
          <div>
            <label className="text-sm text-muted">Why are you reopening these?</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. wrong amount on one receipt"
            />
            <p className="text-xs text-muted mt-1">Kept on each entry.</p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || ids.length === 0 || (!closing && !reason.trim())}>
            {saving ? 'Saving…' : closing ? `Mark closed (${ids.length})` : `Reopen (${ids.length})`}
          </Button>
        </div>
      </div>
    </div>
  )
}
