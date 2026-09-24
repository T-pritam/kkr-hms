/**
 * /api/finances/* — expenses, the monthly summary, and the two payout endpoints.
 */

import { describe, it, expect } from 'vitest'
import {
  GET as listExpenses,
  POST as addExpense,
  PUT as editExpense,
  DELETE as removeExpense,
} from '@/app/api/finances/expenses/route'
import { GET as financeSummary } from '@/app/api/finances/summary/route'
import {
  GET as listDoctorSettlements,
  POST as payDoctorSettlements,
} from '@/app/api/finances/doctor-settlements/route'
import {
  GET as listCommissions,
  POST as payCommissions,
} from '@/app/api/finances/referral-commissions/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  anExpense,
  aBilling,
  aCharge,
  aChargeItem,
  anInstallment,
  aSalaryRecord,
  aTransaction,
  aSettlement,
  aDoctor,
  aPatient,
  aReferral,
  aClosure,
  aPettyCashEntry,
} from '../../helpers/seed'
import { THIS_MONTH, TODAY } from '../../setup'
import {
  EXPENSE_DETAIL_MAX,
  EXPENSE_TYPES,
  MISCELLANEOUS_TYPE,
} from '@/lib/finances/constants'

const expenses = (query = {}) => call(listExpenses, 'GET', '/api/finances/expenses', { query })
// Every expense needs a reason now (Q-39 = A); the tests that are not about
// that rule get one by default, so they keep testing what they came to test.
const createExpense = (body: any) =>
  call(addExpense, 'POST', '/api/finances/expenses', {
    body: body && typeof body === 'object' && !('remarks' in body) ? { remarks: 'March bill', ...body } : body,
  })
const updateExpense = (body: unknown) => call(editExpense, 'PUT', '/api/finances/expenses', { body })
const deleteExpense = (query: Record<string, string>) =>
  call(removeExpense, 'DELETE', '/api/finances/expenses', { query })

const summary = async (query = {}) => {
  const { status, body } = await call(financeSummary, 'GET', '/api/finances/summary', { query })
  return { status, body: body?.data ?? body }
}

const settlements = (query = {}) => call(listDoctorSettlements, 'GET', '/api/finances/doctor-settlements', { query })
const paySettlements = (body: unknown) =>
  call(payDoctorSettlements, 'POST', '/api/finances/doctor-settlements', { body })

const commissions = (query = {}) => call(listCommissions, 'GET', '/api/finances/referral-commissions', { query })
const payCommission = (body: unknown) =>
  call(payCommissions, 'POST', '/api/finances/referral-commissions', { body })

