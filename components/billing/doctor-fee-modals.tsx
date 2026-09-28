'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { GivenByPicker } from '@/components/finances/given-by-picker'

/**
 * Paying and editing one doctor fee — shared by the patient's Billing tab and
 * the doctor's own page (client, 28 Sep: "settle from the doctor list too").
 * Moved out of billing-settlement-tab.tsx unchanged in behaviour.
 */

export interface DoctorFeeRow {
  id: string
  doctor?: { name?: string | null } | null
  visit_count?: number | null
  amount_per_visit?: number | string | null
  total_amount?: number | string | null
  settlement_type?: string | null
  settlement_notes?: string | null
  /** Shown under the doctor's name, e.g. the patient on the doctor's page. */
  subtitle?: string | null
}

const inputClass =
  'w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none'

async function putFee(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/doctor-settlements/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to save the fee')
  }
}

/**
 * Pay a doctor's fee — one small form (round 9). The fee is what is paid; the
 * price is saved first only if it changed.
 */
export function PayDoctorFeeModal({
  fee,
  onClose,
  onPaid,
}: {
  fee: DoctorFeeRow
  onClose: () => void
  onPaid: () => void
}) {
  const visits = fee.visit_count || 0
  const [mode, setMode] = useState<'per_visit' | 'total'>('per_visit')
  const [perVisit, setPerVisit] = useState(parseInt(String(fee.amount_per_visit ?? 0)) || 0)
  const [total, setTotal] = useState(parseInt(String(fee.total_amount ?? 0)) || 0)
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [givenBy, setGivenBy] = useState<{ given_by_user_id: string | null; given_by: string }>({
    given_by_user_id: null,
    given_by: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const changeAmount = (value: number) => {
    if (mode === 'per_visit') {
      setPerVisit(value)
      setTotal(value * visits)
    } else {
      setTotal(value)
      setPerVisit(visits > 0 ? Math.floor(value / visits) : 0)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (visits <= 0 || perVisit <= 0 || total <= 0) {
      setError('Enter the fee first')
      return
    }
    setBusy(true)
    setError('')
    try {
      const priceChanged =
        Number(fee.total_amount) !== total || Number(fee.amount_per_visit) !== perVisit
      if (priceChanged) {
        // No visit_count: the API derives it from the visits linked to the row.
        await putFee(fee.id, { pricing_mode: mode, amount_per_visit: perVisit, total_amount: total })
      }
      await putFee(fee.id, {
        settled: true,
        settlement_amount: total,
        payment_method: method,
        transaction_reference: method === 'cash' ? '' : reference,
        settlement_notes: notes,
        given_by: givenBy.given_by,
        given_by_user_id: givenBy.given_by_user_id,
      })
      onPaid()
    } catch (err: any) {
      setError(err.message || 'Failed to pay the fee')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <form
        onSubmit={submit}
        className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-foreground">Pay {fee.doctor?.name || 'the doctor'}</h4>
            <p className="text-sm text-muted">
              {fee.subtitle ? `${fee.subtitle} · ` : ''}
              {visits} visit{visits === 1 ? '' : 's'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* The fee: per visit × visits, or a total typed straight in. */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label htmlFor="pay-amount" className="text-sm text-muted w-20 shrink-0">
              {mode === 'per_visit' ? 'Per visit' : 'Total'}
            </label>
            <input
              id="pay-amount"
              type="text"
              inputMode="numeric"
              required
              autoFocus
              value={mode === 'per_visit' ? perVisit : total}
              onFocus={e => e.target.select()}
              onChange={e => /^\d*$/.test(e.target.value) && changeAmount(parseInt(e.target.value) || 0)}
              className={`${inputClass} w-28`}
            />
            {mode === 'per_visit' ? (
              <span className="text-sm text-muted whitespace-nowrap">
                × {visits} = <span className="font-semibold text-foreground">₹{total.toLocaleString('en-IN')}</span>
              </span>
            ) : (
              <span className="text-sm text-muted whitespace-nowrap">for {visits} visit{visits === 1 ? '' : 's'}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMode(mode === 'per_visit' ? 'total' : 'per_visit')}
            className="text-xs text-info hover:underline pl-[5.5rem]"
          >
            {mode === 'per_visit' ? 'or type the total instead' : 'or price it per visit'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pay-mode" className="block text-sm text-muted mb-1">Paid by</label>
            <select id="pay-mode" value={method} onChange={e => setMethod(e.target.value)} className={inputClass}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          {method !== 'cash' && (
            <div>
              <label htmlFor="pay-ref" className="block text-sm text-muted mb-1">
                Reference{method === 'upi' ? ' *' : ''}
              </label>
              <input
                id="pay-ref"
                required={method === 'upi'}
                value={reference}
                onChange={e => setReference(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {/* A picked user is a record; a typed name is for someone with no login. */}
        <GivenByPicker value={givenBy} onChange={setGivenBy} />

        {showNote ? (
          <textarea rows={2} placeholder="Note" value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} />
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="text-sm text-info hover:underline">
            + Add a note
          </button>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={busy || total <= 0}
            className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? 'Paying…' : `Pay ₹${total.toLocaleString('en-IN')}`}
          </button>
          <button type="button" onClick={onClose} className="bg-surface-inset text-foreground px-6 py-2 rounded-lg">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

/** Correct an unpaid fee's price, type and notes — the existing edit form. */
export function EditDoctorFeeModal({
  fee,
  onClose,
  onSaved,
}: {
  fee: DoctorFeeRow
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    pricing_mode: 'per_visit' as 'per_visit' | 'total',
    amount_per_visit: parseInt(String(fee.amount_per_visit ?? 0)) || 0,
    total_amount: parseInt(String(fee.total_amount ?? 0)) || 0,
    visit_count: fee.visit_count || 0,
    settlement_type: fee.settlement_type || 'regular',
    notes: fee.settlement_notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const changePrice = (field: 'amount_per_visit' | 'total_amount', value: number) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (prev.pricing_mode === 'per_visit' && field === 'amount_per_visit') {
        next.total_amount = value * prev.visit_count
      } else if (prev.pricing_mode === 'total' && field === 'total_amount') {
        next.amount_per_visit = prev.visit_count > 0 ? Math.floor(value / prev.visit_count) : 0
      }
      return next
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      // visit_count is not this form's to set: the API derives it.
      await putFee(fee.id, {
        pricing_mode: form.pricing_mode,
        amount_per_visit: form.amount_per_visit,
        total_amount: form.total_amount,
        settlement_type: form.settlement_type,
        settlement_notes: form.notes,
      })
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to update the fee')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <form
        onSubmit={submit}
        className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xl font-semibold text-foreground">Edit Settlement</h4>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-muted mb-2">Doctor</label>
          <input
            type="text"
            disabled
            value={[fee.doctor?.name, fee.subtitle].filter(Boolean).join(' · ')}
            className="w-full bg-surface-inset text-muted-foreground rounded-lg px-4 py-2 border border-border cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">Pricing Mode</label>
          <div className="flex gap-2">
            {(['per_visit', 'total'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, pricing_mode: m }))}
                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${form.pricing_mode === m ? 'bg-info text-foreground' : 'bg-surface-inset text-foreground hover:bg-surface-hover'}`}
              >
                {m === 'per_visit' ? 'Price per Visit' : 'Total Price'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">Visit Count *</label>
          <input type="text" inputMode="numeric" required readOnly value={form.visit_count} className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            {form.pricing_mode === 'per_visit' ? 'Amount Per Visit (₹) *' : 'Total Amount (₹) *'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            required
            value={form.pricing_mode === 'per_visit' ? form.amount_per_visit : form.total_amount}
            onFocus={e => e.target.select()}
            onChange={e => {
              if (/^\d*$/.test(e.target.value)) {
                changePrice(form.pricing_mode === 'per_visit' ? 'amount_per_visit' : 'total_amount', parseInt(e.target.value) || 0)
              }
            }}
            className={inputClass}
          />
        </div>

        <div className="bg-surface-inset rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Price per Visit:</span>
            <span className="text-foreground font-medium">₹{form.amount_per_visit}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Total Amount:</span>
            <span className="text-foreground font-medium">₹{form.total_amount}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">Settlement Type</label>
          <select
            value={form.settlement_type}
            onChange={e => setForm({ ...form, settlement_type: e.target.value })}
            className={inputClass}
          >
            <option value="regular">REGULAR</option>
            <option value="partial">PARTIAL</option>
            <option value="adjustment">ADJUSTMENT</option>
            <option value="refund">REFUND</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? 'Updating...' : 'Update Settlement'}
          </button>
          <button type="button" onClick={onClose} className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
