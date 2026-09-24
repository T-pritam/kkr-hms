/**
 * Paying a doctor's fee or a referral commission — one path (PRD v2, CR-13).
 *
 * There were two, and they disagreed. `POST /api/doctor-settlements/settle`,
 * behind the patient's Billing tab, marked fees settled and wrote **nothing**
 * to the ledger; `POST /api/finances/doctor-settlements`, behind the Finances
 * screen, wrote a ledger OUT. So the same payout was money out of the hospital
 * on one screen and invisible on the other, depending on which button someone
 * happened to press (gaps G-09 … G-12). Everything that pays comes through here.
 *
 * **A payout no longer touches the ledger at all** (client revision,
 * 2026-09-24, superseding Q-37 = B). In their words: *"they take money directly
 * from the admin and handover to the concerned person directly, so there is no
 * ledger entry required (so ledger has no out payment)."* The cash never
 * reaches the desk's drawer, so booking it through the desk's cash book was
 * describing a movement that never happened — and it made the ledger disagree
 * with the settlement rows, because settling from the patient's Billing tab
 * never wrote a debit in the first place.
 *
 * So **the settlement row is the whole record**, and Finances counts money out
 * by reading those rows (lib/finances/overview.ts). Two things follow:
 *
 *   * Un-paying is just un-paying. There is no closed ledger row to reopen
 *     first, so the `ENTRY_LOCKED` refusal is gone, as is `adjustPayoutLedger-
 *     Amount` — correcting a settled amount is now one UPDATE on one row.
 *   * The row has to carry who did what, because nothing else records it. See
 *     the three stamps below.
 *
 * The rules that survive:
 *   * Q-37 (b) — paying less than was priced makes the amount paid the fee's
 *     total; the bill then recalculates from it.
 *   * Q-19 — reception may pay out too.
 *   * A doctor fee and a referral commission are always the patient's expense,
 *     paid from the patient's money (requirement 12, point 2).
 *
 * A payout still records *how* it was paid. Nothing downstream needs the mode
 * now, but a record of handing over ₹3,000 that cannot say whether it was cash
 * or UPI is worth less than one that can, and both Settle dialogs already ask.
 */

import { isAdmin, type Actor } from '@/lib/authz/ownership'
import { PAYMENT_MODES, type PaymentMode } from '@/lib/ledger/transactions'
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
  /** The user who physically handed the money over. */
  given_by_user_id?: unknown
  /** A name typed instead, for someone with no login. */
  given_by?: unknown
}

export interface PayoutValues {
  payment_method: PaymentMode
  transaction_reference: string | null
  notes: string | null
  given_by_user_id: string | null
  given_by: string | null
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

  const givenByUserId = String(details.given_by_user_id ?? '').trim()
  const givenByName = String(details.given_by ?? '').trim()

  return {
    ok: true,
    value: {
      payment_method: mode,
      transaction_reference: reference || null,
      notes: String(details.notes ?? '').trim() || null,
      given_by_user_id: givenByUserId || null,
      // A picked user is the record; the typed name is only for someone who has
      // no login, so it is dropped rather than kept alongside and contradicting.
      given_by: givenByUserId ? null : givenByName || null,
    },
  }
}

/**
 * Who handed the money over, and who says so.
 *
 * Whoever marks the payout paid is the default — that is the common case, and a
 * blank "given by" on a row that plainly cost the hospital money is worse than
 * a sensible default someone can correct. Picking a different user, or typing a
 * name for someone with no login, overrides it.
 */
function givenByFields(
  actor: Actor,
  values: PayoutValues,
  now: string,
  cols: { userId: string; name: string; setBy: string; setAt: string },
) {
  const named = values.given_by_user_id || values.given_by
  return {
    [cols.userId]: named ? values.given_by_user_id : actor.id,
    [cols.name]: values.given_by,
    [cols.setBy]: actor.id,
    [cols.setAt]: now,
  }
}

/**
 * The two payouts spell these differently — the commission's free-text column
 * was `referral_settlement_given_by` long before a doctor fee had one at all,
 * and renaming a live column to tidy that up is not worth the migration.
 */
const FEE_GIVEN_BY = {
  userId: 'given_by_user_id',
  name: 'given_by',
  setBy: 'given_by_set_by',
  setAt: 'given_by_set_at',
} as const

const COMMISSION_GIVEN_BY = {
  userId: 'referral_given_by_user_id',
  name: 'referral_settlement_given_by',
  setBy: 'referral_given_by_set_by',
  setAt: 'referral_given_by_set_at',
} as const

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
 * The refusal is a 403, not the 409 `ENTRY_LOCKED` a closed ledger row used to
 * give: there is nothing reception can reopen to proceed, so this is a *who*
 * answer.
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
 * Pay one doctor fee row.
 *
 * `amount` is what is actually handed over. It becomes the row's total (Q-37 b),
 * because a fee priced at ₹3,000 and paid at ₹2,500 cost the hospital ₹2,500 —
 * and the patient's expenses have to agree with the cash that left.
 *
 * `settlement_amount` and `total_amount` are written to the same number on
 * purpose. Older rows disagree (one settled fee had total 0 against settlement
 * 1,000), and money out and the patient's Overview read different ones, so a
 * row that disagrees with itself shows two different figures on two screens.
 */
