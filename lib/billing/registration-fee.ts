/**
 * The registration fee (PRD v2, CR-11).
 *
 * Decided with the client (PRD v2 §9):
 *   - Q-40 A  The fee is the Charge Catalogue entry flagged `is_registration_fee`
 *             (the seeded "Registration", code REG). Only admin may change it.
 *   - Q-41 A  Offered when a patient is registered.
 *   - Q-42 B  The desk may change the pre-filled amount; 0 waives it.
 *   - Q-43    "Collected" starts unticked. Left unticked, the fee is still charged
 *             and the patient shows "registration fee not collected" with a
 *             "Collect now" button until it is paid.
 *   - Q-44 A  UPI needs a reference, like every UPI entry.
 *   - Q-45 B  It is a charge line (services used) *and* a payment.
 *   - Q-46 B  It shows as its own type — installment kind / ledger source
 *             `registration`.
 *   - Q-47    Whoever can register a patient takes the fee and owns the entries.
 *   - Req 11  Collected only as cash or UPI.
 */

import { recalculatePatientBilling } from '@/lib/recalculate-billing'
import { istToday } from '@/lib/dates/ist'
import { recordPayment } from '@/lib/billing/payments'

type Db = { from: (table: string) => any }

/** Req 11: the registration form offers these two only. */
export const REGISTRATION_FEE_MODES = ['cash', 'upi'] as const
export type RegistrationFeeMode = (typeof REGISTRATION_FEE_MODES)[number]

export interface RegistrationFeeItem {
  id: string
  name: string
  amount: number
}

export interface RegistrationFeeInput {
  amount: number
  collected: boolean
  payment_method: RegistrationFeeMode
  transaction_reference: string | null
}

export type RegistrationFeeOutcome =
  | { status: 'collected'; amount: number; installment_id: string }
  | { status: 'not_collected'; amount: number }
  | { status: 'waived'; amount: 0 }
  | { status: 'not_configured' }
  | { status: 'failed'; amount: number; error: string }

/** The catalogue entry the fee comes from, or null if none is flagged/active. */
export async function getRegistrationFeeItem(db: Db): Promise<RegistrationFeeItem | null> {
  const { data } = await db
    .from('charge_items')
    .select('id, name, default_price, is_active')
    .eq('is_registration_fee', true)
    .maybeSingle()

  if (!data || data.is_active === false) return null
  return { id: data.id, name: data.name, amount: Number(data.default_price) || 0 }
}

/**
 * The fee block from the registration form, checked before the patient is
 * written — a bad fee must not leave a half-finished registration behind.
 *
 * `undefined`/`null` means the form sent no fee block (older clients, API use):
 * the patient is registered exactly as before.
 */
export function parseRegistrationFee(
  raw: unknown,
): { ok: true; value: RegistrationFeeInput | null } | { ok: false; error: string; fieldErrors: Record<string, string> } {
  if (raw === undefined || raw === null) return { ok: true, value: null }

  const r = raw as Record<string, unknown>
  const fieldErrors: Record<string, string> = {}

  const amount = r.amount === '' || r.amount === undefined || r.amount === null ? NaN : Number(r.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    fieldErrors['registration_fee.amount'] = 'Enter the registration fee (0 to waive it)'
  }

  const collected = r.collected === true || r.collected === 'true'
  const method = String(r.payment_method || 'cash') as RegistrationFeeMode
  const reference = r.transaction_reference == null ? '' : String(r.transaction_reference).trim()

  if (collected && amount > 0) {
    if (!(REGISTRATION_FEE_MODES as readonly string[]).includes(method)) {
      fieldErrors['registration_fee.payment_method'] = 'Collect the registration fee as cash or UPI'
    }
    if (method === 'upi' && !reference) {
      fieldErrors['registration_fee.transaction_reference'] = 'Reference number required for UPI payments'
    }
  }

  const first = Object.values(fieldErrors)[0]
  if (first) return { ok: false, error: first, fieldErrors }

  return {
    ok: true,
    value: {
      amount,
      collected: collected && amount > 0,
      payment_method: method,
      transaction_reference: reference || null,
    },
  }
}

/**
 * Charge the fee on the new patient's bill and, if collected, record the
 * payment (installment + ledger credit).
 *
 * Runs after the patient and their bill exist. A failure here does not undo the
 * registration: the patient is registered, the fee shows as not collected, and
 * the desk collects it from the Payments tab. The outcome says which happened.
 */
export async function applyRegistrationFee(
  db: Db,
  args: {
    patientId: string
    billingId: string
    chargeDate: string
    fee: RegistrationFeeInput
    userId: string
  },
): Promise<RegistrationFeeOutcome> {
  const { patientId, billingId, chargeDate, fee, userId } = args

  const item = await getRegistrationFeeItem(db)
  if (!item) return { status: 'not_configured' }

  if (fee.amount <= 0) {
    await db.from('patient_billing').update({ registration_fee_status: 'waived' }).eq('id', billingId)
    return { status: 'waived', amount: 0 }
  }

  const { error: chargeError } = await db.from('patient_charges').insert({
    patient_billing_id: billingId,
    patient_id: patientId,
    charge_item_id: item.id,
    // Snapshotted, like every charge: a later rename of the catalogue entry
    // never rewrites an issued bill.
    charge_type: item.name,
    description: null,
    amount: fee.amount,
    qty: 1,
    billing_mode: 'one_time',
    charge_date: chargeDate,
    created_by: userId,
    updated_by: userId,
  })

  if (chargeError) {
    console.error('Registration fee charge could not be added:', chargeError)
    return { status: 'failed', amount: fee.amount, error: 'The registration fee could not be added to the bill' }
  }

  await recalculatePatientBilling(db as any, billingId)
  await db.from('patient_billing').update({ registration_fee_status: 'pending' }).eq('id', billingId)

  if (!fee.collected) return { status: 'not_collected', amount: fee.amount }

  const payment = await recordPayment(db, {
    patientId,
    billingId,
    kind: 'registration',
    input: {
      amount: fee.amount,
      // The money is received now, whatever date of joining was typed.
      payment_date: istToday(),
      payment_method: fee.payment_method,
      transaction_reference: fee.transaction_reference,
      remarks: null,
    },
    userId,
  })

  if (!payment.ok) {
    return { status: 'failed', amount: fee.amount, error: payment.error }
  }

  return { status: 'collected', amount: fee.amount, installment_id: payment.installment.id }
}
