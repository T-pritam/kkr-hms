/**
 * The Finances Overview, on a cash basis (PRD v2, CR-10 and Q-36).
 *
 * One deliberate exception: **medicine** counts from the day the charge is
 * dated, which may be before the hospital has settled with the pharmacy. The
 * patient has already paid us for it, so the obligation is real, and dating it
 * to the charge keeps it beside the money that funded it. Everything else here
 * is still strictly what moved.
 *
 * The old summary mixed two bases and nobody could say which. "Income" was the
 * payments actually received, while "expenses" included doctor fees and
 * referral commissions the hospital had merely *priced* — money that had not
 * left, and in some cases never would. Profit was the difference between a cash
 * figure and an accrual one, which is not a number that means anything.
 *
 * Q-36 settles it: **money that moved this month, and nothing else.**
 *
 *   Money in  = patient payments (regular, advance, discharge, misc)
 *             + registration fees + lab tests (each its own line, round 8)
 *             + OPD receipts.
 *   Money out = general expenses (the admin's, CR-07)
 *             + petty cash spent (the desk's float, one line, Q-69)
 *             + salary                                  (see the note below)
 *             + doctor fees and referral commissions **actually paid**
 *             + medicine the hospital carries for its patients.
 *   Profit    = money in − money out.
 *
 * Three things are deliberately *not* here:
 *
 *   * **Charges.** They are internal and move no money (CR-15), so "charges
 *     incurred" left the Overview with the base package.
 *   * **Petty cash top-ups.** Handing the desk ₹5,000 moves money from one
 *     pocket to another; the expense is what the desk then spends (Q-10).
 *   * **Excluded lab and medicine.** The patient pays the lab directly and the
 *     hospital never sees that money, so nothing is recorded at all (Q-82,
 *     revised 2026-09-24). Only an *Included* amount is ours to pay.
 *
 * Salary counts once, advances included (Q-36). A settled month pays out the
 * whole `calculated_salary` — the advances already handed over, plus the
 * balance on settlement day. An unsettled month has paid out only its advances
 * so far, so that is what it contributes.
 */

import { medicineExpense } from '@/lib/finances/medicine-expense'

type Db = { from: (table: string) => any }

const num = (v: unknown) => Number(v) || 0
const sum = (rows: any[] | null | undefined, field = 'amount') =>
  (rows ?? []).reduce((total: number, row: any) => total + num(row[field]), 0)

export interface MonthRange {
  month: string
  /** `YYYY-MM-DD`, for the columns that are a plain date. */
  start: string
  end: string
  /** UTC instants, for the columns that are a `timestamptz`. */
  startsAt: string
  endsBefore: string
}

/**
 * The first and last day of an IST month, both ways.
 *
 * `start`/`end` compare against a `date` column. `startsAt`/`endsBefore` are the
 * same boundaries as instants — IST midnight either end, which is 18:30 UTC on
 * the day before — for the `timestamptz` columns the payouts use. Mixing them up
 * moves anything paid before 05:30 IST into the previous month.
 */
export function monthRange(monthYear: string): MonthRange {
  const [year, month] = monthYear.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  // IST is UTC+5:30 the year round: midnight IST is 18:30 UTC the day before.
  const istMidnight = (y: number, m: number) =>
    new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - 5.5 * 60 * 60 * 1000).toISOString()

  return {
    month: monthYear,
    start: `${monthYear}-01`,
    end: `${monthYear}-${String(lastDay).padStart(2, '0')}`,
    startsAt: istMidnight(year, month),
    endsBefore: istMidnight(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1),
  }
}

export interface MoneyIn {
  /** Regular, advance, discharge and misc payments. */
  patient_payments: number
  registration: number
  lab: number
  opd_receipts: number
  total: number
}

export interface MoneyOut {
  general_expenses: number
  petty_cash: number
  salary: number
  doctor_fees_paid: number
  referral_commissions_paid: number
  /** Medicine the hospital carries for its patients (round 8). */
  medicine: number
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
    .select('amount, payment_date, kind')
    .gte('payment_date', range.start)
    .lte('payment_date', range.end)

