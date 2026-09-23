/**
 * Paying a doctor's fee or a referral commission — one path (PRD v2, CR-13).
 *
 * There were two, and they disagreed. `POST /api/doctor-settlements/settle`,
 * behind the patient's Billing tab, marked fees settled and wrote **nothing**
 * to the ledger; `POST /api/finances/doctor-settlements`, behind the Finances
 * screen, wrote the ledger OUT. So the same payout was money out of the
 * hospital on one screen and invisible on the other, depending on which button
 * someone happened to press (gaps G-09 … G-12).
 *
 * Everything that pays now comes through here, and the payout carries the id of
 * the ledger row it wrote. That link is what makes un-paying reversible: the
 * row is deleted, not left behind as a debit for money that came back.
 *
 * The rules, all decided:
 *   * Q-37 = B — one ledger OUT per payout, whichever screen it came from.
 *   * Q-37 (b) — paying less than was priced makes the amount paid the fee's
 *     total; the bill then recalculates from it.
 *   * Q-19 — reception may pay out too. Their OUT is born Open and is closed by
 *     the admin with everything else; an admin's is born Closed (Q-25, Q-71).
 *   * A doctor fee and a referral commission are always the patient's expense,
 *     paid from the patient's money (requirement 12, point 2).
 */

import { isAdmin, type Actor } from '@/lib/authz/ownership'
import { istToday } from '@/lib/dates/ist'
import { createLedgerTransaction, PAYMENT_MODES, type PaymentMode } from '@/lib/ledger/transactions'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'

type Db = { from: (table: string) => any }

export type Refusal = {
  ok: false
  status: number
  error: string
  code?: string
  fieldErrors?: Record<string, string>
}

export interface PayoutDetails {
  payment_method?: unknown
  transaction_reference?: unknown
  notes?: unknown
}

export interface PayoutValues {
  payment_method: PaymentMode
  transaction_reference: string | null
  notes: string | null
}

/** Checked before anything is marked paid, so a refusal leaves nothing behind. */
export function validatePayout(details: PayoutDetails): { ok: true; value: PayoutValues } | Refusal {
  const mode = details.payment_method as PaymentMode
  if (!PAYMENT_MODES.includes(mode)) {
    return {
      ok: false,
      status: 400,
      error: 'Choose how this was paid',
      fieldErrors: { payment_method: 'Choose a payment mode' },
    }
  }

  const reference = String(details.transaction_reference ?? '').trim()
  if (mode === 'upi' && !reference) {
    return {
      ok: false,
      status: 400,
      error: 'A UPI payout needs its reference number',
      fieldErrors: { transaction_reference: 'Enter the UPI reference' },
    }
  }

  return {
    ok: true,
    value: {
      payment_method: mode,
      transaction_reference: reference || null,
      notes: String(details.notes ?? '').trim() || null,
    },
  }
}

/**
 * Who may still change a fee or a commission (client revision, 2026-09-24).
 *
 * This replaces the old own-row rule (PRD Q-20), under which whoever last set
 * an amount owned it and an admin-set price was read-only to the desk. The
 * client's reasoning for dropping it: every row already records who entered it,
 * who last set the amount and who marked it paid, so the audit trail answers
 * "who did this?" without the desk having to fetch an admin to fix a typo.
 *
 *   not settled  the desk shares it — any receptionist, or the admin
 *   settled      the admin's alone; reception can neither edit, un-settle
 *                nor delete it
 *
 * The refusal is a 403, not the 409 `ENTRY_LOCKED` a closed ledger row gives:
 * there is nothing reception can reopen to proceed, so this is a *who* answer.
 */
export function canAmendPayout(
  actor: Actor,
  row: { settled: boolean; noun?: string },
): { ok: true } | Refusal {
  if (!row.settled || isAdmin(actor)) return { ok: true }

  return {
    ok: false,
    status: 403,
    error: `This ${row.noun ?? 'entry'} has been settled. Only an admin can change it now.`,
    code: 'ADMIN_ONLY',
  }
}

