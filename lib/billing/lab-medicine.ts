/**
 * Lab and medicine charges: included, or collected separately (PRD v2, CR-15).
 *
 * The client's rules (2026-09-22):
 *   - Only lab and medicine charges ask this question; every other charge is
 *     internal knowledge and moves no money.
 *   - **Excluded** is the default: the amount is collected from the patient
 *     separately, as its own payment labelled Lab or Medicine, which shows in
 *     the Ledger with the patient: "12/26 Ramesh Kumar (Medicine)". The desk
 *     either takes it there and then, or marks it to collect later.
 *   - **Included** means the patient's regular payments already cover it, so
 *     nothing extra is collected. That money stays with the hospital; the lab or
 *     pharmacy bills the hospital separately (2026-09-23), so nothing is booked
 *     as an expense here.
 *   - The desk is asked at the moment of saving (an alert), defaulting to
 *     excluded. All money comes in through the desk.
 *
 * Which charge is which: a charge from a `lab` catalogue item is lab, one from a
 * `pharmacy` item is medicine. The amount is typed on the charge — no
 * SmartPharma360 bill is involved (Q-63).
 *
 * States on `patient_charges.lab_medicine_status`:
 *   included    covered by regular payments
 *   to_collect  excluded, but not collected yet (a forwarded quote, or its
 *               payment was deleted) — the Charges tab offers "Collect now"
 *   collected   collected as payment `collected_installment_id`
 */

import { PAYMENT_KIND_LABELS, recordPayment, validatePayment, type Refusal } from '@/lib/billing/payments'
import { istToday } from '@/lib/dates/ist'

type Db = { from: (table: string) => any }

export type LabMedicineKind = 'lab' | 'medicine'
export type LabMedicineStatus = 'included' | 'to_collect' | 'collected'

/** The catalogue category that makes a charge lab or medicine. */
const KIND_BY_CATEGORY: Record<string, LabMedicineKind> = {
  lab: 'lab',
  pharmacy: 'medicine',
}

export function labMedicineKind(category: string | null | undefined): LabMedicineKind | null {
  return (category && KIND_BY_CATEGORY[category]) || null
}

export interface LabMedicineChoice {
  /**
   * What the desk answered when saving:
   *   collect   take the money now — a payment tagged Lab/Medicine
   *   later     excluded, but not collected yet: the charge reads
   *             "collect ₹x from the patient" and waits for Collect now
   *   included  the patient's regular payments already cover it
   */
  choice: 'collect' | 'later' | 'included'
  /** Only for `collect`. */
  payment?: {
    payment_method: string
    transaction_reference: string | null
  }
}

/**
 * The answer to the save-time alert, checked before anything is written.
 *
 * `undefined`/`null` — a caller that did not ask (an older client, or the API)
 * — leaves the charge excluded and not yet collected, which is the default the
 * client chose; nothing is collected without someone saying so.
 */
export function parseLabMedicineChoice(
  raw: unknown,
): { ok: true; value: LabMedicineChoice | null } | Refusal {
  if (raw === undefined || raw === null) return { ok: true, value: null }

  const r = raw as Record<string, unknown>
  if (r.choice === 'included') return { ok: true, value: { choice: 'included' } }
  if (r.choice === 'later') return { ok: true, value: { choice: 'later' } }

  if (r.choice !== 'collect') {
    return {
      ok: false,
      status: 400,
      error: 'Say whether this is collected now, collected later, or included in the payments',
      fieldErrors: { 'lab_medicine.choice': 'Choose one' },
    }
  }

  // Amount and date are filled in later from the charge; this checks the mode
  // and the UPI reference now, so a bad answer never leaves a half-saved charge.
  const check = validatePayment({
    amount: 1,
    payment_method: r.payment_method,
    transaction_reference: r.transaction_reference,
  })
  if (!check.ok) {
    return {
      ...check,
      fieldErrors: Object.fromEntries(
        Object.entries(check.fieldErrors ?? {}).map(([k, v]) => [`lab_medicine.${k}`, v]),
      ),
    }
  }

  return {
    ok: true,
    value: {
      choice: 'collect',
      payment: {
        payment_method: check.value.payment_method,
        transaction_reference: check.value.transaction_reference,
      },
    },
  }
}

/** The automatic note on a collected lab/medicine payment. */
export function collectionNote(kind: LabMedicineKind, chargeName: string): string {
  return `${PAYMENT_KIND_LABELS[kind]} — ${chargeName} (collected separately)`
}

/**
 * Collect one or more lab/medicine charge rows as a single payment.
 *
 * The rows are the ones a single entry produced (one row, or a per-day block).
 * The payment carries their total, today's date, and the automatic note, and is
 * written with its ledger credit (lib/billing/payments.ts). The rows then point
 * at it and read "collected".
 */
export async function collectCharges(
  db: Db,
  args: {
    patientId: string
    billingId: string
    kind: LabMedicineKind
    rows: Array<{ id: string; amount: number | string; qty?: number | string | null }>
    chargeName: string
    payment: { payment_method: string; transaction_reference: string | null }
    userId: string
  },
): Promise<{ ok: true; installment: any } | Refusal> {
  const total = args.rows.reduce((sum, r) => sum + Number(r.amount) * (Number(r.qty) || 1), 0)

  const check = validatePayment({
    amount: total,
    payment_date: istToday(),
    payment_method: args.payment.payment_method,
    transaction_reference: args.payment.transaction_reference,
    remarks: collectionNote(args.kind, args.chargeName),
  })
  if (!check.ok) return check

  const result = await recordPayment(db, {
    patientId: args.patientId,
    billingId: args.billingId,
    kind: args.kind,
    input: check.value,
    userId: args.userId,
  })
  if (!result.ok) return result

  const { error } = await db
    .from('patient_charges')
    .update({ lab_medicine_status: 'collected', collected_installment_id: result.installment.id })
    .in('id', args.rows.map(r => r.id))

  if (error) throw error

  return { ok: true, installment: result.installment }
}
