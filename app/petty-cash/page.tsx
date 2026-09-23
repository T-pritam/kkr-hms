'use client'

/**
 * The petty cash log (PRD v2, CR-02).
 *
 * The client asked for *"a separate petty cash log showing both credits (admin
 * giving cash) and debits (receptionist expenses), like a bank statement:
 * credit/debit, date, and reason"*, with *"no status"*, *"visible to both admin
 * and receptionists"*, and *"for each credit, record which receptionist it was
 * given to"*.
 *
 * So it reads like a passbook: newest at the top, a running balance down the
 * side, and nothing to sign off. The balance is checked against the cash in the
 * drawer, which is why a negative one warns rather than blocks (Q-10 = B).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { useUser } from '@/hooks/use-user'
import { AlertTriangle, Edit, Plus, Trash2, Wallet } from 'lucide-react'
import { istToday } from '@/lib/dates/ist'

interface Entry {
  id: string
  entry_date: string
  direction: 'in' | 'out'
  kind: 'opening' | 'topup' | 'expense' | 'advance'
  amount: number
  payment_mode: string
  reason: string
  running_balance: number
  can_edit: boolean
  created_by_user?: { id: string; username: string }
  given_to_user?: { id: string; username: string } | null
  advance_id?: number | null
}

const KIND_LABELS: Record<Entry['kind'], string> = {
  opening: 'Opening balance',
  topup: 'Top-up',
  expense: 'Expense',
  advance: 'Employee advance',
}

const inr = (value: unknown) =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const day = (value: string) =>
  new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })

export default function PettyCashPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'ADMIN'

  const [entries, setEntries] = useState<Entry[]>([])
  const [totals, setTotals] = useState({ in: 0, out: 0, balance: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<{ kind: Entry['kind']; id?: string } | null>(null)

  const fetchEntries = useCallback(async () => {
    try {
      const response = await fetch('/api/petty-cash')
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Failed to load petty cash')
      setEntries(body.data || [])
      setTotals(body.totals || { in: 0, out: 0, balance: 0 })
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  useRealtimeRefetch(['petty_cash_entries'], fetchEntries)

  const hasOpening = useMemo(() => entries.some(e => e.kind === 'opening'), [entries])

  const onDelete = async (entry: Entry) => {
    if (!confirm('Remove this entry? The balance will change.')) return
    const response = await fetch(`/api/petty-cash/${entry.id}`, { method: 'DELETE' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      alert(body?.error || 'Could not remove the entry')
      return
    }
    void fetchEntries()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wallet className="h-6 w-6" /> Petty cash
            </h1>
            <p className="text-sm text-muted">
              The desk&apos;s float: what the admin gave, and what the desk spent.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setForm({ kind: 'expense' })}>
              <Plus className="h-4 w-4 mr-1" /> Add expense
            </Button>
            {isAdmin && (
              <Button variant="outline" onClick={() => setForm({ kind: 'topup' })}>
                <Plus className="h-4 w-4 mr-1" /> Top up
              </Button>
            )}
            {isAdmin && !hasOpening && (
              <Button variant="outline" onClick={() => setForm({ kind: 'opening' })}>
                Opening balance
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted">Given to the desk</p>
              <p className="text-xl font-bold text-success-text">{inr(totals.in)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted">Spent</p>
              <p className="text-xl font-bold text-destructive">{inr(totals.out)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted">In hand</p>
              <p
                className={`text-xl font-bold ${totals.balance < 0 ? 'text-destructive' : 'text-foreground'}`}
              >
                {inr(totals.balance)}
              </p>
            </CardContent>
          </Card>
        </div>

        {totals.balance < 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm text-warning-text">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              The desk has spent more than it was given. That is fine to record — the next top-up
              brings it back — but the figure is worth a word with the admin.
            </span>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-8 text-center text-muted">Loading…</p>
            ) : error ? (
              <p className="p-8 text-center text-destructive">{error}</p>
            ) : entries.length === 0 ? (
              <p className="p-8 text-center text-muted">
                Nothing yet. An admin starts it off with an opening balance.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-inset text-muted">
                    <tr>
                      <th className="p-3 text-left font-medium">Date</th>
                      <th className="p-3 text-left font-medium">Type</th>
                      <th className="p-3 text-left font-medium">Reason</th>
                      <th className="p-3 text-right font-medium">In</th>
                      <th className="p-3 text-right font-medium">Out</th>
                      <th className="p-3 text-right font-medium">Balance</th>
                      <th className="p-3 text-left font-medium">Added by</th>
                      <th className="p-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map(entry => (
                      <tr key={entry.id} className="hover:bg-surface-hover">
                        <td className="p-3 whitespace-nowrap">{day(entry.entry_date)}</td>
                        <td className="p-3">
                          <Badge variant={entry.direction === 'in' ? 'success' : 'outline'}>
                            {KIND_LABELS[entry.kind]}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {entry.reason}
                          {entry.given_to_user && (
                            <span className="block text-xs text-muted">
                              given to {entry.given_to_user.username}
                            </span>
                          )}
                          <span className="block text-xs text-muted capitalize">
                            {entry.payment_mode.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-right text-success-text">
                          {entry.direction === 'in' ? inr(entry.amount) : ''}
                        </td>
                        <td className="p-3 text-right text-destructive">
                          {entry.direction === 'out' ? inr(entry.amount) : ''}
                        </td>
                        <td className="p-3 text-right text-foreground">{inr(entry.running_balance)}</td>
                        <td className="p-3">{entry.created_by_user?.username || '—'}</td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            {entry.kind === 'advance' ? (
                              <span className="text-xs text-muted">on the advance</span>
                            ) : entry.can_edit ? (
                              <>
                                <button
                                  onClick={() => setForm({ kind: entry.kind, id: entry.id })}
                                  className="p-1.5 rounded hover:bg-surface-inset text-muted hover:text-foreground"
                                  aria-label="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => onDelete(entry)}
                                  className="p-1.5 rounded hover:bg-surface-inset text-muted hover:text-destructive"
                                  aria-label="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted">
          There is no status here and nothing to close: the admin checks this balance against the
          cash the desk holds. Every change is kept in the log&apos;s history.
        </p>
      </div>

      {form && (
        <EntryDialog
          kind={form.kind}
          entryId={form.id}
          entries={entries}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            void fetchEntries()
          }}
        />
      )}
    </DashboardLayout>
  )
}

/** One dialog for adding and for correcting; the kind never changes on an edit. */
function EntryDialog({
  kind,
  entryId,
  entries,
  onClose,
  onSaved,
}: {
  kind: Entry['kind']
  entryId?: string
  entries: Entry[]
  onClose: () => void
  onSaved: () => void
}) {
  const existing = entryId ? entries.find(e => e.id === entryId) : undefined

  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  // The usual reason, pre-filled and editable — a top-up is nearly always the
  // week's float, and an empty box just makes everyone type the same words.
  const [reason, setReason] = useState(
    existing?.reason ?? (kind === 'topup' ? 'Weekly float' : kind === 'opening' ? 'Opening balance' : ''),
  )
  const [entryDate, setEntryDate] = useState(existing?.entry_date ?? istToday())
  const [mode, setMode] = useState(existing?.payment_mode ?? 'cash')
  const [givenTo, setGivenTo] = useState(existing?.given_to_user?.id ?? '')
  const [people, setPeople] = useState<Array<{ id: string; username: string }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (kind !== 'topup' && kind !== 'opening') return
    // Active receptionists only — they are the ones who hold the float.
    fetch('/api/petty-cash/recipients')
      .then(r => (r.ok ? r.json() : null))
      .then(body => setPeople(body?.data || []))
      .catch(() => {})
  }, [kind])

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(entryId ? `/api/petty-cash/${entryId}` : '/api/petty-cash', {
        method: entryId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          amount: Number(amount),
          reason,
          entry_date: entryDate,
          payment_mode: mode,
          given_to: givenTo || null,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'That did not save')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {entryId ? 'Correct this entry' : KIND_LABELS[kind]}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted">Amount</label>
            <Input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-muted">Date</label>
            <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">What for?</label>
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={kind === 'expense' ? 'e.g. auto fare for lab samples' : 'e.g. weekly float'}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted">Mode</label>
            <select
              className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
              value={mode}
              onChange={e => setMode(e.target.value)}
            >
              {['cash', 'upi', 'card', 'bank_transfer', 'cheque'].map(m => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          {(kind === 'topup' || kind === 'opening') && (
            <div>
              <label className="text-sm text-muted">Given to</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
                value={givenTo}
                onChange={e => setGivenTo(e.target.value)}
              >
                <option value="">Choose a receptionist…</option>
                {people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.username}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !amount || !reason.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
