/**
 * Payment receipts — the desk's "Cash Receipt" for a patient's payments
 * (client, 1 Oct).
 *
 * A receipt covers one payment or several. The app fills it in from the
 * patient's record, their doctor visits and the payments themselves, and the
 * desk may change everything but the amount before printing; what they typed
 * is kept, so the receipt reopens as it was.
 *
 *   starts from the app            the patient line ("Mr. Ravi Kumar"), age and
 *                                  sex, mobile, address, IP no, the doctors who
 *                                  visited (each with their designation, if the
 *                                  Doctors list has one), the first doctor's
 *                                  department, and each row's date, mode, type
 *                                  and remarks
 *   typed by the desk, required    the receipt number, from their own book
 *   never typed, never stored      the amount — always the payment's own
 */

import { resolveAge } from '@/lib/patients/age'
import type { AgeSubject } from '@/lib/patients/age'
import { PAYMENT_KIND_LABELS, type PaymentKind } from '@/lib/billing/payment-labels'

type Db = { from: (table: string) => any }

export const DEFAULT_HEADING = 'Cash Receipt'
export const MAX_RECEIPT_LINES = 50
export const MAX_RECEIPT_DOCTORS = 8

export interface ReceiptLineFields {
  installment_id: string
  /** YYYY-MM-DD, or null to leave the date blank. */
  line_date: string | null
  payment_mode: string
  transaction_type: string
  remarks: string
}

/**
 * A consultant doctor on a receipt: picked from the Doctors list or typed in,
 * with the designation the list has for them (or one typed over it).
 */
export interface ReceiptDoctor {
  name: string
  designation: string
}

/**
 * Receipts saved before designations (1 Oct) hold bare names; both shapes are
 * read as `{ name, designation }`.
 */
export function receiptDoctors(stored: unknown): ReceiptDoctor[] {
  if (!Array.isArray(stored)) return []
  return stored
    .map(entry =>
      typeof entry === 'string'
        ? { name: entry.trim(), designation: '' }
        : { name: String(entry?.name ?? '').trim(), designation: String(entry?.designation ?? '').trim() },
    )
    .filter(doctor => doctor.name)
}

export interface ReceiptHeaderFields {
  heading: string
  patient_name: string
  age_sex: string
  mobile: string
  address: string
  ip_no: string
  doctors: ReceiptDoctor[]
  department: string
}

export interface ReceiptFields extends ReceiptHeaderFields {
  receipt_no: string
  created_by_label: string
  lines: ReceiptLineFields[]
}

// ─── What the form starts with ──────────────────────────────────────────────

interface ReceiptPatient extends AgeSubject {
  name?: string | null
  patient_id?: string | null
  gender?: string | null
  phone?: string | null
  alternate_phone?: string | null
  address?: string | null
}

interface ReceiptVisit {
  consultation_date?: string | null
  doctor?: { id?: string | null; name?: string | null; department?: string | null; designation?: string | null } | null
}

/** "Mr." for a man, "Ms." for a woman, nothing when the record does not say. */
export function titleFor(gender: string | null | undefined): string {
  const g = String(gender || '').trim().toLowerCase()
  if (g === 'male' || g === 'm') return 'Mr.'
  if (g === 'female' || g === 'f') return 'Ms.'
  return ''
}

/** "11yrs/Male", as the desk's own receipts write it. */
export function ageSexFor(patient: ReceiptPatient | null | undefined, now = new Date()): string {
  const age = resolveAge(patient, now)
  const sex = String(patient?.gender || '').trim()
  return [age ? `${age.years}yrs` : '', sex].filter(Boolean).join('/')
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null

/** The header of a new receipt, from the patient's record and their visits. */
export function receiptDefaults(
  patient: ReceiptPatient | null | undefined,
  visits: ReceiptVisit[] = [],
  now = new Date(),
): ReceiptHeaderFields {
  const name = String(patient?.name || '').trim()

  // Every doctor who has visited, once each, in the order they first came.
  const seen = new Set<string>()
  const doctors: Array<ReceiptDoctor & { department: string }> = []
  const ordered = [...visits].sort((a, b) =>
    String(a.consultation_date || '').localeCompare(String(b.consultation_date || '')),
  )
  for (const visit of ordered) {
    const doctor = one(visit.doctor)
    const doctorName = String(doctor?.name || '').trim()
    const key = String(doctor?.id || doctorName)
    if (!doctorName || seen.has(key)) continue
    seen.add(key)
    doctors.push({
      name: doctorName,
      designation: String(doctor?.designation || '').trim(),
      department: String(doctor?.department || '').trim(),
    })
  }

  return {
    heading: DEFAULT_HEADING,
    patient_name: [titleFor(patient?.gender), name].filter(Boolean).join(' '),
    age_sex: ageSexFor(patient, now),
    mobile: [patient?.phone, patient?.alternate_phone]
      .map(p => String(p || '').trim())
      .filter(Boolean)
      .join(', '),
    address: String(patient?.address || '').trim(),
    ip_no: String(patient?.patient_id || '').trim(),
    doctors: doctors.slice(0, MAX_RECEIPT_DOCTORS).map(({ name: doctorName, designation }) => ({ name: doctorName, designation })),
    department: doctors[0]?.department || '',
  }
}

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
}

