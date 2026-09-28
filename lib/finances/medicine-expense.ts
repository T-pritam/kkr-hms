/**
 * Medicine the hospital carries for its patients (round 8, 26 Sep).
 *
 * Every medication charge is the hospital's expense: the patient's payments
 * cover it and the pharmacy bills the hospital. No question is asked when it is
 * saved, and nothing is ever "not decided". Lab is no longer here — the lab is
 * in-house, so a lab test is income, taken as a payment
 * (lib/billing/linked-charge.ts).
 *
 * **Derived, never stored.** The charge is the record — a charge whose catalogue
 * item is `pharmacy` — so there is only one copy and nothing to fall out of step.
 * Reception enters it from the patient's Charges tab, where they already work.
 *
 * The month is the charge's own `charge_date` (a plain `date`), not when the
 * pharmacy was paid: that dates the obligation beside the patient money that
 * funded it.
 */

import { MEDICINE_CATEGORY } from '@/lib/billing/medicine'

type Db = { from: (table: string) => any }

const num = (v: unknown) => Number(v) || 0

export interface MedicineCharge {
  id: string
  charge_date: string
  description: string
  category: string
  amount: number
  patient: { id: string | null; patient_id: string | null; name: string | null } | null
  /** Set on OPD medicine: the walk-in is not a registered patient. */
  opd?: boolean
}

export interface MedicineExpense {
  total: number
  count: number
  rows: MedicineCharge[]
}

/**
 * Medicine inside OPD walk-ins' payments (client, 28 Sep): the hospital's
 * expense too, dated the OPD day. The walk-in is named from the receipt.
 */
async function opdMedicine(db: Db, range: { start: string; end: string }): Promise<MedicineCharge[]> {
  const { data } = await db
    .from('daily_ledger_transactions')
    .select('id, transaction_date, description, medicine_expense, source')
    .eq('source', 'opd')
    .gte('transaction_date', range.start)
    .lte('transaction_date', range.end)

  return (data ?? [])
    .filter((row: any) => Number(row.medicine_expense) > 0)
    .map((row: any) => ({
      id: row.id,
      charge_date: String(row.transaction_date).slice(0, 10),
      description: 'Medicine (OPD)',
      category: MEDICINE_CATEGORY,
      amount: num(row.medicine_expense),
      patient: { id: null, patient_id: 'OPD', name: String(row.description || '').replace(/^OPD\s+/i, '') || 'Walk-in' },
      opd: true,
    }))
}

/**
 * Every medicine charge dated inside the month, with its patient.
 *
 * The category filter is applied in TypeScript rather than as a PostgREST
 * filter on the embedded catalogue item: an inner filter on an embedded table
 * silently drops rows whose `charge_item_id` is null.
 */
export async function medicineExpense(
  db: Db,
  range: { start: string; end: string },
): Promise<MedicineExpense> {
  const { data } = await db
    .from('patient_charges')
    .select(
      'id, charge_date, description, charge_type, amount, qty, ' +
        'charge_item:charge_items(id, name, category), ' +
        'patient:patients(id, patient_id, name)',
    )
    .gte('charge_date', range.start)
    .lte('charge_date', range.end)

  const one = (value: any) => (Array.isArray(value) ? value[0] : value) ?? null

  const rows: MedicineCharge[] = (data ?? [])
    .map((row: any) => {
      const item = one(row.charge_item)
      return {
        id: row.id,
        charge_date: row.charge_date,
        description: item?.name || row.description || row.charge_type || 'Medicine',
        category: item?.category ?? '',
        amount: num(row.amount) * (Number(row.qty) || 1),
        patient: one(row.patient),
      }
    })
    .filter((row: MedicineCharge) => row.category === MEDICINE_CATEGORY)
    .concat(await opdMedicine(db, range))
    .sort((a: MedicineCharge, b: MedicineCharge) =>
      a.charge_date === b.charge_date ? b.amount - a.amount : a.charge_date < b.charge_date ? 1 : -1,
    )

  return {
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    count: rows.length,
    rows,
  }
}