export async function payDoctorFee(
  db: Db,
  actor: Actor,
  settlement: any,
  args: { amount: number; details: PayoutValues; settlementType?: string },
): Promise<{ ok: true; settlement: any } | Refusal> {
  if (settlement.settled) {
    return { ok: false, status: 409, error: 'That fee has already been paid', code: 'ALREADY_PAID' }
  }

  const amount = Number(args.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'The amount paid must be more than 0' }
  }

  const now = new Date().toISOString()
  const visitCount = Number(settlement.visit_count) || 1

  const { data: updated, error } = await db
    .from('doctor_visit_settlements')
    .update({
      settled: true,
      settlement_date: now,
      settlement_amount: amount,
      // What was paid is what it cost (Q-37 b).
      total_amount: amount,
      amount_per_visit: amount / visitCount,
      payment_method: args.details.payment_method,
      transaction_reference: args.details.transaction_reference,
      settlement_notes: args.details.notes,
      settlement_type: args.settlementType || 'regular',
      settled_by: actor.id,
      // Paying restates the amount, so it is this actor's amount now.
      amount_set_by: actor.id,
      amount_set_at: now,
      status_set_by: actor.id,
      status_set_at: now,
      ...givenByFields(actor, args.details, now, FEE_GIVEN_BY),
      updated_by: actor.id,
      updated_at: now,
    })
    .eq('id', settlement.id)
    .select('*, doctor:doctors(id, name), patient:patients(id, patient_id, name)')
    .single()

  if (error) throw error

  if (updated?.patient_billing_id) {
    await recalculatePatientBilling(db as any, updated.patient_billing_id)
  }

  return { ok: true, settlement: updated }
}

/**
 * Un-pay a doctor fee (AC-13.2).
 *
 * `status_set_by` is stamped rather than cleared: "who un-paid this?" had no
 * answer before, because `settled_by` is wiped by the reversal it is meant to
 * explain.
 */
export async function unpayDoctorFee(
  db: Db,
  actor: Actor,
  settlement: any,
): Promise<{ ok: true } | Refusal> {
  const now = new Date().toISOString()

  const { error } = await db
    .from('doctor_visit_settlements')
    .update({
      settled: false,
      settlement_date: null,
      settlement_amount: null,
      settled_by: null,
      // Nobody handed anything over any more.
      given_by_user_id: null,
      given_by: null,
      given_by_set_by: null,
      given_by_set_at: null,
      status_set_by: actor.id,
      status_set_at: now,
      updated_by: actor.id,
      updated_at: now,
    })
    .eq('id', settlement.id)

  // Sync may have created a newer pending row for the same doctor and purpose,
  // and the partial unique index says only one may be live.
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
): Promise<{ ok: true } | Refusal> {
  if (billing.referral_settled) {
    return { ok: false, status: 409, error: 'That commission has already been paid', code: 'ALREADY_PAID' }
  }

  const amount = Number(billing.referral_commission_amount) || 0
  if (amount <= 0) {
    return { ok: false, status: 400, error: 'There is no commission to pay on this patient' }
  }

  const now = new Date().toISOString()

  const { error } = await db
    .from('patient_billing')
    .update({
      referral_settled: true,
      referral_settlement_date: now,
      referral_settlement_notes: args.details.notes,
      referral_settlement_payment_method: args.details.payment_method,
      referral_transaction_ref: args.details.transaction_reference,
      referral_status_set_by: actor.id,
      referral_status_set_at: now,
      ...givenByFields(actor, args.details, now, COMMISSION_GIVEN_BY),
      updated_by: actor.id,
    })
    .eq('id', billing.id)

  if (error) throw error

  return { ok: true }
}

export async function unpayReferralCommission(
  db: Db,
  actor: Actor,
  billing: any,
): Promise<{ ok: true } | Refusal> {
  const now = new Date().toISOString()

  const { error } = await db
    .from('patient_billing')
    .update({
      referral_settled: false,
      referral_settlement_date: null,
      referral_given_by_user_id: null,
      referral_settlement_given_by: null,
      referral_given_by_set_by: null,
      referral_given_by_set_at: null,
      referral_status_set_by: actor.id,
      referral_status_set_at: now,
      updated_by: actor.id,
    })
    .eq('id', billing.id)

  if (error) throw error

  return { ok: true }
}
