/**
 * Lab and medicine the hospital carries for its patients (PRD v2, Q-83 revised).
 *
 * The client reversed the rule on 2026-09-24. An *Included* lab or medicine
 * charge used to be treated as the hospital's income: the patient's regular
 * payments covered it and the lab billed us separately, so it was reasoned that
 * nothing was owed from here. But the lab's bill does arrive, and it is the
 * hospital that pays it — so an Included amount is an **expense**, and an
 * *Excluded* one is not recorded at all, because the patient dealt with the lab
 * directly and that money never came near us.
 *
 * **Derived, never stored.** There is no row in `expenses` and no column on the
 * patient. The charge is the record — `lab_medicine_status = 'included'` on a
 * charge whose catalogue item is `lab` or `pharmacy` — for three reasons:
 *
 *   * Nothing can fall out of step, because there is only one copy.
 *   * Reception edits it from the patient's Charges tab, where they already
 *     work. Finances is admin-only, so a stored expense row would be a thing
 *     reception creates but cannot see.
 *   * Changing a charge's mind — Included, then not — is one UPDATE, not an
 *     insert and a delete that can half-fail.
 *
 * The month is the charge's own `charge_date` (a plain `date`, so no instant
 * arithmetic), not when the lab was paid. That dates the obligation beside the
 * patient money that funded it, which is the whole point of the reversal.
 */

type Db = { from: (table: string) => any }

const num = (v: unknown) => Number(v) || 0

/** The catalogue categories whose charges carry the lab/medicine question. */
export const LAB_MEDICINE_CATEGORIES = ['lab', 'pharmacy'] as const

export interface LabMedicineCharge {
  id: string
  charge_date: string
  description: string
  category: string
  amount: number
  patient: { id: string; patient_id: string | null; name: string | null } | null
}

export interface LabMedicineExpense {
  total: number
  count: number
  rows: LabMedicineCharge[]
}

/**
 * Every Included lab/medicine charge dated inside the month, with its patient.
 *
 * The category filter is applied in TypeScript rather than as a PostgREST
 * `charge_item.category=in.(...)` filter: an inner filter on an embedded table
 * silently drops rows whose `charge_item_id` is null, and a hand-typed charge
 * with no catalogue link is exactly the row an admin most needs to see when
 * checking what the hospital owes. Filtering here keeps the decision visible.
 */
export async function labMedicineExpense(
  db: Db,
  range: { start: string; end: string },
): Promise<LabMedicineExpense> {
  const { data } = await db
    .from('patient_charges')
    .select(
      'id, charge_date, description, charge_type, amount, qty, lab_medicine_status, ' +
        'charge_item:charge_items(id, name, category), ' +
        'patient:patients(id, patient_id, name)',
    )
    .eq('lab_medicine_status', 'included')
    .gte('charge_date', range.start)
    .lte('charge_date', range.end)

  const one = (value: any) => (Array.isArray(value) ? value[0] : value) ?? null

  const rows: LabMedicineCharge[] = (data ?? [])
    .map((row: any) => {
      const item = one(row.charge_item)
      return {
        id: row.id,
        charge_date: row.charge_date,
        description: item?.name || row.description || row.charge_type || 'Lab / medicine',
        category: item?.category ?? '',
        amount: num(row.amount) * (Number(row.qty) || 1),
        patient: one(row.patient),
      }
    })
    .filter((row: LabMedicineCharge) =>
      (LAB_MEDICINE_CATEGORIES as readonly string[]).includes(row.category),
    )
    .sort((a: LabMedicineCharge, b: LabMedicineCharge) =>
      a.charge_date === b.charge_date ? b.amount - a.amount : a.charge_date < b.charge_date ? 1 : -1,
    )

  return {
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    count: rows.length,
    rows,
  }
}
