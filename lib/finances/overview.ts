/**
 * The Finances Overview, on a cash basis (PRD v2, CR-10 and Q-36).
 *
 * The old summary mixed two bases and nobody could say which. "Income" was the
 * payments actually received, while "expenses" included doctor fees and
 * referral commissions the hospital had merely *priced* — money that had not
 * left, and in some cases never would. Profit was the difference between a cash
 * figure and an accrual one, which is not a number that means anything.
 *
 * Q-36 settles it: **money that moved this month, and nothing else.**
 *
 *   Money in  = patient payments, every label — regular, advance, discharge,
 *               misc, registration, and the lab/medicine ones collected
 *               separately — plus OPD receipts.
 *   Money out = general expenses (the admin's, CR-07)
 *             + petty cash spent (the desk's float, one line, Q-69)
 *             + salary                                  (see the note below)
 *             + doctor fees and referral commissions **actually paid**.
 *   Profit    = money in − money out.
 *
 * Three things are deliberately *not* here:
 *
 *   * **Charges.** They are internal and move no money (CR-15), so "charges
 *     incurred" left the Overview with the base package.
 *   * **Petty cash top-ups.** Handing the desk ₹5,000 moves money from one
 *     pocket to another; the expense is what the desk then spends (Q-10).
 *   * **Lab and pharmacy payouts.** An included amount is the hospital's income
 *     (Q-83) and a separately collected one is passed on at the desk (Q-82), so
 *     there is nothing to pay out from here.
 *
 * Salary counts once, advances included (Q-36). A settled month pays out the
 * whole `calculated_salary` — the advances already handed over, plus the
 * balance on settlement day. An unsettled month has paid out only its advances
 * so far, so that is what it contributes.
 */

type Db = { from: (table: string) => any }

const num = (v: unknown) => Number(v) || 0
const sum = (rows: any[] | null | undefined, field = 'amount') =>
  (rows ?? []).reduce((total: number, row: any) => total + num(row[field]), 0)

export interface MonthRange {
  month: string
  start: string
  end: string
}

/** The first and last day of an IST month, as `YYYY-MM-DD`. */
export function monthRange(monthYear: string): MonthRange {
  const [year, month] = monthYear.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    month: monthYear,
    start: `${monthYear}-01`,
    end: `${monthYear}-${String(lastDay).padStart(2, '0')}`,
  }
}

export interface MoneyIn {
  patient_payments: number
  opd_receipts: number
  total: number
}

export interface MoneyOut {
  general_expenses: number
  petty_cash: number
  salary: number
  doctor_fees_paid: number
  referral_commissions_paid: number
  /** Desk expenses booked to the ledger before petty cash existed (CR-07). */
  legacy_ledger_expenses: number
  total: number
}

export interface PendingPayouts {
  doctor_fees: number
  doctor_count: number
  referral_commissions: number
  referral_count: number
  total: number
}

/**
 * Money in: every payment received in the month, plus the OPD desk's receipts.
 *
 * Payments are read from the installments rather than the ledger, because the
 * installment is the record the patient's bill is built from; its ledger credit
 * is the same money seen from the other side (CR-12).
 */
export async function moneyIn(db: Db, range: MonthRange): Promise<MoneyIn> {
  const { data: payments } = await db
    .from('patient_billing_installments')
    .select('amount, payment_date')
    .gte('payment_date', range.start)
    .lte('payment_date', range.end)

  const { data: opd } = await db
    .from('daily_ledger_transactions')
    .select('amount, transaction_date, transaction_type, source')
    .gte('transaction_date', range.start)
    .lte('transaction_date', range.end)
    .eq('transaction_type', 'credit')
    .eq('source', 'opd')

  const patientPayments = sum(payments)
  const opdReceipts = sum(opd)

  return {
    patient_payments: patientPayments,
    opd_receipts: opdReceipts,
    total: patientPayments + opdReceipts,
  }
}

/**
 * Money out: what actually left the hospital this month.
 *
 * The payouts are counted from the ledger debits they wrote, not from the fee
 * rows — a fee priced in March and paid in April is April's money (CR-13).
 */
