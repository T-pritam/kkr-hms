'use client'

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { CommissionStamps } from '@/components/patients/payout-stamps'
import { GivenByPicker } from '@/components/finances/given-by-picker'
import { ReferralSelect } from './referral-select'

/**
 * The referral commission, in one block (client, 28 Sep).
 *
 * It used to take two places: a "Referral & Commission" button at the top of
 * the tab to set the person and the amount, and a separate block below to pay
 * it. Now the person and the amount are edited right here, and "Pay" opens the
 * same short form as a doctor fee. Once paid, the block is a one-line summary;
 * only an admin can still correct it (Q-88 — the API enforces that too).
 */

interface Props {
  patientId: string
  billing: any
  isAdmin: boolean
  /** Reception or admin: may set and pay an unpaid commission. */
  canPrice: boolean
  onChanged: () => void
}

const inr = (n: unknown) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const inputClass =
  'w-full bg-surface-inset text-foreground rounded-lg px-3 py-2 border border-border focus:border-ring focus:outline-none'

export function ReferralCommissionBlock({ patientId, billing, isAdmin, canPrice, onChanged }: Props) {
  const settled = Boolean(billing?.referral_settled)
  const savedReferral: string = billing?.referral?.id || ''
  const savedAmount = parseInt(billing?.referral_commission_amount || 0, 10) || 0

  const [referralId, setReferralId] = useState(savedReferral)
  const [amount, setAmount] = useState(String(savedAmount))
  // A paid commission is shown as a summary; an admin opens it to correct it.
  const [editingPaid, setEditingPaid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [pay, setPay] = useState({
    payment_method: 'cash',
    transaction_reference: '',
    settlement_notes: '',
    given_by: '',
    given_by_user_id: null as string | null,
  })
  const [showNote, setShowNote] = useState(false)

  useEffect(() => {
    setReferralId(savedReferral)
    setAmount(String(savedAmount))
  }, [savedReferral, savedAmount])

  const typedAmount = parseInt(amount, 10) || 0
  const dirty = referralId !== savedReferral || typedAmount !== savedAmount
  const editable = (canPrice && !settled) || (isAdmin && (!settled || editingPaid))

  const patchBilling = async (fields: Record<string, unknown>) => {
    const response = await fetch(`/api/patients/${patientId}/billing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_id: billing.id, ...fields }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body?.error || 'Failed to save the referral')
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await patchBilling({ referral_id: referralId || null, referral_commission_amount: referralId ? typedAmount : 0 })
      setEditingPaid(false)
      onChanged()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const payNow = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await patchBilling({
        referral_settled: true,
        referral_settlement_date: new Date().toISOString(),
        referral_settlement_payment_method: pay.payment_method,
        referral_settlement_transaction_ref: pay.payment_method === 'cash' ? '' : pay.transaction_reference,
        referral_settlement_notes: pay.settlement_notes,
        referral_settlement_given_by: pay.given_by,
        referral_given_by_user_id: pay.given_by_user_id,
      })
      setPaying(false)
      setShowNote(false)
      setPay({ payment_method: 'cash', transaction_reference: '', settlement_notes: '', given_by: '', given_by_user_id: null })
      onChanged()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-hover rounded-lg p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Referral commission</h3>
        {settled ? (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-success-subtle text-success-text">
            <Check className="h-3 w-3" /> Paid
          </span>
        ) : savedReferral && savedAmount > 0 ? (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-warning-subtle text-warning-text">
            Not paid
          </span>
        ) : null}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {settled && !editingPaid ? (
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-foreground">
              <span className="font-medium">{billing.referral?.name || '—'}</span> · {inr(savedAmount)}
            </p>
            <CommissionStamps billing={billing} />
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setEditingPaid(true)} className="text-info text-sm hover:underline">
              Edit
            </button>
          )}
        </div>
      ) : editable ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_auto] gap-3 items-end">
            <ReferralSelect value={referralId} onChange={setReferralId} />
            <div>
              <label htmlFor="referral-amount" className="block text-sm text-muted mb-1">Commission (₹)</label>
              <input
                id="referral-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                disabled={!referralId}
                onFocus={e => e.target.select()}
                onChange={e => /^\d*$/.test(e.target.value) && setAmount(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="bg-info hover:bg-info-hover text-foreground px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Save
              </button>
              {editingPaid && (
                <button type="button" onClick={() => setEditingPaid(false)} className="px-3 py-2 text-muted hover:text-foreground">
                  Cancel
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted">
            Paid to the referrer out of the patient&apos;s payments — an expense of this patient, never billed to them.
          </p>

          {!settled && savedReferral && savedAmount > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-muted">
                {dirty ? 'Save the change before paying.' : `${billing.referral?.name} · ${inr(savedAmount)}`}
              </span>
              <button
                type="button"
                onClick={() => setPaying(true)}
                disabled={busy || dirty}
                className="bg-success hover:bg-success-hover text-foreground px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Pay {inr(savedAmount)}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          {savedReferral ? `${billing.referral?.name} · ${inr(savedAmount)}` : 'No referral on this stay.'}
          {settled && ' Only an admin can change it now.'}
        </p>
      )}

      {/* The same short form as paying a doctor fee (round 9). */}
      {paying && (
        <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
          <form
            onSubmit={payNow}
            className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-foreground">Pay {billing.referral?.name}</h4>
                <p className="text-sm text-muted">Referral commission</p>
              </div>
              <button type="button" onClick={() => setPaying(false)} className="text-muted hover:text-foreground" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="referral-mode" className="block text-sm text-muted mb-1">Paid by</label>
                <select
                  id="referral-mode"
                  value={pay.payment_method}
                  onChange={e => setPay({ ...pay, payment_method: e.target.value })}
                  className={inputClass}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              {pay.payment_method !== 'cash' && (
                <div>
                  <label htmlFor="referral-ref" className="block text-sm text-muted mb-1">
                    Reference{pay.payment_method === 'upi' ? ' *' : ''}
                  </label>
                  <input
                    id="referral-ref"
                    required={pay.payment_method === 'upi'}
                    value={pay.transaction_reference}
                    onChange={e => setPay({ ...pay, transaction_reference: e.target.value })}
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <GivenByPicker
              value={{ given_by_user_id: pay.given_by_user_id, given_by: pay.given_by }}
              onChange={next => setPay({ ...pay, given_by_user_id: next.given_by_user_id, given_by: next.given_by })}
            />

            {showNote ? (
              <textarea
                rows={2}
                placeholder="Note"
                value={pay.settlement_notes}
                onChange={e => setPay({ ...pay, settlement_notes: e.target.value })}
                className={inputClass}
              />
            ) : (
              <button type="button" onClick={() => setShowNote(true)} className="text-sm text-info hover:underline">
                + Add a note
              </button>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Paying…' : `Pay ${inr(savedAmount)}`}
              </button>
              <button type="button" onClick={() => setPaying(false)} className="bg-surface-inset text-foreground px-6 py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