describe('/api/finances/expenses', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await expenses()).status).toBe(401)
  })

  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

    expect((await expenses()).status).toBe(403)
    expect((await createExpense({ expense_type: 'x', amount: 1, expense_date: TODAY })).status).toBe(403)
    expect((await deleteExpense({ id: '1' })).status).toBe(403)
  })

  it('lets a doctor read but not write', async () => {
    await signInAs('DOCTOR')

    expect((await expenses()).status).toBe(200)
    expect((await createExpense({ expense_type: 'x', amount: 1, expense_date: TODAY })).status).toBe(403)
  })

  it('lists the current month by default, newest first', async () => {
    await signInAs('ADMIN')
    anExpense({ id: '1', month_year: THIS_MONTH, expense_date: '2026-03-01' })
    anExpense({ id: '2', month_year: THIS_MONTH, expense_date: '2026-03-10' })
    anExpense({ id: '3', month_year: '2026-02', expense_date: '2026-02-10' })

    const { status, body } = await expenses()

    expect(status).toBe(200)
    expect(body.data.map((e: any) => e.id)).toEqual(['2', '1'])
  })

  it('filters by month', async () => {
    await signInAs('ADMIN')
    anExpense({ id: '1', month_year: THIS_MONTH })
    anExpense({ id: '2', month_year: '2026-02' })

    expect((await expenses({ month_year: '2026-02' })).body.data.map((e: any) => e.id)).toEqual(['2'])
  })

  it.each([
    ['expense_type', { amount: 500, expense_date: TODAY }],
    ['amount', { expense_type: 'Electric Bill', expense_date: TODAY }],
    ['expense_date', { expense_type: 'Electric Bill', amount: 500 }],
  ])('requires %s', async (_field, body) => {
    await signInAs('ADMIN')

    const { status, body: response } = await createExpense(body)
    expect(status).toBe(400)
    expect(response.error).toBe('Missing required fields: expense_type, amount, expense_date')
  })

  it('rejects a non-positive amount', async () => {
    await signInAs('ADMIN')

    const { status, body } = await createExpense({
      expense_type: 'Electric Bill',
      amount: -5,
      expense_date: TODAY,
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Amount must be greater than 0')
  })

  it('derives month_year from the expense date, ignoring what the client sends', async () => {
    await signInAs('ADMIN')

    await createExpense({
      expense_type: 'Oxygen Supply',
      amount: 12000,
      expense_date: '2026-01-20',
      month_year: '2099-12',
    })

    expect(db.rows('expenses')[0]).toMatchObject({ month_year: '2026-01', amount: 12000 })
  })

  it('parses a string amount', async () => {
    await signInAs('ADMIN')

    await createExpense({ expense_type: 'Electric Bill', amount: '1500.75', expense_date: TODAY })
    expect(db.rows('expenses')[0].amount).toBe(1500.75)
  })

  it('updates an expense and recomputes its month', async () => {
    await signInAs('ADMIN')
    anExpense({ id: '1', amount: 500, month_year: THIS_MONTH })

    const { status } = await updateExpense({
      id: '1',
      expense_type: 'Lift Maintenance',
      amount: 9000,
      expense_date: '2026-01-05',
    })

    expect(status).toBe(200)
    expect(db.find('expenses', (r) => String(r.id) === '1')).toMatchObject({
      amount: 9000,
      month_year: '2026-01',
      expense_type: 'Lift Maintenance',
    })
  })

  it('requires an id to update or delete', async () => {
    await signInAs('ADMIN')

    expect((await updateExpense({ expense_type: 'x', amount: 1, expense_date: TODAY })).body.error).toBe(
      'Missing expense id'
    )
    expect((await deleteExpense({})).body.error).toBe('Missing expense id')
  })

  it('deletes an expense', async () => {
    await signInAs('ADMIN')
    anExpense({ id: '1' })

    expect((await deleteExpense({ id: '1' })).status).toBe(200)
    expect(db.count('expenses')).toBe(0)
  })

  describe('the expense type allow-list', () => {
    it.each(EXPENSE_TYPES)('accepts %s', async (expense_type) => {
      await signInAs('ADMIN')

      const detail = expense_type === MISCELLANEOUS_TYPE ? 'Broken window pane' : undefined
      const { status } = await createExpense({
        expense_type,
        amount: 100,
        expense_date: TODAY,
        expense_type_detail: detail,
      })

      expect(status).toBe(200)
    })

    it('rejects a type outside the list', async () => {
      await signInAs('ADMIN')

      const { status, body } = await createExpense({
        expense_type: 'Bribes',
        amount: 100,
        expense_date: TODAY,
      })

      expect(status).toBe(400)
      expect(body.error).toContain('Expense type must be one of')
      expect(db.count('expenses')).toBe(0)
    })

    /**
     * The column was unconstrained free text for the life of this table, so a
     * live row may hold something outside the eight. Rejecting it on edit would
     * mean nobody could correct that row's amount without also reclassifying it.
     */
    it('still lets a legacy row with an off-list type be edited', async () => {
      await signInAs('ADMIN')
      anExpense({ id: '1', expense_type: 'Something historic' })

      const { status } = await updateExpense({
        id: '1',
        expense_type: 'Something historic',
        amount: 250,
        expense_date: TODAY,
      })

      expect(status).toBe(200)
      expect(db.rows('expenses')[0].amount).toBe(250)
    })

    it('but a change of type has to land on a valid one', async () => {
      await signInAs('ADMIN')
      anExpense({ id: '1', expense_type: 'Something historic' })

      const { status, body } = await updateExpense({
        id: '1',
        expense_type: 'Something else historic',
        amount: 250,
        expense_date: TODAY,
      })

      expect(status).toBe(400)
      expect(body.error).toContain('Expense type must be one of')
    })

    /** Two existing tests silently depend on the amount error winning. */
    it('reports the amount error before the type error', async () => {
      await signInAs('ADMIN')

      const { body } = await createExpense({ expense_type: 'nope', amount: -5, expense_date: TODAY })
      expect(body.error).toBe('Amount must be greater than 0')
    })
  })

  describe('the Miscellaneous detail', () => {
    const misc = (over: Record<string, unknown> = {}) =>
      createExpense({
        expense_type: MISCELLANEOUS_TYPE,
        amount: 100,
        expense_date: TODAY,
        ...over,
      })

    it.each([undefined, null, '', '   '])('rejects a detail of %p', async (expense_type_detail) => {
      await signInAs('ADMIN')

      const { status, body } = await misc({ expense_type_detail })
      expect(status).toBe(400)
      expect(body.error).toBe('Describe the miscellaneous expense')
      expect(db.count('expenses')).toBe(0)
    })

    it('stores it trimmed', async () => {
      await signInAs('ADMIN')

      await misc({ expense_type_detail: '  Broken window pane  ' })
      expect(db.rows('expenses')[0].expense_type_detail).toBe('Broken window pane')
    })

    it('rejects one longer than the cap', async () => {
      await signInAs('ADMIN')

      const { status, body } = await misc({ expense_type_detail: 'x'.repeat(EXPENSE_DETAIL_MAX + 1) })
      expect(status).toBe(400)
      expect(body.error).toBe(`Detail must be ${EXPENSE_DETAIL_MAX} characters or fewer`)
    })

    it('discards a detail sent with a type that does not take one', async () => {
      await signInAs('ADMIN')

      await createExpense({
        expense_type: 'Electric Bill',
        amount: 100,
        expense_date: TODAY,
        expense_type_detail: 'should not stick',
      })

      expect(db.rows('expenses')[0].expense_type_detail).toBeNull()
    })

    /**
     * The rows that predate the column. Requiring the detail on update is what
     * gets them filled in — and it is the half of the rule that would regress
     * without anyone noticing.
     */
    it('is required when editing a legacy row that has none', async () => {
      await signInAs('ADMIN')
      anExpense({ id: '1', expense_type: MISCELLANEOUS_TYPE, expense_type_detail: null })

      const { status, body } = await updateExpense({
        id: '1',
        expense_type: MISCELLANEOUS_TYPE,
        amount: 250,
        expense_date: TODAY,
      })

      expect(status).toBe(400)
      expect(body.error).toBe('Describe the miscellaneous expense')
    })

    it('saves the legacy row once a detail is supplied', async () => {
      await signInAs('ADMIN')
      anExpense({ id: '1', expense_type: MISCELLANEOUS_TYPE, expense_type_detail: null })

      const { status } = await updateExpense({
        id: '1',
        expense_type: MISCELLANEOUS_TYPE,
        amount: 250,
        expense_date: TODAY,
        expense_type_detail: 'Auto fare to the bank',
      })

      expect(status).toBe(200)
      expect(db.rows('expenses')[0].expense_type_detail).toBe('Auto fare to the bank')
    })
  })
})

