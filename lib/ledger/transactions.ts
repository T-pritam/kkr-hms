import { normaliseLedgerCategoryDetail, validateLedgerExpenseCategory } from '@/lib/finances/validate'

/**
 * The single way a row gets into `daily_ledger_transactions`.
 *
 * Four routes used to insert into that table, and only one of them validated
 * anything. Recording a patient installment, settling a doctor's fees and
 * paying a referral commission all wrote straight to the table.
 *
 * Validation and the insert therefore live here, once. A caller that wants to
 * write to the ledger goes through this or it does not write to the ledger.
 *
 * Closing is per row now, not per date (CR-06), so nothing here asks whether a
 * day is closed: a new entry is simply born Open, or Closed when an admin made
 * it.
 */

type Db = {
  from: (table: string) => any
}

export type LedgerSource =
  | 'patient'
  // The registration fee, booked by lib/billing/payments.ts (PRD v2 CR-11).
  | 'registration'
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
 *
 * `patient` and `registration` are not here either: a patient payment's credit
 * is only ever written together with the payment itself (lib/billing/payments.ts,
 * PRD v2 CR-12). A bare ledger row claiming to be one would count as money
 * received that no bill knows about.
 */
/**
 * `expense` is gone from this list (CR-07, Q-07 = A): the desk's spending is a
 * petty cash debit and the admin's is a general expense, so neither belongs in
 * the ledger any more. The rows already booked stay readable — the Overview
 * still counts them for the months they fall in — but nothing writes another.
 */
export const USER_SOURCES: LedgerSource[] = ['opd']

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
  status?: 'open' | 'closed'
  created_by: string
  /**
   * The creator's role. An entry an admin makes is born Closed — they are the
   * one who would close it anyway (Q-25 = A). Reception's entries, payouts
   * included, are born Open and wait for the admin's "Mark closed" (Q-71).
   */
  created_by_role?: string | null
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
    created_by_role,
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

  // Born Closed for an admin, Open for everyone else (Q-25 = A). A closed row
  // always carries who closed it and when (the CHECK in 20260924000001).
  const bornStatus = status ?? (created_by_role === 'ADMIN' ? 'closed' : 'open')
  const closing =
    bornStatus === 'closed'
      ? { closed_at: new Date().toISOString(), closed_by: created_by }
      : { closed_at: null, closed_by: null }

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
      status: bornStatus,
      ...closing,
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
 * A date no longer locks anything (CR-08, AC-08.3): an entry may be dated any
 * past day and lands Open, waiting for the admin to close it with the rest.
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