/**
 * Restate what a payout cost, on the ledger row it already wrote.
 *
 * An admin correcting a settled fee from ₹3,000 to ₹2,500 is amending one fact,
 * not reversing a payment and making a new one — so the debit is updated in
 * place and the row stays settled. Three things this deliberately does not do:
 *
 *   * It does not refuse a **closed** ledger row. An admin's payout is born
 *     Closed, so refusing one would mean an admin could never correct their own
 *     payout — the exact thing this exists for. Removing a debit is a different
 *     act from restating one, so `unpayDoctorFee` keeps its closed-row refusal.
 *   * It writes only `amount`: `daily_ledger_transactions` has no `updated_by`,
 *     and touching `status`/`closed_at` would fall foul of the CHECK that says a
 *     closed row carries its closing time.
 *   * It tolerates a missing ledger id. Fees settled through the patient's
 *     Billing tab never wrote one (see the note on that route), and an
 *     amendment must not fail because of that older gap.
 */
export async function adjustPayoutLedgerAmount(
  db: Db,
  ledgerTransactionId: string | null | undefined,
  amount: number,
): Promise<{ ok: true; adjusted: boolean } | Refusal> {
  if (!ledgerTransactionId) return { ok: true, adjusted: false }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'The amount paid must be more than 0' }
  }

  const { error } = await db
    .from('daily_ledger_transactions')
    .update({ amount })
    .eq('id', ledgerTransactionId)

  if (error) throw error

  return { ok: true, adjusted: true }
}

/**
 * Pay one doctor fee row.
 *
 * `amount` is what is actually handed over. It becomes the row's total (Q-37 b),
 * because a fee priced at ₹3,000 and paid at ₹2,500 cost the hospital ₹2,500 —
 * and the patient's expenses have to agree with the cash that left.
 */
export async function payDoctorFee(
  db: Db,
  actor: Actor,
  settlement: any,
  args: { amount: number; details: PayoutValues; settlementType?: string },
): Promise<{ ok: true; settlement: any; ledger: any } | Refusal> {
  if (settlement.settled) {
    return { ok: false, status: 409, error: 'That fee has already been paid', code: 'ALREADY_PAID' }
  }

  const amount = Number(args.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'The amount paid must be more than 0' }
  }

  const { data: doctor } = await db
    .from('doctors')
    .select('name')
    .eq('id', settlement.doctor_id)
    .maybeSingle()

  // The ledger first: if the money cannot be booked, nothing is marked paid.
  // The other order leaves a doctor flagged as settled with no debit behind it.
  const ledger = await createLedgerTransaction(
    db,
    {
      transaction_date: istToday(),
      transaction_type: 'debit',
      source: 'doctor_settlement',
      amount,
      payment_mode: args.details.payment_method,
      reference_number: args.details.transaction_reference,
      patient_id: settlement.patient_id ?? null,
      description: `Doctor fee — ${doctor?.name || 'Doctor'}`,
      notes: args.details.notes,
      created_by: actor.id,
      created_by_role: actor.role,
    },
    { allowedSources: ['doctor_settlement'] },
  )

  if (!ledger.ok) {
    return { ok: false, status: ledger.status, error: ledger.error, code: ledger.code }
  }

  const ledgerRow = ledger.rows[0]
  const visitCount = Number(settlement.visit_count) || 1

  const { data: updated, error } = await db
    .from('doctor_visit_settlements')
    .update({
      settled: true,
      settlement_date: new Date().toISOString(),
      settlement_amount: amount,
      // What was paid is what it cost (Q-37 b).
      total_amount: amount,
      amount_per_visit: amount / visitCount,
      payment_method: args.details.payment_method,
      transaction_reference: args.details.transaction_reference,
      settlement_notes: args.details.notes,
      settlement_type: args.settlementType || 'regular',
      ledger_transaction_id: ledgerRow.id,
      settled_by: actor.id,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settlement.id)
    .select('*, doctor:doctors(id, name), patient:patients(id, patient_id, name)')
    .single()

  if (error) {
    // Undo the debit, so the ledger never shows money that never moved.
    await db.from('daily_ledger_transactions').delete().eq('id', ledgerRow.id)
    throw error
  }

  if (updated?.patient_billing_id) {
    await recalculatePatientBilling(db as any, updated.patient_billing_id)
  }

  return { ok: true, settlement: updated, ledger: ledgerRow }
}

/**
 * Un-pay a doctor fee: the debit goes with it (AC-13.2).
 *
 * A closed ledger row is not removed silently — an admin reopens it first, so
 * the reversal is visible in the same place the payment was.
 */