describe('GET /api/finances/summary — the Overview, on a cash basis (Q-36)', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await summary()).status).toBe(403)
  })

  it('reports the requested month, and rejects a nonsense one', async () => {
    await signInAs('ADMIN')

    expect((await summary({ month_year: '2026-01' })).body.month_year).toBe('2026-01')
    expect((await summary()).body.month_year).toBe(THIS_MONTH)
    expect((await summary({ month_year: 'last-year' })).status).toBe(400)
  })

  describe('money in', () => {
    it('counts every patient payment made in the month, whatever its label', async () => {
      await signInAs('ADMIN')
      aBilling({ id: 'b1' })
      anInstallment({ patient_billing_id: 'b1', amount: 5000, payment_date: '2026-03-05', kind: 'regular' })
      anInstallment({ patient_billing_id: 'b1', amount: 3000, payment_date: '2026-03-20', kind: 'advance' })
      anInstallment({ patient_billing_id: 'b1', amount: 100, payment_date: '2026-03-20', kind: 'registration' })
      anInstallment({ patient_billing_id: 'b1', amount: 900, payment_date: '2026-03-21', kind: 'medicine' })
      anInstallment({ patient_billing_id: 'b1', amount: 9999, payment_date: '2026-02-20' })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.income.total_paid).toBe(9000)
    })

    it('counts OPD receipts beside them, which it never did', async () => {
      await signInAs('ADMIN')
      aTransaction({ transaction_type: 'credit', source: 'opd', amount: 1200, transaction_date: '2026-03-05' })
      aTransaction({ transaction_type: 'credit', source: 'opd', amount: 9999, transaction_date: '2026-02-05' })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.income.opd_receipts).toBe(1200)
      expect(body.income.money_in).toBe(1200)
    })

    /** Charges are internal and move no money (CR-15). */
    it('counts no charges at all', async () => {
      await signInAs('ADMIN')
      aCharge({ amount: 500, qty: 3, charge_date: '2026-03-05' })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.income).not.toHaveProperty('total_charges')
      expect(body.income.money_in).toBe(0)
    })

    it('no longer reports pending receivables (Q-32 = A)', async () => {
      await signInAs('ADMIN')
      aBilling({ month_year: THIS_MONTH, total_charges: 26500, patient_paid_amount: 7000 })

      expect((await summary({ month_year: THIS_MONTH })).body.income).not.toHaveProperty('pending_receivables')
    })
  })

  describe('money out', () => {
    it('counts general expenses for the month', async () => {
      await signInAs('ADMIN')
      anExpense({ amount: 5000, month_year: THIS_MONTH })
      anExpense({ amount: 3000, month_year: THIS_MONTH })
      anExpense({ amount: 9999, month_year: '2026-02' })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.general_expenses).toBe(8000)
    })

    /** Q-69 = A: the float reaches the log as one line — what the desk spent. */
    it('counts what the desk spent from petty cash, and neither top-ups nor advances', async () => {
      await signInAs('ADMIN')
      aPettyCashEntry({ kind: 'expense', direction: 'out', amount: 450, entry_date: '2026-03-05' })
      aPettyCashEntry({ kind: 'expense', direction: 'out', amount: 1200, entry_date: '2026-03-06' })
      aPettyCashEntry({ kind: 'topup', direction: 'in', amount: 5000, entry_date: '2026-03-01' })
      aPettyCashEntry({ kind: 'advance', direction: 'out', amount: 2000, entry_date: '2026-03-07', advance_id: 1 })
      aPettyCashEntry({ kind: 'expense', direction: 'out', amount: 9999, entry_date: '2026-02-05' })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.petty_cash).toBe(1650)
    })

    it('counts a settled salary in full and an unsettled one at the advances drawn', async () => {
      await signInAs('ADMIN')
      aSalaryRecord({ month_year: THIS_MONTH, status: 'settled', calculated_salary: 27000, total_advance: 5000 })
      aSalaryRecord({ month_year: THIS_MONTH, status: 'pending', calculated_salary: 30000, total_advance: 4000 })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.salary_expenses).toBe(31000)
    })

    /**
     * The change that makes profit mean something: a fee is counted when it is
     * paid, not when it is priced. The old summary added up every fee on every
     * bill in the month, paid or not, and called the result an expense.
     */
    /**
     * Money out reads the **settlement rows**, not ledger debits — a payout
     * writes none any more (client revision, 2026-09-24). Reading the rows also
     * fixes a disagreement that predates the change: settling from the patient's
     * Billing tab never wrote a debit, so the ledger only ever held some of the
     * payouts. A fee paid in April is April's money, whenever it was priced.
     */
    it('counts doctor fees and commissions only once they are actually paid', async () => {
      await signInAs('ADMIN')
      // Priced, unpaid: it is money the hospital owes, not money it has spent.
      aSettlement({ settled: false, total_amount: 6500 })
      aBilling({ referral_settled: false, referral_commission_amount: 3000 })
      // Paid this month.
      aSettlement({ settled: true, settlement_amount: 2200, total_amount: 2200, settlement_date: '2026-03-05T06:00:00.000Z' })
      aBilling({ referral_settled: true, referral_commission_amount: 800, referral_settlement_date: '2026-03-06T06:00:00.000Z' })
      // Paid in another month.
      aSettlement({ settled: true, settlement_amount: 9999, total_amount: 9999, settlement_date: '2026-02-05T06:00:00.000Z' })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.expenses.doctor_fees).toBe(2200)
      expect(body.expenses.referral_commissions).toBe(800)
    })

    /**
     * Two columns hold a settled fee's amount and they disagree on live rows —
     * one had `total_amount` 0 against `settlement_amount` 1,000. Money out and
     * the patient's Overview must pick the same one, or the two screens report
     * different figures for the same payout.
     */
    it("prefers the settled amount over the priced one, as the patient's Overview does", async () => {
      await signInAs('ADMIN')
      aSettlement({ settled: true, total_amount: 0, settlement_amount: 1000, settlement_date: '2026-03-05T06:00:00.000Z' })
      aSettlement({ settled: true, total_amount: 2000, settlement_amount: null, settlement_date: '2026-03-06T06:00:00.000Z' })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.doctor_fees).toBe(3000)
    })

    /**
     * Both settlement dates are instants, not dates. A fee paid at 02:00 IST on
     * the 1st is 20:30 UTC on the last of the month before, so a `YYYY-MM-DD`
     * string compare would file it in the wrong month.
     */
    it('puts an early-morning payout in the right IST month', async () => {
      await signInAs('ADMIN')
      // 00:30 IST on 1 March = 19:00 UTC on 28 February.
      aSettlement({ settled: true, total_amount: 500, settlement_amount: 500, settlement_date: '2026-02-28T19:00:00.000Z' })
      // 23:45 IST on 31 March = 18:15 UTC on 31 March.
      aSettlement({ settled: true, total_amount: 700, settlement_amount: 700, settlement_date: '2026-03-31T18:15:00.000Z' })
      // 00:30 IST on 1 April = 19:00 UTC on 31 March — next month's.
      aSettlement({ settled: true, total_amount: 900, settlement_amount: 900, settlement_date: '2026-03-31T19:00:00.000Z' })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.doctor_fees).toBe(1200)
    })

    /**
     * The other half of the reversal: an Included lab or medicine charge is the
     * hospital's expense (Q-83, reversed), counted in the month of the charge
     * rather than when the lab is paid — the patient's money has already come
     * in, so the obligation belongs beside it.
     */
    it('counts an included lab or medicine charge as an expense', async () => {
      await signInAs('ADMIN')
      aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })
      aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy' })
      aChargeItem({ id: 'room', name: 'Room', category: 'room' })
      aCharge({ charge_item_id: 'lab', amount: 300, qty: 2, charge_date: '2026-03-05', lab_medicine_status: 'included' })
      aCharge({ charge_item_id: 'med', amount: 900, qty: 1, charge_date: '2026-03-06', lab_medicine_status: 'included' })
      // Not decided: nobody has said the hospital carries it, so it is nobody's.
      aCharge({ charge_item_id: 'med', amount: 5000, qty: 1, charge_date: '2026-03-07', lab_medicine_status: null })
      // A room charge is internal and moves no money, whatever its status says.
      aCharge({ charge_item_id: 'room', amount: 8000, qty: 1, charge_date: '2026-03-08', lab_medicine_status: 'included' })
      // Another month's.
      aCharge({ charge_item_id: 'lab', amount: 4000, qty: 1, charge_date: '2026-02-20', lab_medicine_status: 'included' })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.lab_medicine).toBe(1500)
    })

    /** Desk expenses booked to the ledger before petty cash existed (CR-07). */
    it('still counts the legacy ledger expenses, for the months they fall in', async () => {
      await signInAs('ADMIN')
      aTransaction({ transaction_type: 'debit', source: 'expense', amount: 2500, transaction_date: '2026-03-05' })
      aTransaction({ transaction_type: 'debit', source: 'opd', amount: 9999, transaction_date: '2026-03-05' })
      aTransaction({ transaction_type: 'credit', source: 'expense', amount: 9999, transaction_date: '2026-03-05' })

      expect((await summary({ month_year: THIS_MONTH })).body.expenses.ledger_expenses).toBe(2500)
    })

    it('adds the parts up to the total', async () => {
      await signInAs('ADMIN')
      anExpense({ amount: 4000, month_year: THIS_MONTH })
      aPettyCashEntry({ kind: 'expense', direction: 'out', amount: 500, entry_date: '2026-03-05' })
      aSalaryRecord({ month_year: THIS_MONTH, status: 'settled', calculated_salary: 20000 })
      aSettlement({ settled: true, total_amount: 1000, settlement_amount: 1000, settlement_date: '2026-03-05T06:00:00.000Z' })
      aBilling({ referral_settled: true, referral_commission_amount: 300, referral_settlement_date: '2026-03-05T06:00:00.000Z' })
      aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })
      aCharge({ charge_item_id: 'lab', amount: 200, qty: 1, charge_date: '2026-03-05', lab_medicine_status: 'included' })
      aTransaction({ transaction_type: 'debit', source: 'expense', amount: 100, transaction_date: '2026-03-05' })

      // 4,000 + 500 + 20,000 + 1,000 + 300 + 200 + 100
      expect((await summary({ month_year: THIS_MONTH })).body.expenses.total_expenses).toBe(26100)
    })
  })

  describe('profit', () => {
    it('is money in minus money out', async () => {
      await signInAs('ADMIN')
      aBilling({ id: 'b1' })
      anInstallment({ patient_billing_id: 'b1', amount: 10000, payment_date: '2026-03-05' })
      anExpense({ amount: 4000, month_year: THIS_MONTH })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.expenses.total_expenses).toBe(4000)
      expect(body.profit.net_profit).toBe(6000)
      expect(body.profit.profit_margin).toBe(60)
      expect(body.profit.is_profit).toBe(true)
    })

    it('reports a zero margin when nothing came in', async () => {
      await signInAs('ADMIN')
      anExpense({ amount: 4000, month_year: THIS_MONTH })

      const { body } = await summary({ month_year: THIS_MONTH })
      expect(body.profit.profit_margin).toBe(0)
      expect(body.profit.net_profit).toBe(-4000)
      expect(body.profit.is_profit).toBe(false)
    })
  })

  /** Q-81 (b): priced but unpaid, listed per patient, and never in money out. */
  describe('what is still owed', () => {
    it('lists outstanding doctor fees and commissions across all months', async () => {
      await signInAs('ADMIN')
      aSettlement({ settled: false, total_amount: 4500 })
      aSettlement({ settled: false, total_amount: 2000 })
      aSettlement({ settled: true, total_amount: 9999 })
      aSettlement({ settled: false, total_amount: 8888, deleted_at: '2026-03-01T00:00:00.000Z' })
      aBilling({ referral_settled: false, referral_commission_amount: 3000 })
      aBilling({ referral_settled: true, referral_commission_amount: 9999 })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.pending_settlements.doctor_fees).toBe(6500)
      expect(body.pending_settlements.doctor_count).toBe(2)
      expect(body.pending_settlements.referral_commissions).toBe(3000)
      expect(body.pending_settlements.total).toBe(9500)
      expect(body.pending_settlements.rows).toHaveLength(3)
    })

    it('keeps them out of money out', async () => {
      await signInAs('ADMIN')
      aSettlement({ settled: false, total_amount: 4500 })
      aBilling({ month_year: THIS_MONTH, referral_settled: false, referral_commission_amount: 3000 })

      const { body } = await summary({ month_year: THIS_MONTH })

      expect(body.expenses.total_expenses).toBe(0)
      expect(body.profit.net_profit).toBe(0)
    })
  })

  /** The ledger is its own screen now (CR-08). */
  it('no longer carries a transaction list', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: '2026-03-05' })

    expect((await summary({ month_year: THIS_MONTH })).body).not.toHaveProperty('recent_transactions')
  })
})