  const { data: opd } = await db
    .from('daily_ledger_transactions')
    .select('amount, transaction_date, transaction_type, source')
    .gte('transaction_date', range.start)
    .lte('transaction_date', range.end)
    .eq('transaction_type', 'credit')
    .eq('source', 'opd')

  const rows = payments ?? []
  const registration = sum(rows.filter((row: any) => row.kind === 'registration'))
  const lab = sum(rows.filter((row: any) => row.kind === 'lab'))
  const patientPayments = sum(rows) - registration - lab
  const opdReceipts = sum(opd)

  return {
    patient_payments: patientPayments,
    registration,
    lab,
    opd_receipts: opdReceipts,
    total: patientPayments + registration + lab + opdReceipts,
  }
}

/**
 * Money out: what the hospital paid out this month.
 *
 * The payouts are counted from **the rows that record them** — settled doctor
 * fees by `settlement_date`, settled commissions by `referral_settlement_date` —
 * not from ledger debits. A payout writes no ledger entry any more: the money
 * comes straight from the admin and never reaches the desk's cash book (client
 * revision, 2026-09-24, superseding Q-37 = B).
 *
 * Reading the rows also fixes a disagreement that predates the change. Settling
 * from the patient's Billing tab never wrote a debit, so the ledger only ever
 * held some of the payouts — on production, none of the settled fees and two of
 * the four commissions. Counting from the rows picks up every one.
 *
 * A fee's amount is `settlement_amount ?? total_amount`, the same expression the
 * patient's own Overview uses, so the two screens cannot disagree about what a
 * fee cost.
 *
 * Both settlement dates are `timestamptz`, not dates, so the month is bounded by
 * IST instants rather than by `YYYY-MM-DD` strings: a fee paid at 02:00 IST on
 * the 1st is 20:30 UTC on the last of the previous month, and a string compare
 * would file it in the wrong month.
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

  const { data: fees } = await db
    .from('doctor_visit_settlements')
    .select('settlement_amount, total_amount, settlement_date, settled, deleted_at')
    .eq('settled', true)
    .is('deleted_at', null)
    .gte('settlement_date', range.startsAt)
    .lt('settlement_date', range.endsBefore)

  const { data: commissions } = await db
    .from('patient_billing')
    .select('referral_commission_amount, referral_settlement_date, referral_settled')
    .eq('referral_settled', true)
    .gte('referral_settlement_date', range.startsAt)
    .lt('referral_settlement_date', range.endsBefore)

  // Only the legacy desk expenses are left in the ledger; no payout writes one.
  const { data: ledgerExpenses } = await db
    .from('daily_ledger_transactions')
    .select('amount, source, transaction_type, transaction_date')
    .gte('transaction_date', range.start)
    .lte('transaction_date', range.end)
    .eq('transaction_type', 'debit')
    .eq('source', 'expense')

  const generalExpenses = sum(expenses)
  const pettyCashSpent = sum(pettyCash)
  const doctorFeesPaid = (fees ?? []).reduce(
    (total: number, row: any) =>
      total + (row.settlement_amount != null ? num(row.settlement_amount) : num(row.total_amount)),
    0,
  )
  const commissionsPaid = sum(commissions ?? [], 'referral_commission_amount')
  const medicine = await medicineExpense(db, range)
  const legacyLedgerExpenses = sum(ledgerExpenses)

  return {
    general_expenses: generalExpenses,
    petty_cash: pettyCashSpent,
    salary,
    doctor_fees_paid: doctorFeesPaid,
    referral_commissions_paid: commissionsPaid,
    medicine: medicine.total,
    legacy_ledger_expenses: legacyLedgerExpenses,
    total:
      generalExpenses +
      pettyCashSpent +
      salary +
      doctorFeesPaid +
      commissionsPaid +
      medicine.total +
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