interface ReceiptPayment {
  id: string
  payment_date?: string | null
  payment_method?: string | null
  kind?: string | null
  remarks?: string | null
}

/** One payment's row on a new receipt. */
export function lineDefaults(payment: ReceiptPayment): ReceiptLineFields {
  const method = String(payment.payment_method || 'cash').toLowerCase()
  // 'payment' is what a label was called before labels existed; it means regular.
  const kind = (!payment.kind || payment.kind === 'payment' ? 'regular' : payment.kind) as PaymentKind
  const label = PAYMENT_KIND_LABELS[kind] ?? String(kind)
  const note = String(payment.remarks || '').trim()

  return {
    installment_id: payment.id,
    line_date: payment.payment_date ? String(payment.payment_date).slice(0, 10) : null,
    payment_mode: MODE_LABELS[method] ?? method,
    transaction_type: method === 'cash' ? 'cash' : 'transfer',
    remarks: note ? `${label} - ${note}` : label,
  }
}

// ─── Checking what the desk typed ───────────────────────────────────────────

type Refusal = { ok: false; status: number; error: string; fieldErrors?: Record<string, string> }

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const LIMITS = {
  receipt_no: 40,
  heading: 60,
  patient_name: 120,
  age_sex: 40,
  mobile: 60,
  address: 300,
  ip_no: 40,
  department: 80,
  created_by_label: 60,
  doctor: 80,
  payment_mode: 40,
  transaction_type: 40,
  remarks: 120,
} as const

const LABELS: Record<string, string> = {
  receipt_no: 'Receipt number',
  heading: 'Heading',
  patient_name: 'Patient name',
  age_sex: 'Age / sex',
  mobile: 'Mobile',
  address: 'Address',
  ip_no: 'IP no',
  department: 'Department',
  created_by_label: 'Created by',
}

/**
 * The receipt as typed, checked. `billPayments` are the ids of this patient's
 * payments — a receipt can only carry those.
 */
export function validateReceipt(
  body: any,
  billPayments: Set<string>,
): { ok: true; value: ReceiptFields } | Refusal {
  const refuse = (error: string, field?: string): Refusal => ({
    ok: false,
    status: 400,
    error,
    ...(field ? { fieldErrors: { [field]: error } } : {}),
  })

  const header: Record<string, string> = {}
  for (const field of Object.keys(LABELS)) {
    const value = text(body?.[field])
    const limit = LIMITS[field as keyof typeof LIMITS]
    if (value.length > limit) return refuse(`${LABELS[field]} is too long (${limit} characters at most)`, field)
    header[field] = value
  }

  if (!header.receipt_no) return refuse('Type the receipt number', 'receipt_no')
  if (!header.patient_name) return refuse("Type the patient's name", 'patient_name')

  // A doctor is a name with an optional designation; a bare name is accepted too.
  const doctors: ReceiptDoctor[] = []
  for (const raw of Array.isArray(body?.doctors) ? body.doctors : []) {
    const name = text(typeof raw === 'string' ? raw : raw?.name)
    const designation = text(typeof raw === 'string' ? '' : raw?.designation)
    if (!name) continue
    if (name.length > LIMITS.doctor) return refuse(`A doctor's name is too long (${LIMITS.doctor} characters at most)`, 'doctors')
    if (designation.length > LIMITS.doctor) {
      return refuse(`A doctor's designation is too long (${LIMITS.doctor} characters at most)`, 'doctors')
    }
    doctors.push({ name, designation })
  }
  if (doctors.length > MAX_RECEIPT_DOCTORS) {
    return refuse(`A receipt can name ${MAX_RECEIPT_DOCTORS} doctors at most`, 'doctors')
  }

  const rawLines: any[] = Array.isArray(body?.lines) ? body.lines : []
  if (rawLines.length === 0) return refuse('Pick at least one payment for the receipt', 'lines')
  if (rawLines.length > MAX_RECEIPT_LINES) {
    return refuse(`A receipt can carry ${MAX_RECEIPT_LINES} payments at most`, 'lines')
  }

  const seen = new Set<string>()
  const lines: ReceiptLineFields[] = []
  for (const raw of rawLines) {
    const installmentId = text(raw?.installment_id)
    if (!installmentId || !billPayments.has(installmentId)) {
      return refuse("That payment is not one of this patient's", 'lines')
    }
    if (seen.has(installmentId)) return refuse('The same payment is on the receipt twice', 'lines')
    seen.add(installmentId)

    const date = text(raw?.line_date)
    if (date && (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date)))) {
      return refuse('A row has a date that is not a real date', 'lines')
    }

    const line: ReceiptLineFields = {
      installment_id: installmentId,
      line_date: date || null,
      payment_mode: text(raw?.payment_mode),
      transaction_type: text(raw?.transaction_type),
      remarks: text(raw?.remarks),
    }
    for (const field of ['payment_mode', 'transaction_type', 'remarks'] as const) {
      if (line[field].length > LIMITS[field]) {
        return refuse(`A row's ${field.replace('_', ' ')} is too long (${LIMITS[field]} characters at most)`, 'lines')
      }
    }
    lines.push(line)
  }

  return {
    ok: true,
    value: {
      receipt_no: header.receipt_no,
      heading: header.heading || DEFAULT_HEADING,
      patient_name: header.patient_name,
      age_sex: header.age_sex,
      mobile: header.mobile,
      address: header.address,
      ip_no: header.ip_no,
      doctors,
      department: header.department,
      created_by_label: header.created_by_label,
      lines,
    },
  }
}

