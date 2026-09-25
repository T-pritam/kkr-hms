'use client'

/**
 * The ledger log (PRD v2, CR-05 · CR-06 · CR-08).
 *
 * What the client asked for, in their words: *"It should show all entries, so
 * others don't have to guess whether a payment was received"*, and *"remove the
 * per-user, per-day day close… list all rows, select in bulk and mark them
 * closed… add a separate tab showing rows that are not yet marked closed."*
 *
 * So this page replaced three: the one-date daily summary, the employee shift
 * schedule, and the Finances transactions table. One list, one set of filters,
 * two tabs — **All** and **Not closed** — and one request per view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { useUser } from '@/hooks/use-user'
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
  Wallet,
} from 'lucide-react'
import { OpdEntryModal } from '@/components/ledger/opd-entry-modal'
import { EditTransactionModal } from '@/components/ledger/edit-transaction-modal'
import { CloseEntriesDialog } from '@/components/ledger/close-entries-dialog'
import { ledgerExpenseCategoryLabel } from '@/lib/format/expense'
import { istToday } from '@/lib/dates/ist'

interface Entry {
  id: string
  transaction_date: string
  transaction_type: 'credit' | 'debit'
  source: string
  amount: number
  payment_mode: string
  reference_number?: string | null
  description: string
  notes?: string | null
  expense_category?: string | null
  expense_category_detail?: string | null
  status: 'open' | 'closed'
  created_at: string
  created_by: string
  created_by_user?: { id: string; username: string }
  closed_by_user?: { id: string; username: string }
  closed_at?: string | null
  reopen_reason?: string | null
  patient?: { id: string; patient_id: string; name: string } | null
  /** A patient payment is changed on the patient's Payments tab (CR-12). */
  payment_installment_id?: string | null
  can_edit: boolean
}

/** Reception gets `count` only — the money figures are not sent to them. */
interface Totals {
  in?: number
  out?: number
  net?: number
  cash_in?: number
  cash_out?: number
  count: number
}

const SOURCE_LABELS: Record<string, string> = {
  patient: 'Patient payment',
  registration: 'Registration fee',
  lab: 'Lab',
  opd: 'OPD',
  expense: 'Expense',
  doctor_settlement: 'Doctor fee',
  referral_commission: 'Referral commission',
  salary: 'Salary',
}

const MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'] as const

const inr = (value: unknown) =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const day = (value: string) =>
  new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })

const time = (value: string) =>
  new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

