/**
 * A patient payment and its ledger entry, kept as one record (PRD v2, CR-12).
 *
 * A payment lives in two tables: the installment on the bill
 * (`patient_billing_installments`, which "Paid" is summed from) and the credit in
 * the cash book (`daily_ledger_transactions`). They used to drift apart:
 *
 *   - the installment was saved *before* its ledger entry was validated, so a
 *     rejected ledger write (UPI without a reference) left a payment behind while
 *     the screen said "failed" — and the retry credited the patient twice (G-04);
 *   - editing or deleting a payment never touched its ledger entry (G-01);
 *   - the bill came from the request body and was never checked against the
 *     patient in the URL, while the ledger named the URL's patient (G-06);
 *   - the ledger entry was optional (`create_ledger_entry`), although no screen
 *     ever offered the choice (G-07).
 *
 * Every write now goes through here, in this order: validate everything that can
 * be validated without writing, then write the installment, then the ledger
 * entry — and if the ledger entry is refused, remove the installment again. Edits
 * and deletes move both rows together. The ledger screen can no longer change a
 * payment's entry on its own (app/api/ledger/transactions/[id]/route.ts).
 *
 * PostgREST has no multi-statement transactions, so "together" means validated up
 * front and compensated on failure, not atomic. With the validation moved first,
 * the only failures left between the two writes are the database being
 * unreachable.
 */

import { createLedgerTransaction, PAYMENT_MODES, type PaymentMode } from '@/lib/ledger/transactions'
import { ENTRY_LOCKED } from '@/lib/authz/ownership'
import { istToday } from '@/lib/dates/ist'

type Db = { from: (table: string) => any }

import {
  PAYMENT_KIND_LABELS,
  PAYMENT_KINDS,
  type PaymentKind,
} from '@/lib/billing/payment-labels'

export {
  DESK_PAYMENT_KINDS,
  PAYMENT_KIND_LABELS,
  PAYMENT_KINDS,
  isDeskPaymentKind,
  type DeskPaymentKind,
  type PaymentKind,
} from '@/lib/billing/payment-labels'

/** The ledger source each kind is booked under. */
const LEDGER_SOURCE = (kind: PaymentKind): 'patient' | 'registration' =>
  kind === 'registration' ? 'registration' : 'patient'

/** Ledger sources that belong to a patient payment and are edited through it. */
export const PAYMENT_LEDGER_SOURCES = ['patient', 'registration'] as const

export interface PaymentInput {
  amount: number
  payment_date: string
  payment_method: PaymentMode
  transaction_reference: string | null
  remarks: string | null
}

