/**
 * Medicine is always the hospital's expense (client revision, 26 Sep).
 *
 * A medication charge is covered by the patient's payments and the pharmacy
 * bills the hospital, so its amount is an expense from the day it is dated.
 * The desk is no longer asked anything: medicine bought at the counter or
 * outside is simply never entered. There is no "not decided" state.
 *
 * Which charge is medicine: one from a `pharmacy` catalogue item. The expense is
 * worked out from those charges, never stored
 * (lib/finances/medicine-expense.ts, the patient's Overview).
 *
 * History: until 26 Sep this was "lab & medicine", with an included / paid
 * directly question at save and a `lab_medicine_status` column. Lab is now
 * in-house income, taken as a payment (lib/billing/linked-charge.ts); the
 * column stays in the database, unused.
 */

export const MEDICINE_CATEGORY = 'pharmacy'

export const isMedicineCategory = (category: string | null | undefined): boolean =>
  category === MEDICINE_CATEGORY

/** What the desk is told when a medication charge is saved. */
export const MEDICINE_SAVED_MESSAGE = 'Added as an expense only.'