export async function moneyOut(db: Db, range: MonthRange): Promise<MoneyOut> {
  const { data: expenses } = await db
    .from('expenses')
    .select('amount, month_year')
    .eq('month_year', range.month)

  // Q-69 = A: the float reaches the Expenses log as one line a month. Top-ups
  // are not expenses, and an advance is counted inside salary, so only what the
  // desk actually spent is here.
  const { data: pettyCash } = await db
    .from('petty_cash_entries')
    .select('amount, entry_date, kind')
    .gte('entry_date', range.start)
    .lte('entry_date', range.end)
    .eq('kind', 'expense')

  const { data: salaries } = await db
    .from('salary_payments')
    .select('status, calculated_salary, total_advance, month_year')
    .eq('month_year', range.month)

  const salary = (salaries ?? []).reduce(
    (total: number, row: any) =>
      total + (row.status === 'settled' ? num(row.calculated_salary) : num(row.total_advance)),
    0,
  )

  const { data: payouts } = await db
    .from('daily_ledger_transactions')
    .select('amount, source, transaction_type, transaction_date')
    .gte('transaction_date', range.start)
    .lte('transaction_date', range.end)
    .eq('transaction_type', 'debit')

  const bySource = (source: string) =>
    sum((payouts ?? []).filter((row: any) => row.source === source))

  const generalExpenses = sum(expenses)
  const pettyCashSpent = sum(pettyCash)
  const doctorFeesPaid = bySource('doctor_settlement')
  const commissionsPaid = bySource('referral_commission')
  const legacyLedgerExpenses = bySource('expense')

  return {
    general_expenses: generalExpenses,
    petty_cash: pettyCashSpent,
    salary,
    doctor_fees_paid: doctorFeesPaid,
    referral_commissions_paid: commissionsPaid,
    legacy_ledger_expenses: legacyLedgerExpenses,
    total:
      generalExpenses +
      pettyCashSpent +
      salary +
      doctorFeesPaid +
      commissionsPaid +
      legacyLedgerExpenses,
  }
}

/**
 * What is priced but not yet paid — doctor fees and referral commissions
 * (Q-81 b). These are shown beside the Expenses log as Pending, and they are
 * deliberately **not** in Money out: nothing has left yet.
 *
 * Not month-filtered, because an unpaid fee is outstanding whenever it was
 * priced — that is the point of the list.
 */
export async function pendingPayouts(db: Db): Promise<PendingPayouts & { rows: any[] }> {
  const { data: fees } = await db
    .from('doctor_visit_settlements')
    .select('id, total_amount, visit_count, patient_id, doctor:doctors(id, name), patient:patients(id, patient_id, name)')
    .eq('settled', false)
    .is('deleted_at', null)

  const { data: commissions } = await db
    .from('patient_billing')
    .select('id, referral_commission_amount, patient_id, patient:patients(id, patient_id, name)')
    .eq('referral_settled', false)
    .gt('referral_commission_amount', 0)

  const feeRows = (fees ?? []).map((row: any) => ({
    kind: 'doctor_fee' as const,
    id: row.id,
    amount: num(row.total_amount),
    who: (Array.isArray(row.doctor) ? row.doctor[0] : row.doctor)?.name ?? 'Doctor',
    patient: Array.isArray(row.patient) ? row.patient[0] : row.patient,
  }))

  const commissionRows = (commissions ?? []).map((row: any) => ({
    kind: 'referral_commission' as const,
    id: row.id,
    amount: num(row.referral_commission_amount),
    who: 'Referral',
    patient: Array.isArray(row.patient) ? row.patient[0] : row.patient,
  }))

  const doctorTotal = feeRows.reduce((total: number, row: any) => total + row.amount, 0)
  const commissionTotal = commissionRows.reduce((total: number, row: any) => total + row.amount, 0)

  return {
    doctor_fees: doctorTotal,
    doctor_count: feeRows.length,
    referral_commissions: commissionTotal,
    referral_count: commissionRows.length,
    total: doctorTotal + commissionTotal,
    rows: [...feeRows, ...commissionRows].sort((a: any, b: any) => b.amount - a.amount),
  }
}

export interface Overview {
  month_year: string
  money_in: MoneyIn
  money_out: MoneyOut
  profit: { amount: number; is_profit: boolean; margin: number }
  pending: PendingPayouts & { rows: any[] }
}

export async function financeOverview(db: Db, monthYear: string): Promise<Overview> {
  const range = monthRange(monthYear)

  const [income, outgoings, pending] = await Promise.all([
    moneyIn(db, range),
    moneyOut(db, range),
    pendingPayouts(db),
  ])

  const profit = income.total - outgoings.total

  return {
    month_year: monthYear,
    money_in: income,
    money_out: outgoings,
    profit: {
      amount: profit,
      is_profit: profit >= 0,
      margin: income.total > 0 ? (profit / income.total) * 100 : 0,
    },
    pending,
  }
}
