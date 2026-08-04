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
  anInstallment,
  aSalaryRecord,
  aTransaction,
  aSettlement,
  aDoctor,
  aPatient,
  aReferral,
} from '../../helpers/seed'
import { THIS_MONTH, TODAY } from '../../setup'
import {
  EXPENSE_DETAIL_MAX,
  EXPENSE_TYPES,
  MISCELLANEOUS_TYPE,
} from '@/lib/finances/constants'

const expenses = (query = {}) => call(listExpenses, 'GET', '/api/finances/expenses', { query })
const createExpense = (body: unknown) => call(addExpense, 'POST', '/api/finances/expenses', { body })
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

describe('GET /api/finances/summary', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await summary()).status).toBe(403)
  })

  it('reports the requested month', async () => {
    await signInAs('ADMIN')

    expect((await summary({ month_year: '2026-01' })).body.month_year).toBe('2026-01')
    expect((await summary()).body.month_year).toBe(THIS_MONTH)
  })

  it('sums patient payments made during the month as income', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    anInstallment({ patient_billing_id: 'b1', amount: 5000, payment_date: '2026-03-05' })
    anInstallment({ patient_billing_id: 'b1', amount: 3000, payment_date: '2026-03-20' })
    anInstallment({ patient_billing_id: 'b1', amount: 9999, payment_date: '2026-02-20' })

    const { body } = await summary({ month_year: THIS_MONTH })

    expect(body.income.total_paid).toBe(8000)
    expect(body.income.net_income).toBe(8000)
  })

  it('sums charges raised during the month, multiplied by quantity', async () => {
    await signInAs('ADMIN')
    aCharge({ amount: 500, qty: 3, charge_date: '2026-03-05' })
    aCharge({ amount: 200, qty: 1, charge_date: '2026-03-06' })
    aCharge({ amount: 9999, qty: 1, charge_date: '2026-02-05' })

    expect((await summary({ month_year: THIS_MONTH })).body.income.total_charges).toBe(1700)
  })

  it('sums general expenses for the month', async () => {
    await signInAs('ADMIN')
    anExpense({ amount: 5000, month_year: THIS_MONTH })
    anExpense({ amount: 3000, month_year: THIS_MONTH })
    anExpense({ amount: 9999, month_year: '2026-02' })

    expect((await summary({ month_year: THIS_MONTH })).body.expenses.general_expenses).toBe(8000)
  })

  it('counts a settled salary at its full value but an unsettled one only at the advance drawn', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ month_year: THIS_MONTH, status: 'settled', calculated_salary: 27000, total_advance: 5000 })
    aSalaryRecord({ month_year: THIS_MONTH, status: 'pending', calculated_salary: 30000, total_advance: 4000 })

    expect((await summary({ month_year: THIS_MONTH })).body.expenses.salary_expenses).toBe(31000)
  })

  it('sums ledger debits booked to expenses', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_type: 'debit', source: 'expense', amount: 2500, transaction_date: '2026-03-05' })
    aTransaction({ transaction_type: 'debit', source: 'opd', amount: 9999, transaction_date: '2026-03-05' })
    aTransaction({ transaction_type: 'credit', source: 'expense', amount: 9999, transaction_date: '2026-03-05' })

    expect((await summary({ month_year: THIS_MONTH })).body.expenses.ledger_expenses).toBe(2500)
  })

  it('derives profit and margin from income minus expenses', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    anInstallment({ patient_billing_id: 'b1', amount: 10000, payment_date: '2026-03-05' })
    anExpense({ amount: 4000, month_year: THIS_MONTH })

    const { body } = await summary({ month_year: THIS_MONTH })

    expect(body.expenses.total_expenses).toBe(4000)
    expect(body.profit.net_profit).toBe(6000)
    expect(body.profit.profit_margin).toBe(60)
  })

  it('reports a zero margin when there was no income', async () => {
    await signInAs('ADMIN')
    anExpense({ amount: 4000, month_year: THIS_MONTH })

    const { body } = await summary({ month_year: THIS_MONTH })
    expect(body.profit.profit_margin).toBe(0)
    expect(body.profit.net_profit).toBe(-4000)
  })

  it('reports outstanding doctor fees and commissions across all months', async () => {
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
  })

  it('lists the month’s ledger transactions', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: '2026-03-05' })
    aTransaction({ id: 't2', transaction_date: '2026-02-05' })

    const { body } = await summary({ month_year: THIS_MONTH })
    expect(body.recent_transactions.map((t: any) => t.id)).toEqual(['t1'])
  })

  /**
   * BUGS.md #16/#23, resolved — patient_billing now has both package-flag columns
   * (supabase/migrations/20260805000001_patient_billing_package_flags.sql), so the
   * summary's billing query no longer errors and these figures read real values again.
   */
  it('should report referral commission for the month', async () => {
    await signInAs('ADMIN')
    aBilling({ month_year: THIS_MONTH, referral_commission_amount: 3000 })

    expect((await summary({ month_year: THIS_MONTH })).body.income.total_commission).toBe(3000)
  })

  it('should report doctor fees for the month', async () => {
    await signInAs('ADMIN')
    aBilling({ month_year: THIS_MONTH, total_doctor_fees: 6500 })

    expect((await summary({ month_year: THIS_MONTH })).body.expenses.doctor_fees).toBe(6500)
  })

  it('should report pending receivables', async () => {
    await signInAs('ADMIN')
    aBilling({ month_year: THIS_MONTH, total_charges: 26500, patient_paid_amount: 7000 })

    expect((await summary({ month_year: THIS_MONTH })).body.income.pending_receivables).toBe(19500)
  })

  /**
   * Known defect — see BUGS.md #51. The payment-mode breakdown is computed and then left
   * out of the response, while the client type declares it — so it is always undefined.
   */
  it.fails('should return the payment mode breakdown the client expects', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-05', payment_mode: 'cash', transaction_type: 'credit', amount: 1000 })

    expect((await summary({ month_year: THIS_MONTH })).body.payment_mode_breakdown).toBeDefined()
  })
})