describe('POST /api/finances/doctor-settlements — pay out', () => {
  // Reception prices and pays doctor fees now (CR-04, Q-19 f); the lab does not.
  it('refuses LAB_TECHNICIAN', async () => {
    await signInAs('LAB_TECHNICIAN')

    expect((await settlements()).status).toBe(403)
    expect((await paySettlements({ settlement_ids: ['s1'], payment_method: 'cash' })).status).toBe(403)
  })

  it('lists unsettled fees with doctor and patient attached', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aPatient({ id: 'p1', name: 'Ramesh' })
    aSettlement({ id: 's1', doctor_id: 'd1', patient_id: 'p1', settled: false })
    aSettlement({ id: 's2', settled: true })

    const { status, body } = await settlements({ settled: 'false' })

    expect(status).toBe(200)
    expect(body.data.map((s: any) => s.id)).toEqual(['s1'])
    expect(body.data[0].doctor.name).toBe('Dr. Ramesh')
  })

  it('excludes soft-deleted settlements', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: false })
    aSettlement({ id: 's2', settled: false, deleted_at: '2026-03-01T00:00:00.000Z' })

    expect((await settlements()).body.data.map((s: any) => s.id)).toEqual(['s1'])
  })

  it('requires settlement ids and a payment method', async () => {
    await signInAs('ADMIN')

    expect((await paySettlements({ payment_method: 'cash' })).status).toBe(400)
    expect((await paySettlements({ settlement_ids: [] , payment_method: 'cash' })).status).toBe(400)
    expect((await paySettlements({ settlement_ids: ['s1'] })).status).toBe(400)
  })

  it('marks the fees settled, recording how and by whom', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aSettlement({ id: 's1', doctor_id: 'd1', settled: false, total_amount: 4500, patient_id: 'p1' })

    const { status } = await paySettlements({
      settlement_ids: ['s1'],
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-1',
    })

    expect(status).toBe(200)
    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')).toMatchObject({
      settled: true,
      settlement_amount: 4500,
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-1',
      settled_by: 'u-admin',
      status_set_by: 'u-admin',
      given_by_user_id: 'u-admin',
    })
    // The money comes straight from the admin, so the ledger sees none of it.
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  /**
   * Both Settle dialogs in Finances used to accept no "given by" at all, so a
   * payout made here recorded less than the same payout made from the patient.
   */
  it('records who handed the money over, when it was not the person paying', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aSettlement({ id: 's1', settled: false, total_amount: 4500 })

    await paySettlements({
      settlement_ids: ['s1'],
      payment_method: 'cash',
      given_by_user_id: 'u-recep',
    })

    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')).toMatchObject({
      given_by_user_id: 'u-recep',
      given_by_set_by: 'u-admin',
    })
  })

  it('takes a typed name for someone with no login', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aSettlement({ id: 's1', settled: false, total_amount: 4500 })

    await paySettlements({
      settlement_ids: ['s1'],
      payment_method: 'cash',
      given_by: 'Ravi (ward boy)',
    })

    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')).toMatchObject({
      given_by: 'Ravi (ward boy)',
      given_by_user_id: null,
    })
  })

  it('skips settlements that were already paid', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: true, settlement_amount: 4500, total_amount: 4500 })

    await paySettlements({ settlement_ids: ['s1'], payment_method: 'cash' })

    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')!.status_set_by ?? null).toBeNull()
  })

  /**
   * One amount cannot describe several settlements. The route used to write
   * `settlement_amount` onto every selected row, so paying "5000" against three
   * selected fees stamped each doctor as paid 5,000 regardless of what they were
   * owed — and booked 15,000 as leaving the hospital.
   */
  it('pays each selected fee at its own total, not one figure for all of them', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aDoctor({ id: 'd2', name: 'Dr. Iyer' })
    aSettlement({ id: 's1', doctor_id: 'd1', settled: false, total_amount: 600, patient_id: 'p1' })
    aSettlement({ id: 's2', doctor_id: 'd2', settled: false, total_amount: 5000, patient_id: 'p1' })

    const { status } = await paySettlements({
      settlement_ids: ['s1', 's2'],
      payment_method: 'cash',
    })

    expect(status).toBe(200)

    const amounts = db
      .rows('doctor_visit_settlements')
      .map((r) => Number(r.settlement_amount))
      .sort((a, b) => a - b)
    expect(amounts).toEqual([600, 5000])
  })

  it('refuses an explicit amount when more than one fee is selected', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: false, total_amount: 600 })
    aSettlement({ id: 's2', settled: false, total_amount: 5000 })

    const { status } = await paySettlements({
      settlement_ids: ['s1', 's2'],
      settlement_amount: 5000,
      payment_method: 'cash',
    })

    expect(status).toBe(400)
    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')!.settled).toBe(false)
  })

  it('still accepts an explicit amount for a single fee', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aSettlement({ id: 's1', doctor_id: 'd1', settled: false, total_amount: 5000, patient_id: 'p1' })

    // Part payment, deliberately less than the total.
    const { status } = await paySettlements({
      settlement_ids: ['s1'],
      settlement_amount: 3000,
      payment_method: 'cash',
    })

    expect(status).toBe(200)
    // What was paid is what it cost (Q-37 b): both columns say 3,000.
    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')).toMatchObject({
      settlement_amount: 3000,
      total_amount: 3000,
    })
  })

  /**
   * Was BUGS.md #52: the route settled each row blind, from the ids alone, so it
   * could not know what any of them was owed. It reads each settlement first
   * now, which is also what lets each be paid at its own total.
   */
  it('returns each settled fee with its doctor', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aSettlement({ id: 's1', doctor_id: 'd1', settled: false, total_amount: 4500 })

    const { body } = await paySettlements({ settlement_ids: ['s1'], payment_method: 'cash' })

    expect(body.data[0].doctor).toMatchObject({ name: 'Dr. Ramesh' })
  })
})

