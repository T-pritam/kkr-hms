/**
 * An OPD walk-in's doctors and medicine (client, 28 Sep).
 *
 * An OPD receipt stays a ledger row — the walk-in is not registered — but it
 * can now say which doctor(s) saw them and what each is to be paid, and how
 * much of the payment was medicine:
 *
 *   doctors    each becomes a visit (purpose "Consultation") and a priced,
 *              unpaid fee row, hanging off the ledger row instead of a patient
 *              and a bill. The fee is paid like any other — from the doctor's
 *              page or Finances ▸ Settlements — and, once paid, is money out.
 *   medicine   optional. The walk-in's payment already includes it, so it is
 *              the hospital's expense (Finances ▸ Medicine), like medicine for
 *              an admitted patient.
 *
 * Written after the ledger row, and undone with it if anything fails. A paid
 * fee locks its OPD entry's doctors, and the entry can no longer be deleted.
 */

import { istFields } from '@/lib/consultations/ist'

type Db = { from: (table: string) => any }

export interface OpdDoctor {
  doctor_id: string
  fee: number
}

export interface OpdExtras {
  doctors: OpdDoctor[]
  medicine_expense: number | null
}

type Refusal = { ok: false; status: number; error: string; code?: string }

/** The OPD form's doctors and medicine, checked before anything is written. */
export function parseOpdExtras(body: any): { ok: true; value: OpdExtras } | Refusal {
  const rawDoctors = Array.isArray(body?.doctors) ? body.doctors : []
  const doctors: OpdDoctor[] = []
  const seen = new Set<string>()

  for (const raw of rawDoctors) {
    const doctorId = String(raw?.doctor_id ?? '').trim()
    if (!doctorId) continue
    const fee = Number(raw?.fee)
    if (!Number.isFinite(fee) || fee <= 0) {
      return { ok: false, status: 400, error: "Enter each doctor's fee (more than zero)" }
    }
    if (seen.has(doctorId)) {
      return { ok: false, status: 400, error: 'The same doctor is listed twice' }
    }
    seen.add(doctorId)
    doctors.push({ doctor_id: doctorId, fee: Math.round(fee * 100) / 100 })
  }

  let medicine: number | null = null
  if (body?.medicine_expense !== undefined && body?.medicine_expense !== null && body?.medicine_expense !== '') {
    medicine = Number(body.medicine_expense)
    if (!Number.isFinite(medicine) || medicine < 0) {
      return { ok: false, status: 400, error: 'Medicine must be an amount of zero or more' }
    }
    medicine = Math.round(medicine * 100) / 100
    if (medicine === 0) medicine = null
  }

  return { ok: true, value: { doctors, medicine_expense: medicine } }
}

async function consultationPurposeId(db: Db): Promise<string | null> {
  const { data } = await db.from('visit_purposes').select('id, code').eq('code', 'consultation').maybeSingle()
  return data?.id ?? null
}

/** Remove an OPD entry's unpaid visits and fees (before rewriting them). */
async function clearOpdVisits(db: Db, ledgerId: string): Promise<void> {
  await db.from('patient_consultations').delete().eq('opd_ledger_transaction_id', ledgerId)
  await db.from('doctor_visit_settlements').delete().eq('opd_ledger_transaction_id', ledgerId).eq('settled', false)
}

/** Whether any fee on this OPD entry is already paid — which locks it. */
export async function opdHasPaidFee(db: Db, ledgerId: string): Promise<boolean> {
  const { data } = await db
    .from('doctor_visit_settlements')
    .select('id')
    .eq('opd_ledger_transaction_id', ledgerId)
    .eq('settled', true)
    .is('deleted_at', null)
  return (data ?? []).length > 0
}

export const OPD_FEE_PAID =
  "A doctor's fee on this OPD visit is already paid, so its doctors can't change and it can't be deleted. An admin un-pays the fee first."

/**
 * Write (or rewrite) an OPD entry's doctors as visits and priced fee rows, and
 * its medicine amount. The caller has already written the ledger row.
 */
export async function writeOpdExtras(
  db: Db,
  args: { ledgerId: string; transactionDate: string; extras: OpdExtras; userId: string },
): Promise<{ ok: true } | Refusal> {
  const { ledgerId, transactionDate, extras, userId } = args

  const { error: medicineError } = await db
    .from('daily_ledger_transactions')
    .update({ medicine_expense: extras.medicine_expense })
    .eq('id', ledgerId)
  if (medicineError) return { ok: false, status: 500, error: 'The medicine amount could not be saved' }

  await clearOpdVisits(db, ledgerId)
  if (extras.doctors.length === 0) return { ok: true }

  const purposeId = await consultationPurposeId(db)
  if (!purposeId) {
    return { ok: false, status: 400, error: 'There is no "Consultation" visit purpose to record the OPD visit under' }
  }

  // The visit is dated the OPD day, at the time it is being recorded.
  const now = new Date()
  const time = istFields(now).time || '12:00'
  const visitAt = new Date(`${transactionDate}T${time}:00+05:30`).toISOString()
  const setAt = now.toISOString()

  for (const doctor of extras.doctors) {
    const { data: fee, error: feeError } = await db
      .from('doctor_visit_settlements')
      .insert({
        patient_id: null,
        patient_billing_id: null,
        opd_ledger_transaction_id: ledgerId,
        doctor_id: doctor.doctor_id,
        visit_purpose_id: purposeId,
        visit_count: 1,
        amount_per_visit: doctor.fee,
        total_amount: doctor.fee,
        settled: false,
        settlement_type: 'regular',
        amount_set_by: userId,
        amount_set_at: setAt,
        created_by: userId,
      })
      .select('id')
      .single()
    if (feeError || !fee) {
      await clearOpdVisits(db, ledgerId)
      return { ok: false, status: 500, error: "The doctor's fee could not be recorded" }
    }

    const { error: visitError } = await db.from('patient_consultations').insert({
      patient_id: null,
      opd_ledger_transaction_id: ledgerId,
      doctor_id: doctor.doctor_id,
      visit_purpose_id: purposeId,
      consultation_date: visitAt,
      visit_number: 1,
      settlement_id: fee.id,
      created_by: userId,
    })
    if (visitError) {
      await clearOpdVisits(db, ledgerId)
      return { ok: false, status: 500, error: 'The doctor visit could not be recorded' }
    }
  }

  return { ok: true }
}

/** What the OPD form shows when editing: the doctors, their fees, and medicine. */
export async function readOpdExtras(db: Db, ledgerId: string) {
  const { data: row } = await db
    .from('daily_ledger_transactions')
    .select('id, medicine_expense')
    .eq('id', ledgerId)
    .maybeSingle()
  const { data: fees } = await db
    .from('doctor_visit_settlements')
    .select('id, doctor_id, total_amount, settled, doctor:doctors(id, name)')
    .eq('opd_ledger_transaction_id', ledgerId)
    .is('deleted_at', null)

  const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
  return {
    medicine_expense: row?.medicine_expense != null ? Number(row.medicine_expense) : null,
    doctors: ((fees ?? []) as any[]).map(f => ({
      fee_id: f.id,
      doctor_id: f.doctor_id,
      doctor_name: one(f.doctor)?.name ?? null,
      fee: Number(f.total_amount) || 0,
      paid: Boolean(f.settled),
    })),
  }
}

/** An OPD receipt shown where a patient would be: "OPD · K Sandhya". */
export const opdPatient = (receipt: { description?: string | null } | null) =>
  receipt
    ? { id: null, patient_id: 'OPD', name: String(receipt.description || '').replace(/^OPD\s+/i, '') || 'Walk-in' }
    : null