export async function unpayDoctorFee(
  db: Db,
  actor: Actor,
  settlement: any,
): Promise<{ ok: true } | Refusal> {
  if (settlement.ledger_transaction_id) {
    const { data: entry } = await db
      .from('daily_ledger_transactions')
      .select('status')
      .eq('id', settlement.ledger_transaction_id)
      .maybeSingle()

    if (entry?.status === 'closed') {
      return {
        ok: false,
        status: 409,
        error:
          'This payout is closed in the ledger. Reopen that entry first, so the reversal is recorded where the payment was.',
        code: 'ENTRY_LOCKED',
      }
    }

  }

  // The settlement first, the debit second. Reopening can be refused — sync may
  // have created a newer pending row for the same doctor and purpose, and the
  // partial unique index says only one may be live — and a refusal must not
  // leave the payout's ledger row already deleted.
  const { error } = await db
    .from('doctor_visit_settlements')
    .update({
      settled: false,
      settlement_date: null,
      settlement_amount: null,
      settled_by: null,
      ledger_transaction_id: null,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settlement.id)

  if (error?.code === '23505') {
    return {
      ok: false,
      status: 409,
      error:
        'There is already a newer pending settlement for this doctor and purpose. Settle or merge that one first before reopening this one.',
      code: 'DUPLICATE_PENDING',
    }
  }
  if (error) throw error

  if (settlement.ledger_transaction_id) {
    await db.from('daily_ledger_transactions').delete().eq('id', settlement.ledger_transaction_id)
  }

  if (settlement.patient_billing_id) {
    await recalculatePatientBilling(db as any, settlement.patient_billing_id)
  }

  return { ok: true }
}

/** Pay one patient's referral commission, the same way. */
export async function payReferralCommission(
  db: Db,
  actor: Actor,
  billing: any,
  args: { details: PayoutValues },
): Promise<{ ok: true; ledger: any } | Refusal> {
  if (billing.referral_settled) {
    return { ok: false, status: 409, error: 'That commission has already been paid', code: 'ALREADY_PAID' }
  }

  const amount = Number(billing.referral_commission_amount) || 0
  if (amount <= 0) {
    return { ok: false, status: 400, error: 'There is no commission to pay on this patient' }
  }

  const { data: patient } = await db
    .from('patients')
    .select('patient_id, name')
    .eq('id', billing.patient_id)
    .maybeSingle()

  const ledger = await createLedgerTransaction(
    db,
    {
      transaction_date: istToday(),
      transaction_type: 'debit',
      source: 'referral_commission',
      amount,
      payment_mode: args.details.payment_method,
      reference_number: args.details.transaction_reference,
      patient_id: billing.patient_id,
      description: patient
        ? `Referral commission — ${patient.patient_id} ${patient.name}`
        : 'Referral commission',
      notes: args.details.notes,
      created_by: actor.id,
      created_by_role: actor.role,
    },
    { allowedSources: ['referral_commission'] },
  )

  if (!ledger.ok) {
    return { ok: false, status: ledger.status, error: ledger.error, code: ledger.code }
  }

  const ledgerRow = ledger.rows[0]

  const { error } = await db
    .from('patient_billing')
    .update({
      referral_settled: true,
      referral_settlement_date: new Date().toISOString(),
      referral_settlement_notes: args.details.notes,
      referral_transaction_ref: args.details.transaction_reference,
      referral_ledger_transaction_id: ledgerRow.id,
      updated_by: actor.id,
    })
    .eq('id', billing.id)

  if (error) {
    await db.from('daily_ledger_transactions').delete().eq('id', ledgerRow.id)
    throw error
  }

  return { ok: true, ledger: ledgerRow }
}

export async function unpayReferralCommission(
  db: Db,
  actor: Actor,
  billing: any,
): Promise<{ ok: true } | Refusal> {
  if (billing.referral_ledger_transaction_id) {
    const { data: entry } = await db
      .from('daily_ledger_transactions')
      .select('status')
      .eq('id', billing.referral_ledger_transaction_id)
      .maybeSingle()

    if (entry?.status === 'closed') {
      return {
        ok: false,
        status: 409,
        error:
          'This payout is closed in the ledger. Reopen that entry first, so the reversal is recorded where the payment was.',
        code: 'ENTRY_LOCKED',
      }
    }

    await db
      .from('daily_ledger_transactions')
      .delete()
      .eq('id', billing.referral_ledger_transaction_id)
  }

  const { error } = await db
    .from('patient_billing')
    .update({
      referral_settled: false,
      referral_settlement_date: null,
      referral_ledger_transaction_id: null,
      updated_by: actor.id,
    })
    .eq('id', billing.id)

  if (error) throw error

  return { ok: true }
}