/** The first and last day of the current IST month (Q-22: the default view). */
function thisMonth() {
  const today = istToday()
  const [year, month] = today.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` }
}

export default function LedgerPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'ADMIN'
  // Reception works the ledger but does not see its money totals (client, 26 Sep).
  const showTotals = user?.role !== 'RECEPTIONIST'

  const [tab, setTab] = useState<'all' | 'open'>('all')
  const [entries, setEntries] = useState<Entry[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<Array<{ id: string; username: string }>>([])

  const month = useMemo(thisMonth, [])
  const [filters, setFilters] = useState({
    from: month.from,
    to: month.to,
    direction: '',
    source: '',
    mode: '',
    added_by: '',
    search: '',
  })

  const [showOpd, setShowOpd] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [closing, setClosing] = useState<'close' | 'reopen' | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (tab === 'open') params.set('status', 'open')
    params.set('page', String(page))
    return params.toString()
  }, [filters, tab, page])

  const fetchEntries = useCallback(async () => {
    try {
      const response = await fetch(`/api/ledger/entries?${query}`)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Failed to load the ledger')
      setEntries(body.data || [])
      setTotals(body.totals || null)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    // Only for the "added by" filter; it never changes during a session.
    fetch('/api/ledger/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setUsers(body?.data || []))
      .catch(() => {})
  }, [])

  useRealtimeRefetch(['daily_ledger_transactions', 'patient_billing_installments'], fetchEntries)

  const setFilter = (key: string, value: string) => {
    setPage(1)
    setSelected(new Set())
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectable = entries.filter((e) => (closing === 'reopen' ? e.status === 'closed' : e.status === 'open'))
  const selectedRows = entries.filter((e) => selected.has(e.id))

  /** Q-26: the ticked rows, by mode — "12 rows · cash ₹8,400 · UPI ₹3,900". */
  const selection = selectedRows.reduce(
    (acc, row) => {
      const amount = Number(row.amount) || 0
      acc.total += amount
      acc.byMode[row.payment_mode] = (acc.byMode[row.payment_mode] || 0) + amount
      return acc
    },
    { total: 0, byMode: {} as Record<string, number> },
  )

  const onDelete = async (entry: Entry) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    const response = await fetch(`/api/ledger/transactions/${entry.id}`, { method: 'DELETE' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      alert(body?.error || 'Could not delete the entry')
      return
    }
    void fetchEntries()
  }

  const tabs = [
    { id: 'all' as const, label: 'All entries' },
    { id: 'open' as const, label: 'Not closed' },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wallet className="h-6 w-6" /> Ledger
            </h1>
            <p className="text-sm text-muted">
              Every payment, receipt and payout — everyone&apos;s, not just yours.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowOpd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add OPD receipt
            </Button>
            <Link
              href="/petty-cash"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-hover"
            >
              Petty cash
            </Link>
          </div>
        </div>

        {/* Totals for the current filter (Q-22) */}
        {showTotals && totals && totals.in !== undefined && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              ['Money in', inr(totals.in), 'text-success-text'],
              ['Money out', inr(totals.out), 'text-destructive'],
              ['Net', inr(totals.net), 'text-foreground'],
              ['Cash in', inr(totals.cash_in), 'text-foreground'],
              ['Cash out', inr(totals.cash_out), 'text-foreground'],
            ].map(([label, value, tone]) => (
              <Card key={String(label)}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted">{label}</p>
                  <p className={`text-xl font-bold ${tone}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setPage(1)
                setSelected(new Set())
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <div>
              <label className="text-xs text-muted">From</label>
              <Input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted">To</label>
              <Input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted">In / out</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
                value={filters.direction}
                onChange={(e) => setFilter('direction', e.target.value)}
              >
                <option value="">Both</option>
                <option value="credit">Money in</option>
                <option value="debit">Money out</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Type</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
                value={filters.source}
                onChange={(e) => setFilter('source', e.target.value)}
              >
                <option value="">All</option>
                {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Mode</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
                value={filters.mode}
                onChange={(e) => setFilter('mode', e.target.value)}
              >
                <option value="">All</option>
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Added by</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
                value={filters.added_by}
                onChange={(e) => setFilter('added_by', e.target.value)}
              >
                <option value="">Everyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-3 h-4 w-4 text-muted" />
                <Input
                  className="pl-8"
                  placeholder="Description"
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The admin's selection bar (CR-06) */}
        {isAdmin && selected.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-subtle p-3">
            <p className="text-sm text-foreground">
              <strong>{selected.size} rows</strong> · {inr(selection.total)}
              {Object.entries(selection.byMode).map(([mode, amount]) => (
                <span key={mode} className="text-muted">
                  {' '}
                  · {mode.replace('_', ' ')} {inr(amount)}
                </span>
              ))}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              {selectedRows.every((r) => r.status === 'closed') ? (
                <Button onClick={() => setClosing('reopen')}>
                  <Unlock className="h-4 w-4 mr-1" /> Reopen ({selected.size})
                </Button>
              ) : (
                <Button onClick={() => setClosing('close')}>
                  <Lock className="h-4 w-4 mr-1" /> Mark closed ({selectedRows.filter((r) => r.status === 'open').length})
                </Button>
              )}
            </div>
          </div>
        )}

        {/* The log */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-8 text-center text-muted">Loading…</p>
            ) : error ? (
              <p className="p-8 text-center text-destructive">{error}</p>
            ) : entries.length === 0 ? (
              <p className="p-8 text-center text-muted">
                {tab === 'open' ? 'Nothing is waiting to be closed.' : 'No entries for this filter.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-inset text-muted">
                    <tr>
                      {isAdmin && (
                        <th className="p-3 w-10">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={selectable.length > 0 && selectable.every((e) => selected.has(e.id))}
                            onChange={(e) =>
                              setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())
                            }
                          />
                        </th>
                      )}
                      <th className="p-3 text-left font-medium">Date</th>
                      <th className="p-3 text-left font-medium">Type</th>
                      <th className="p-3 text-left font-medium">Patient / description</th>
                      <th className="p-3 text-right font-medium">In</th>
                      <th className="p-3 text-right font-medium">Out</th>
                      <th className="p-3 text-left font-medium">Mode</th>
                      <th className="p-3 text-left font-medium">Added by</th>
                      <th className="p-3 text-left font-medium">Status</th>
                      <th className="p-3 text-right font-medium sticky right-0 bg-surface-inset">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-surface-hover">
                        {isAdmin && (
                          <td className="p-3">
                            <input
                              type="checkbox"
                              aria-label={`Select ${entry.description}`}
                              checked={selected.has(entry.id)}
                              onChange={() => toggle(entry.id)}
                            />
                          </td>
                        )}
                        <td className="p-3 whitespace-nowrap">
                          {day(entry.transaction_date)}
                          <span className="block text-xs text-muted">{time(entry.created_at)}</span>
                        </td>
                        <td className="p-3">
                          {SOURCE_LABELS[entry.source] ?? entry.source}
                          {entry.source === 'expense' && entry.expense_category && (
                            <span className="block text-xs text-muted">
                              {ledgerExpenseCategoryLabel(entry.expense_category, entry.expense_category_detail)}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {entry.patient ? (
                            <Link
                              href={`/patients/${entry.patient.id}`}
                              className="text-primary hover:underline"
                            >
                              {entry.description}
                            </Link>
                          ) : (
                            entry.description
                          )}
                          {entry.reference_number && (
                            <span className="block text-xs text-muted">Ref {entry.reference_number}</span>
                          )}
                        </td>
                        <td className="p-3 text-right text-success-text">
                          {entry.transaction_type === 'credit' ? inr(entry.amount) : ''}
                        </td>
                        <td className="p-3 text-right text-destructive">
                          {entry.transaction_type === 'debit' ? inr(entry.amount) : ''}
                        </td>
                        <td className="p-3 capitalize">{entry.payment_mode.replace('_', ' ')}</td>
                        <td className="p-3">{entry.created_by_user?.username || '—'}</td>
                        <td className="p-3">
                          {entry.status === 'closed' ? (
                            <Badge variant="accent" title={
                              entry.closed_by_user?.username
                                ? `Closed by ${entry.closed_by_user.username}`
                                : undefined
                            }>
                              Closed
                            </Badge>
                          ) : (
                            <Badge variant="warning">Open</Badge>
                          )}
                        </td>
                        {/* Pinned: on a narrow screen the rest scrolls, the actions stay in view. */}
                        <td className="p-3 sticky right-0 bg-surface">
                          <div className="flex justify-end gap-1">
                            {entry.payment_installment_id && entry.patient ? (
                              <Link
                                href={`/patients/${entry.patient.id}`}
                                className="text-xs text-primary hover:underline"
                              >
                                On the patient
                              </Link>
                            ) : entry.can_edit ? (
                              <>
                                <button
                                  onClick={() => setEditing(entry)}
                                  className="p-1.5 rounded hover:bg-surface-inset text-muted hover:text-foreground"
                                  aria-label="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => onDelete(entry)}
                                  className="p-1.5 rounded hover:bg-surface-inset text-muted hover:text-destructive"
                                  aria-label="Delete"
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

        {/* Paging: 50 a page, newest first (Q-22) */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {totals ? `${totals.count} entries match this filter` : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-muted">Page {page}</span>
            <Button
              variant="outline"
              disabled={entries.length < 50}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <OpdEntryModal
        isOpen={showOpd}
        onClose={() => setShowOpd(false)}
        onSuccess={() => {
          setShowOpd(false)
          void fetchEntries()
        }}
        selectedDate={istToday()}
      />
      <EditTransactionModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        onSuccess={() => {
          setEditing(null)
          void fetchEntries()
        }}
        transaction={editing as any}
      />
      <CloseEntriesDialog
        mode={closing}
        ids={selectedRows
          .filter((r) => (closing === 'reopen' ? r.status === 'closed' : r.status === 'open'))
          .map((r) => r.id)}
        total={selection.total}
        byMode={selection.byMode}
        onClose={() => setClosing(null)}
        onDone={() => {
          setClosing(null)
          setSelected(new Set())
          void fetchEntries()
        }}
      />
    </DashboardLayout>
  )
}
