import { normaliseLedgerCategoryDetail, validateLedgerExpenseCategory } from '@/lib/finances/validate'
import { LEDGER_DAY_CLOSED, getActiveClosure, ledgerDateClosedMessage } from './closure'

/**
 * The single way a row gets into `daily_ledger_transactions`.
 *
 * Four routes used to insert into that table, and only one of them validated
 * anything or checked whether the day was closed. Recording a patient
 * installment, settling a doctor's fees and paying a referral commission all
 * wrote straight to the table — so money could be booked into a date that had
 * already been reconciled, after which the closure totals no longer described
 * the day they claimed to.
 *
 * Validation, the closure guard and the insert therefore live here, in that
 * order, once. A caller that wants to write to the ledger goes through this or
 * it does not write to the ledger.
 */

type Db = {
  from: (table: string) => any
}

export type LedgerSource =
  | 'patient'
  | 'opd'
  | 'expense'
  | 'doctor_settlement'
  | 'referral_commission'
  | 'salary'

export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque'

export const PAYMENT_MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank_transfer', 'cheque']

/**
 * Sources a user may pick on a form. The remaining sources are written by
 * settlement routes on the user's behalf and are not accepted from a request
 * body — which is what stops a hand-rolled POST from disguising an entry as a
 * doctor settlement.
 */
export const USER_SOURCES: LedgerSource[] = ['patient', 'opd', 'expense']

export interface LedgerTransactionInput {
  transaction_date: string
  transaction_type: 'credit' | 'debit'
  source: LedgerSource
  amount: number | string
  payment_mode: PaymentMode
  reference_number?: string | null
  patient_id?: string | null
  description: string
  notes?: string | null
  expense_category?: string | null
  expense_category_detail?: string | null
  status?: 'pending' | 'verified'
  created_by: string
}

export type LedgerWriteResult =
  | { ok: true; rows: any[] }
  | { ok: false; status: number; error: string; code?: string; closure?: unknown }

const SELECT_WITH_RELATIONS = `
  *,
  created_by_user:users!created_by(id, username),
  patient:patients(id, name)
`

/**
 * Field-level validation, with no database access.
 *
 * Lifted from POST /api/ledger/transactions so the three routes that used to
 * bypass it are held to the same rules.
 */
function validate(
  input: LedgerTransactionInput,
  allowedSources: LedgerSource[]
): { error: string } | { row: Record<string, unknown> } {
  const {
    transaction_date,
    transaction_type,
    source,
    amount,
    payment_mode,
    reference_number,
    patient_id,
    description,
    notes,
    expense_category,
    expense_category_detail,
    status,
    created_by,
  } = input

  if (!transaction_date || !transaction_type || !source || !amount || !payment_mode || !description) {
    return { error: 'Missing required fields' }
  }

  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return { error: 'Amount must be greater than 0' }
  }

  if (!['credit', 'debit'].includes(transaction_type)) {
    return { error: 'Invalid transaction type' }
  }

  if (!allowedSources.includes(source)) {
    return { error: 'Invalid source' }
  }

  if (!PAYMENT_MODES.includes(payment_mode)) {
    return { error: 'Invalid payment mode' }
  }

  // A UPI receipt with no reference cannot be reconciled against the statement.
  if (payment_mode === 'upi' && (!reference_number || reference_number.trim() === '')) {
    return { error: 'Reference number required for UPI payments' }
  }

  // Only an expense row carries a category. Forcing the pair to null on every
  // other source is what stops a credit or an OPD collection from drifting into
  // holding one, which would make the column mean two different things.
  let category: string | null = null
  let categoryDetail: string | null = null

  if (source === 'expense') {
    const categoryError = validateLedgerExpenseCategory(expense_category)
    if (categoryError) return { error: categoryError }

    const detail = normaliseLedgerCategoryDetail(expense_category, expense_category_detail)
    if ('error' in detail) return { error: detail.error }

    category = expense_category as string
    categoryDetail = detail.value
  }

  return {
    row: {
      transaction_date,
      transaction_type,
      source,
      amount: parsedAmount,
      payment_mode,
      reference_number: reference_number || null,
      patient_id: patient_id || null,
      description,
      notes: notes || null,
      expense_category: category,
      expense_category_detail: categoryDetail,
      created_by,
      status: status ?? 'pending',
    },
  }
}

/** Shapes the 409 a locked date produces, identically to assertLedgerDateOpen. */
async function closureRefusal(db: Db, date: string): Promise<LedgerWriteResult | null> {
  const closure = await getActiveClosure(db, date)
  if (!closure) return null

  return {
    ok: false,
    status: 409,
    error: ledgerDateClosedMessage(date, 'create'),
    code: LEDGER_DAY_CLOSED,
    closure: {
      closure_date: closure.closure_date,
      version: closure.version,
      closed_at: closure.closed_at,
      closed_by_name: closure.closed_by_user?.username ?? null,
    },
  }
}

export async function createLedgerTransaction(
  db: Db,
  input: LedgerTransactionInput,
  options: { allowedSources?: LedgerSource[] } = {}
): Promise<LedgerWriteResult> {
  const result = await createLedgerTransactions(db, [input], options)
  return result
}

/**
 * The bulk form, for the settlement routes that post several rows at once.
 *
 * Each distinct date is guarded once, and a single closed date rejects the whole
 * batch. A half-posted settlement — some doctors paid into the ledger, others
 * silently dropped — is worse than one that was refused outright.
 */
export async function createLedgerTransactions(
  db: Db,
  inputs: LedgerTransactionInput[],
  options: { allowedSources?: LedgerSource[] } = {}
): Promise<LedgerWriteResult> {
  if (inputs.length === 0) return { ok: true, rows: [] }

  const allowedSources = options.allowedSources ?? USER_SOURCES
  const rows: Record<string, unknown>[] = []

  for (const input of inputs) {
    const validated = validate(input, allowedSources)
    if ('error' in validated) {
      return { ok: false, status: 400, error: validated.error }
    }
    rows.push(validated.row)
  }

  for (const date of new Set(rows.map((r) => r.transaction_date as string))) {
    const refusal = await closureRefusal(db, date)
    if (refusal) return refusal
  }

  const { data, error } = await db
    .from('daily_ledger_transactions')
    .insert(rows)
    .select(SELECT_WITH_RELATIONS)

  if (error) {
    console.error('Create ledger transaction error:', error)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, rows: data ?? [] }
}