export type Refusal = {
  ok: false
  status: number
  error: string
  code?: string
  fieldErrors?: Record<string, string>
  closure?: unknown
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const text = (v: unknown): string | null => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * Field rules for a payment, checked before anything is written.
 *
 * `base` supplies the values of fields the caller left out — the stored payment
 * on an edit, so an edit that only changes the amount keeps everything else.
 * On a create there is no base: the date defaults to today (IST) and the mode to
 * cash, as they always have.
 */
export function validatePayment(
  body: any,
  base?: Partial<PaymentInput>,
): { ok: true; value: PaymentInput } | Refusal {
  const b = body ?? {}
  const pick = <K extends keyof PaymentInput>(key: K, fallback: PaymentInput[K]) =>
    b[key] === undefined ? (base?.[key] ?? fallback) : b[key]

  const fieldErrors: Record<string, string> = {}

  const amount = Number(pick('amount', NaN as unknown as number))
  if (!Number.isFinite(amount) || amount <= 0) {
    fieldErrors.amount = 'Enter an amount greater than 0'
  }

  const paymentDate = String(pick('payment_date', istToday() as string) || istToday())
  if (!isRealDate(paymentDate)) {
    fieldErrors.payment_date = 'Enter a valid date'
  }

  const method = String(pick('payment_method', 'cash') || 'cash') as PaymentMode
  if (!PAYMENT_MODES.includes(method)) {
    fieldErrors.payment_method = 'Choose a payment mode'
  }

  const reference = text(pick('transaction_reference', null))
  // A UPI receipt with no reference cannot be matched against the statement.
  if (method === 'upi' && !reference) {
    fieldErrors.transaction_reference = 'Reference number required for UPI payments'
  }

  const remarks = text(pick('remarks', null))

  const first = Object.values(fieldErrors)[0]
  if (first) return { ok: false, status: 400, error: first, fieldErrors }

  return {
    ok: true,
    value: {
      amount,
      payment_date: paymentDate,
      payment_method: method,
      transaction_reference: reference,
      remarks,
    },
  }
}

/**
 * A payment locks when its own ledger entry is Closed (§3.2, row 9) — not when
 * its date is, because dates no longer close (CR-06, CR-08). Editing or
 * deleting it then needs an admin to reopen that entry first.
 */
export async function paymentLocked(db: Db, installment: any): Promise<Refusal | null> {
  if (!installment?.ledger_transaction_id) return null

  const { data } = await db
    .from('daily_ledger_transactions')
    .select('status')
    .eq('id', installment.ledger_transaction_id)
    .maybeSingle()

  if (data?.status !== 'closed') return null

  return {
    ok: false,
    status: 409,
    error: 'This payment is closed in the ledger. An admin reopens it before it can be changed.',
    code: ENTRY_LOCKED,
  }
}

/** "Paid" is always re-summed from the installments, never incremented. */
export async function resumPaid(db: Db, billingId: string): Promise<number> {
  const { data } = await db
    .from('patient_billing_installments')
    .select('amount')
    .eq('patient_billing_id', billingId)

  const total = (data ?? []).reduce((sum: number, row: any) => sum + Number(row.amount), 0)

  await db.from('patient_billing').update({ patient_paid_amount: total }).eq('id', billingId)
  return total
}

/**
 * What the Ledger shows for a payment: the patient and, in brackets, the label —
 * "12/26 Ramesh Kumar (Advance)" (the client's point 5).
 */
async function ledgerDescription(
  db: Db,
  patientId: string,
  installmentNumber: number,
  kind: PaymentKind,
): Promise<string> {
  const { data: patient } = await db
    .from('patients')
    .select('patient_id, name')
    .eq('id', patientId)
    .maybeSingle()

  const label = PAYMENT_KIND_LABELS[kind] ?? PAYMENT_KIND_LABELS.regular
  return patient
    ? `${patient.patient_id} ${patient.name} (${label})`
    : `Patient installment payment #${installmentNumber} (${label})`
}

export interface RecordPaymentArgs {
  patientId: string
  billingId: string
  kind?: PaymentKind
  input: PaymentInput
  userId: string
  /** Decides whether the ledger credit is born Open or Closed (Q-25 = A). */
  userRole?: string | null
}

/**
 * Record a payment: installment + ledger credit, or neither.
 */
export async function recordPayment(
  db: Db,
  { patientId, billingId, kind = 'regular', input, userId, userRole }: RecordPaymentArgs,
): Promise<{ ok: true; installment: any; ledger: any } | Refusal> {
  if (!billingId) {
    return { ok: false, status: 400, error: 'patient_billing_id is required' }
  }

  const { data: billing } = await db
    .from('patient_billing')
    .select('id, patient_id')
    .eq('id', billingId)
    .maybeSingle()

  if (!billing || billing.patient_id !== patientId) {
    return { ok: false, status: 404, error: 'That billing record does not belong to this patient' }
  }

  if (kind === 'registration') {
    const { data: existing } = await db
      .from('patient_billing_installments')
      .select('id')
      .eq('patient_billing_id', billingId)
      .eq('kind', 'registration')
      .limit(1)

    if ((existing ?? []).length > 0) {
      return {
        ok: false,
        status: 409,
        error: 'The registration fee has already been collected for this stay',
        code: 'REGISTRATION_ALREADY_PAID',
      }
    }
  }

  const { data: last } = await db
    .from('patient_billing_installments')
    .select('installment_number')
    .eq('patient_billing_id', billingId)
    .order('installment_number', { ascending: false })
    .limit(1)

  const installmentNumber = last && last.length > 0 ? Number(last[0].installment_number) + 1 : 1

  const { data: installment, error: insertError } = await db
    .from('patient_billing_installments')
    .insert({
      patient_billing_id: billingId,
      installment_number: installmentNumber,
      amount: input.amount,
      payment_date: input.payment_date,
      payment_method: input.payment_method,
      transaction_reference: input.transaction_reference,
      remarks: input.remarks,
      kind,
      created_by: userId,
    })
    .select()
    .single()

  if (insertError) {
    // The unique index is the backstop for two "Collect now" clicks racing.
    if (insertError.code === '23505' && kind === 'registration') {
      return {
        ok: false,
        status: 409,
        error: 'The registration fee has already been collected for this stay',
        code: 'REGISTRATION_ALREADY_PAID',
      }
    }
    throw insertError
  }

  const ledger = await createLedgerTransaction(
    db,
    {
      transaction_date: input.payment_date,
      transaction_type: 'credit',
      source: LEDGER_SOURCE(kind),
      amount: input.amount,
      payment_mode: input.payment_method,
      reference_number: input.transaction_reference,
      patient_id: patientId,
      description: await ledgerDescription(db, patientId, installmentNumber, kind),
      notes: input.remarks,
      created_by: userId,
      created_by_role: userRole,
    },
    { allowedSources: [...PAYMENT_LEDGER_SOURCES] },
  )

  if (!ledger.ok) {
    // Undo, so a refused ledger entry never leaves a payment counted in "Paid".
    await db.from('patient_billing_installments').delete().eq('id', installment.id)
    return {
      ok: false,
      status: ledger.status,
      error: ledger.error,
      ...(ledger.code ? { code: ledger.code, closure: ledger.closure } : {}),
    }
  }

  const ledgerRow = ledger.rows[0]

  await db
    .from('patient_billing_installments')
    .update({ ledger_transaction_id: ledgerRow.id })
    .eq('id', installment.id)

  await resumPaid(db, billingId)

  if (kind === 'registration') {
    await db.from('patient_billing').update({ registration_fee_status: 'collected' }).eq('id', billingId)
  }

  return { ok: true, installment: { ...installment, ledger_transaction_id: ledgerRow.id }, ledger: ledgerRow }
}

/**
 * Change a payment and its ledger entry together.
 *
 * The caller (the route) has already checked ownership and the ledger lock, and
 * validated `input` against the stored row.
 */
export async function updatePayment(
  db: Db,
  {
    installment,
    input,
    userId,
    kind,
  }: { installment: any; input: PaymentInput; userId: string; kind?: PaymentKind },
): Promise<{ ok: true; installment: any } | Refusal> {
  const currentKind: PaymentKind = (PAYMENT_KINDS as readonly string[]).includes(installment.kind)
    ? installment.kind
    : 'regular'
  const nextKind: PaymentKind = kind ?? currentKind

  const { data: billing } = await db
    .from('patient_billing')
    .select('patient_id')
    .eq('id', installment.patient_billing_id)
    .maybeSingle()
  const patientId: string | null = billing?.patient_id ?? null
  const installmentNumber = Number(installment.installment_number) || 1

  const ledgerFields: Record<string, unknown> = {
    transaction_date: input.payment_date,
    amount: input.amount,
    payment_mode: input.payment_method,
    reference_number: input.transaction_reference,
    notes: input.remarks,
  }
  // A relabelled payment reads its new label in the Ledger too.
  if (nextKind !== currentKind && patientId) {
    ledgerFields.description = await ledgerDescription(db, patientId, installmentNumber, nextKind)
  }

  let ledgerId: string | null = installment.ledger_transaction_id ?? null

  if (ledgerId) {
    const { data: updated, error } = await db
      .from('daily_ledger_transactions')
      .update(ledgerFields)
      .eq('id', ledgerId)
      .select('id')

    if (error) throw error
    // The entry was deleted from under the payment (before this rule existed).
    if (!updated || updated.length === 0) ledgerId = null
  }

  if (!ledgerId) {
    // A payment with no ledger entry — written before entries were mandatory, or
    // orphaned by an old ledger-screen delete. Editing it heals the pair.
    const created = await createLedgerTransaction(
      db,
      {
        transaction_date: input.payment_date,
        amount: input.amount,
        notes: input.remarks,
        transaction_type: 'credit',
        source: LEDGER_SOURCE(nextKind),
        payment_mode: input.payment_method,
        reference_number: input.transaction_reference,
        patient_id: patientId,
        description: patientId
          ? await ledgerDescription(db, patientId, installmentNumber, nextKind)
          : `Patient installment payment #${installmentNumber} (${PAYMENT_KIND_LABELS[nextKind]})`,
        created_by: userId,
      },
      { allowedSources: [...PAYMENT_LEDGER_SOURCES] },
    )

    if (!created.ok) {
      return { ok: false, status: created.status, error: created.error, code: created.code }
    }
    ledgerId = created.rows[0].id
  }

  const { data, error } = await db
    .from('patient_billing_installments')
    .update({
      amount: input.amount,
      payment_date: input.payment_date,
      payment_method: input.payment_method,
      transaction_reference: input.transaction_reference,
      remarks: input.remarks,
      kind: nextKind,
      ledger_transaction_id: ledgerId,
      updated_by: userId,
    })
    .eq('id', installment.id)
    .select()
    .single()

  if (error) {
    // Put the ledger entry back the way the payment still says it is.
    await db
      .from('daily_ledger_transactions')
      .update({
        transaction_date: installment.payment_date,
        amount: installment.amount,
        payment_mode: installment.payment_method,
        reference_number: installment.transaction_reference ?? null,
        notes: installment.remarks ?? null,
      })
      .eq('id', ledgerId)
    throw error
  }

  await resumPaid(db, installment.patient_billing_id)

  return { ok: true, installment: data }
}

/**
 * Delete a payment and its ledger entry together.
 *
 * The caller has already checked ownership, closed days and verification.
 */
export async function deletePayment(db: Db, installment: any): Promise<void> {
  const { error } = await db.from('patient_billing_installments').delete().eq('id', installment.id)
  if (error) throw error

  if (installment.ledger_transaction_id) {
    const { error: ledgerError } = await db
      .from('daily_ledger_transactions')
      .delete()
      .eq('id', installment.ledger_transaction_id)

    if (ledgerError) {
      // The payment is gone; its entry is now an orphan an admin can see and remove.
      console.error('Payment deleted but its ledger entry could not be removed:', ledgerError)
    }
  }

  await resumPaid(db, installment.patient_billing_id)

  // Deleting the registration payment puts the fee back to "not collected".
  if (installment.kind === 'registration') {
    await db
      .from('patient_billing')
      .update({ registration_fee_status: 'pending' })
      .eq('id', installment.patient_billing_id)
      .eq('registration_fee_status', 'collected')
  }
}

/**
 * For a set of ledger rows, which of them belong to a payment.
 *
 * One query for the whole list, so screens can hide the ledger-side edit on
 * those rows and link to the patient instead.
 */
export async function paymentLinks(db: Db, ledgerIds: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>()
  if (ledgerIds.length === 0) return links

  const { data } = await db
    .from('patient_billing_installments')
    .select('id, ledger_transaction_id')
    .in('ledger_transaction_id', ledgerIds)

  for (const row of data ?? []) {
    if (row.ledger_transaction_id) links.set(row.ledger_transaction_id, row.id)
  }
  return links
}