// ─── Reading and writing ────────────────────────────────────────────────────

const HEADER_COLUMNS = [
  'receipt_no', 'heading', 'patient_name', 'age_sex', 'mobile', 'address', 'ip_no',
  'doctors', 'department', 'created_by_label',
] as const

const headerRow = (fields: ReceiptFields) =>
  Object.fromEntries(HEADER_COLUMNS.map(column => [column, fields[column]]))

const lineRows = (receiptId: string, lines: ReceiptLineFields[]) =>
  lines.map((line, index) => ({ receipt_id: receiptId, position: index + 1, ...line }))

/** This patient's payments, oldest first, with who recorded each. */
export async function patientPayments(db: Db, patientId: string): Promise<any[]> {
  const { data: bills } = await db.from('patient_billing').select('id').eq('patient_id', patientId)
  const billIds = ((bills ?? []) as any[]).map(b => b.id)
  if (billIds.length === 0) return []

  const { data, error } = await db
    .from('patient_billing_installments')
    .select(
      'id, patient_billing_id, installment_number, amount, payment_date, payment_method, remarks, kind, created_by, users!created_by(id, username)',
    )
    .in('patient_billing_id', billIds)
    .order('installment_number', { ascending: true })
  if (error) throw error
  return (data ?? []) as any[]
}

/** The Doctors list, for picking a consultant on the receipt (a name can also be typed). */
export async function doctorOptions(db: Db): Promise<Array<ReceiptDoctor & { id: string; department: string }>> {
  const { data } = await db
    .from('doctors')
    .select('id, name, designation, department, is_active')
    .order('name', { ascending: true })
  return ((data ?? []) as any[])
    .filter(doctor => doctor.is_active !== false && String(doctor.name || '').trim())
    .map(doctor => ({
      id: doctor.id,
      name: String(doctor.name).trim(),
      designation: String(doctor.designation || '').trim(),
      department: String(doctor.department || '').trim(),
    }))
}

/**
 * A patient's saved receipts, newest first, each with its rows and the rows'
 * amounts read from the payments as they stand now.
 */