describe('POST /api/finances/doctor-settlements — pay out', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

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

  it('marks the fees settled and books a ledger debit for each', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aSettlement({ id: 's1', doctor_id: 'd1', settled: false, total_amount: 4500, patient_id: 'p1' })

    const { status } = await paySettlements({
      settlement_ids: ['s1'],
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-1',
    })

    expect(status).toBe(200)
    expect(db.find('doctor_visit_settlements', (r) => r.id === 's1')!.settled).toBe(true)

    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      transaction_type: 'debit',
      source: 'doctor_settlement',
      amount: 4500,
      payment_mode: 'bank_transfer',
      status: 'verified',
    })
  })

  it('skips settlements that were already paid', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: true, total_amount: 4500 })

    await paySettlements({ settlement_ids: ['s1'], payment_method: 'cash' })

    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  /**
   * Known defect — see BUGS.md #52. The ledger description is built from a row returned by
   * an update that carries no joins, so `settlement.doctor?.name` is always undefined and
   * every payout is recorded against "Unknown Doctor".
   */
  it.fails('should name the doctor in the ledger entry', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aSettlement({ id: 's1', doctor_id: 'd1', settled: false, total_amount: 4500 })

    await paySettlements({ settlement_ids: ['s1'], payment_method: 'cash' })

    expect(db.rows('daily_ledger_transactions')[0].description).toContain('Dr. Ramesh')
  })
})

describe('/api/finances/referral-commissions', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

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

  it('settles the commissions and books a ledger debit for each', async () => {
    await signInAs('ADMIN')
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
    })

    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      transaction_type: 'debit',
      source: 'referral_commission',
      amount: 3000,
      payment_mode: 'cash',
      patient_id: 'p1',
      status: 'verified',
    })
  })

  it('skips commissions that were already settled', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', referral_commission_amount: 3000, referral_settled: true })

    await payCommission({ billing_ids: ['b1'], payment_method: 'cash' })

    expect(db.count('daily_ledger_transactions')).toBe(0)
  })
})