describe('/api/finances/referral-commissions', () => {
  it('refuses LAB_TECHNICIAN', async () => {
    await signInAs('LAB_TECHNICIAN')

    expect((await commissions()).status).toBe(403)
    expect((await payCommission({ billing_ids: ['b1'], payment_method: 'cash' })).status).toBe(403)
  })

  it('lists billings that carry a commission', async () => {
    await signInAs('ADMIN')
    aReferral({ id: 'r1', name: 'Dr. Referrer' })
    aPatient({ id: 'p1', referred_by: 'r1' })
    aBilling({ id: 'b1', patient_id: 'p1', referral_commission_amount: 3000, referral_settled: false })
    aBilling({ id: 'b2', referral_commission_amount: 0 })

    const { status, body } = await commissions({ settled: 'false' })

    expect(status).toBe(200)
    expect(body.data.map((b: any) => b.id)).toEqual(['b1'])
  })

  it('requires billing ids and a payment method', async () => {
    await signInAs('ADMIN')

    expect((await payCommission({ payment_method: 'cash' })).status).toBe(400)
    expect((await payCommission({ billing_ids: ['b1'] })).status).toBe(400)
  })

  it('settles the commissions, recording how and by whom', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1', referral_commission_amount: 3000, referral_settled: false })

    const { status, body } = await payCommission({
      billing_ids: ['b1'],
      payment_method: 'cash',
      settlement_notes: 'March payout',
    })

    expect(status).toBe(200)
    expect(body.message).toBe('1 commission(s) settled successfully')

    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      referral_settled: true,
      referral_settlement_notes: 'March payout',
      referral_settlement_payment_method: 'cash',
      // Who marked it paid — there was no record of this at all before.
      referral_status_set_by: 'u-admin',
      referral_given_by_user_id: 'u-admin',
    })
    // Nothing reaches the ledger: the admin hands the money over directly.
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('records someone else as having carried the commission', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBilling({ id: 'b1', referral_commission_amount: 3000, referral_settled: false })

    const { status } = await payCommission({
      billing_ids: ['b1'],
      payment_method: 'cash',
      given_by_user_id: 'u-recep',
    })

    expect(status).toBe(200)
    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      referral_given_by_user_id: 'u-recep',
      referral_given_by_set_by: 'u-admin',
    })
  })

  it('skips commissions that were already settled', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', referral_commission_amount: 3000, referral_settled: true })

    await payCommission({ billing_ids: ['b1'], payment_method: 'cash' })

    expect(db.find('patient_billing', (r) => r.id === 'b1')!.referral_status_set_by ?? null).toBeNull()
  })
})