export async function listReceipts(db: Db, patientId: string, payments: any[]): Promise<any[]> {
  const { data: receipts, error } = await db
    .from('payment_receipts')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (receipts ?? []) as any[]
  if (rows.length === 0) return []

  const { data: lines, error: linesError } = await db
    .from('payment_receipt_lines')
    .select('*')
    .in('receipt_id', rows.map(r => r.id))
    .order('position', { ascending: true })
  if (linesError) throw linesError

  const userIds = [...new Set(rows.flatMap(r => [r.created_by, r.updated_by]).filter(Boolean))]
  const { data: users } = userIds.length
    ? await db.from('users').select('id, username').in('id', userIds)
    : { data: [] }
  const usernames = new Map<string, string>(((users ?? []) as any[]).map(u => [u.id, u.username]))

  const paymentById = new Map<string, any>(payments.map(p => [p.id, p]))

  return rows
    .map(receipt => {
      const own = ((lines ?? []) as any[])
        .filter(line => line.receipt_id === receipt.id && paymentById.has(line.installment_id))
        .map(line => {
          const payment = paymentById.get(line.installment_id)
          return {
            installment_id: line.installment_id,
            installment_number: payment.installment_number,
            line_date: line.line_date,
            payment_mode: line.payment_mode,
            transaction_type: line.transaction_type,
            remarks: line.remarks,
            amount: Number(payment.amount) || 0,
          }
        })
      return {
        ...receipt,
        doctors: receiptDoctors(receipt.doctors),
        lines: own,
        total: own.reduce((sum, line) => sum + line.amount, 0),
        saved_by: usernames.get(receipt.updated_by || receipt.created_by) ?? null,
        saved_at: receipt.updated_at || receipt.created_at,
      }
    })
    // A receipt whose payments are all gone has nothing left to say.
    .filter(receipt => receipt.lines.length > 0)
}

export async function createReceipt(
  db: Db,
  args: { patientId: string; billingId: string; fields: ReceiptFields; userId: string },
): Promise<{ ok: true; id: string } | Refusal> {
  const { patientId, billingId, fields, userId } = args

  const { data: receipt, error } = await db
    .from('payment_receipts')
    .insert({ patient_id: patientId, patient_billing_id: billingId, ...headerRow(fields), created_by: userId })
    .select('id')
    .single()
  if (error || !receipt) return { ok: false, status: 500, error: 'The receipt could not be saved' }

  const { error: linesError } = await db.from('payment_receipt_lines').insert(lineRows(receipt.id, fields.lines))
  if (linesError) {
    // Nothing half-saved: a receipt with no rows would be an empty slip.
    await db.from('payment_receipts').delete().eq('id', receipt.id)
    return { ok: false, status: 500, error: 'The receipt could not be saved' }
  }

  return { ok: true, id: receipt.id }
}

export async function updateReceipt(
  db: Db,
  args: { receiptId: string; fields: ReceiptFields; userId: string },
): Promise<{ ok: true; id: string } | Refusal> {
  const { receiptId, fields, userId } = args

  const { error } = await db
    .from('payment_receipts')
    .update({ ...headerRow(fields), updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', receiptId)
  if (error) return { ok: false, status: 500, error: 'The receipt could not be saved' }

  // The rows are replaced as a set: payments may have been ticked or unticked.
  const { data: before } = await db.from('payment_receipt_lines').select('*').eq('receipt_id', receiptId)
  await db.from('payment_receipt_lines').delete().eq('receipt_id', receiptId)
  const { error: linesError } = await db.from('payment_receipt_lines').insert(lineRows(receiptId, fields.lines))
  if (linesError) {
    const restore = ((before ?? []) as any[]).map(({ id: _id, ...row }) => row)
    if (restore.length) await db.from('payment_receipt_lines').insert(restore)
    return { ok: false, status: 500, error: "The receipt's payments could not be saved" }
  }

  return { ok: true, id: receiptId }
}

/** The receipts a payment is on — asked before the payment is deleted. */
export async function receiptsCarrying(db: Db, installmentId: string): Promise<string[]> {
  const { data: lines } = await db
    .from('payment_receipt_lines')
    .select('receipt_id')
    .eq('installment_id', installmentId)
  return [...new Set(((lines ?? []) as any[]).map(l => l.receipt_id as string))]
}

/**
 * After a payment is deleted: drop its rows from the receipts it was on, and
 * any of those receipts it leaves empty. The database cascades the rows by
 * itself (which is why the receipts are looked up beforehand, with
 * `receiptsCarrying`); deleting them here too costs nothing.
 */
export async function forgetPaymentOnReceipts(db: Db, installmentId: string, receiptIds: string[]): Promise<void> {
  if (receiptIds.length === 0) return

  await db.from('payment_receipt_lines').delete().eq('installment_id', installmentId)

  const { data: left } = await db.from('payment_receipt_lines').select('receipt_id').in('receipt_id', receiptIds)
  const stillUsed = new Set(((left ?? []) as any[]).map(l => l.receipt_id))
  const empty = receiptIds.filter(id => !stillUsed.has(id))
  if (empty.length) await db.from('payment_receipts').delete().in('id', empty)
}
