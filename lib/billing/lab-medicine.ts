/**
 * Lab and medicine: included, or paid straight to the lab (PRD v2, CR-15).
 *
 * The client's rules, as revised on 2026-09-24. They used to be three answers
 * and a payment; they are now two answers and no payment at all.
 *
 *   **Included in the patient's payments** — the patient's regular payments
 *   already cover it, so nothing extra is collected. The lab or pharmacy bills
 *   the hospital, so the amount is the hospital's **expense** (Q-83, reversed:
 *   it used to be counted as income). It appears in Finances → Expenses under
 *   "Lab & medicine", worked out from the charge rather than stored anywhere
 *   (lib/finances/lab-medicine-expense.ts).
 *
 *   **Paid directly to the lab / pharmacy** — the patient dealt with them
 *   themselves. The hospital never touched that money, so **nothing is recorded
 *   at all**: no charge, no payment, no ledger row (Q-82, reversed). The charge
 *   is not saved, and the dialog says so before it is dismissed, because a
 *   charge that silently vanishes on save is baffling.
 *
 * What went with the reversal: the `lab` and `medicine` payment labels, the
 * `to_collect` and `collected` charge states, the whole *Collect now* flow, and
 * `collected_installment_id`. There is no separate payment to collect any more.
 *
 * Which charge is which: a charge from a `lab` catalogue item is lab, one from a
 * `pharmacy` item is medicine. The amount is typed on the charge — no
 * SmartPharma360 bill is involved (Q-63).
 *
 * The one state left on `patient_charges.lab_medicine_status`:
 *   included   the hospital carries it, and owes the lab
 *   NULL       nobody has said yet; it shows as *not decided* on the patient's
 *              Overview and Charges tab, and counts as no expense until someone
 *              answers. Only an older client, or a charge forwarded from a
 *              charge sheet, leaves it this way.
 */

import type { Refusal } from '@/lib/billing/payments'

export type LabMedicineKind = 'lab' | 'medicine'
export type LabMedicineStatus = 'included'

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
   *   included  the patient's payments already cover it — save the charge, and
   *             the hospital carries the amount as an expense
   *   direct    the patient paid the lab themselves — save nothing at all
   */
  choice: 'included' | 'direct'
}

/**
 * The answer to the save-time alert, checked before anything is written.
 *
 * `undefined`/`null` — a caller that did not ask, such as an older client or a
 * charge sheet being forwarded — leaves the charge saved with no answer yet. It
 * reads as *not decided* and is no expense until somebody says otherwise. That
 * is the safe default in both directions: nothing is claimed as an expense
 * without a person saying so, and nothing is thrown away either.
 */
export function parseLabMedicineChoice(
  raw: unknown,
): { ok: true; value: LabMedicineChoice | null } | Refusal {
  if (raw === undefined || raw === null) return { ok: true, value: null }

  const r = raw as Record<string, unknown>
  if (r.choice === 'included') return { ok: true, value: { choice: 'included' } }
  if (r.choice === 'direct') return { ok: true, value: { choice: 'direct' } }

  return {
    ok: false,
    status: 400,
    error: 'Say whether this is included in the patient’s payments or paid directly to the lab',
    fieldErrors: { 'lab_medicine.choice': 'Choose one' },
  }
}
