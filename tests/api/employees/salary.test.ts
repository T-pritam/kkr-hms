/**
 * /api/employees/salary/* — monthly salary calculation and settlement.
 *
 * The formula (identical in the bulk route and the single-record PATCH):
 *   total_working_days = 27          (a constant)
 *   daily_rate         = base_salary / 30      (note: /30, not /27)
 *   regular_salary     = base_salary − ((27 − days_present) × daily_rate)
 *   ot_salary          = daily_rate × ot_days  (only when days_present is exactly 27)
 *   calculated_salary  = round2(regular + ot)
 *   final_salary       = round2(calculated − total_advance)
 */

import { describe, it, expect } from 'vitest'
import { GET as salaryList } from '@/app/api/employees/salary/route'
import { POST as creditMonthly } from '@/app/api/employees/salary/monthly/route'
import {
  GET as getSalary,
  PATCH as editSalary,
  DELETE as deleteSalary,
} from '@/app/api/employees/salary/[id]/route'
import { POST as settleOne } from '@/app/api/employees/salary/settle/route'
import { POST as settleAll } from '@/app/api/employees/salary/settle-all/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { anEmployee, aSalaryRecord, anAdvance } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const list = (query = {}) => call(salaryList, 'GET', '/api/employees/salary', { query })
const credit = (body: unknown) => call(creditMonthly, 'POST', '/api/employees/salary/monthly', { body })
const read = (id: string) => call(getSalary, 'GET', `/api/employees/salary/${id}`, { params: { id } })
const edit = (id: string, body: unknown) =>
  call(editSalary, 'PATCH', `/api/employees/salary/${id}`, { body, params: { id } })
const remove = (id: string) => call(deleteSalary, 'DELETE', `/api/employees/salary/${id}`, { params: { id } })
const settle = (body: unknown) => call(settleOne, 'POST', '/api/employees/salary/settle', { body })
const settleEveryone = (body: unknown) => call(settleAll, 'POST', '/api/employees/salary/settle-all', { body })

const record = (id: string) => db.find('salary_payments', (r) => String(r.id) === id)!

describe('salary — access control', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list({ month_year: THIS_MONTH })).status).toBe(401)
    expect((await credit({ month_year: THIS_MONTH, employees_data: [] })).status).toBe(401)
    expect((await settle({ employee_id: 'e1', month_year: THIS_MONTH })).status).toBe(401)
  })

  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

    expect((await list({ month_year: THIS_MONTH })).status).toBe(403)
    expect((await settleEveryone({ month_year: THIS_MONTH })).status).toBe(403)
  })
})

describe('POST /api/employees/salary/monthly — the calculation', () => {
  const creditFor = (employee: Record<string, unknown>) =>
    credit({ month_year: THIS_MONTH, employees_data: [employee] })

  it('pays the full salary for a full month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { status } = await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: 27, ot_days: 0 })

    expect(status).toBe(201)
    expect(db.rows('salary_payments')[0]).toMatchObject({
      employee_id: 'e1',
      month_year: THIS_MONTH,
      base_salary: 27000,
      total_working_days: 27,
      days_present: 27,
      calculated_salary: 27000,
      final_salary: 27000,
      status: 'pending',
    })
  })

  it('deducts absent days at base ÷ 30', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    // 30000/30 = 1000 a day; 2 days absent → 30000 − 2000 = 28000
    await creditFor({ employee_id: 'e1', base_salary: 30000, days_present: 25, ot_days: 0 })

    expect(db.rows('salary_payments')[0].calculated_salary).toBe(28000)
  })

  it('pays overtime only when every working day was attended', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })

    await credit({
      month_year: THIS_MONTH,
      employees_data: [
        { employee_id: 'e1', base_salary: 30000, days_present: 27, ot_days: 2 },
        { employee_id: 'e2', base_salary: 30000, days_present: 26, ot_days: 2 },
      ],
    })

    const full = db.rows('salary_payments').find((r) => r.employee_id === 'e1')!
    const partial = db.rows('salary_payments').find((r) => r.employee_id === 'e2')!

    expect(full.calculated_salary).toBe(32000) // 30000 + 2 × 1000
    expect(full.ot_days).toBe(2)
    expect(partial.ot_days).toBe(0) // overtime dropped
    expect(partial.calculated_salary).toBe(29000) // 30000 − 1000
  })

  it('subtracts the month’s advances to reach the final salary', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anAdvance({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 9999, month_year: '2026-02' })

    await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: 27, ot_days: 0 })

    expect(db.rows('salary_payments')[0]).toMatchObject({ total_advance: 7000, final_salary: 20000 })
  })

  it('rounds to two decimal places', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    // 27000/30 = 900; 26 days → 27000 − 900 = 26100 exactly, so use an awkward base
    await creditFor({ employee_id: 'e1', base_salary: 27777, days_present: 26, ot_days: 0 })

    const calculated = db.rows('salary_payments')[0].calculated_salary
    expect(calculated).toBe(Number(calculated.toFixed(2)))
  })

  it('pays nothing for a month with no attendance', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    // 27 days absent at 30000/30 = 1000 → 30000 − 27000 = 3000
    await creditFor({ employee_id: 'e1', base_salary: 30000, days_present: 0, ot_days: 0 })

    expect(db.rows('salary_payments')[0].calculated_salary).toBe(3000)
  })

  it.each([
    ['a malformed month', { month_year: 'March', employees_data: [{ employee_id: 'e1', base_salary: 1, days_present: 1 }] }],
    ['an empty employee list', { month_year: THIS_MONTH, employees_data: [] }],
    ['a missing employee list', { month_year: THIS_MONTH }],
  ])('rejects %s', async (_case, body) => {
    await signInAs('ADMIN')

    expect((await credit(body)).status).toBe(400)
  })

  it.each([-1, 28, 30])('rejects days_present of %i', async (days) => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { status } = await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: days, ot_days: 0 })
    expect(status).toBeGreaterThanOrEqual(400)
  })

  it.each([-1, 4, 10])('rejects ot_days of %i', async (ot) => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { status } = await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: 27, ot_days: ot })
    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('updates an existing record rather than creating a second one', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: 27, ot_days: 0 })
    await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: 25, ot_days: 0 })

    expect(db.count('salary_payments')).toBe(1)
    expect(db.rows('salary_payments')[0].days_present).toBe(25)
  })

  it('skips employees whose salary is already settled', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled', days_present: 27 })

    const { status, body } = await credit({
      month_year: THIS_MONTH,
      employees_data: [
        { employee_id: 'e1', base_salary: 27000, days_present: 10, ot_days: 0 },
        { employee_id: 'e2', base_salary: 27000, days_present: 27, ot_days: 0 },
      ],
    })

    expect(status).toBe(201)
    expect(body.skipped_settled).toBe(1)
    expect(record('1').days_present).toBe(27) // untouched
  })

  it('refuses when every employee in the batch is already settled', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled' })

    const { status, body } = await creditFor({ employee_id: 'e1', base_salary: 27000, days_present: 27, ot_days: 0 })

    expect(status).toBe(400)
    expect(body.error).toBe('All employees already have settled records for this month')
  })
})

describe('GET /api/employees/salary', () => {
  it('requires a month', async () => {
    await signInAs('ADMIN')

    const { status } = await list()
    expect(status).toBe(400)
  })

  it('summarises what has been advanced, settled and is still owed', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Amit' })
    anEmployee({ id: 'e2', name: 'Zara' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending', final_salary: 20000 })
    aSalaryRecord({ id: '2', employee_id: 'e2', month_year: THIS_MONTH, status: 'settled', final_salary: 24000 })
    anAdvance({ employee_id: 'e1', amount: 7000, month_year: THIS_MONTH })

    const { status, body } = await list({ month_year: THIS_MONTH })

    expect(status).toBe(200)
    expect(body.summary).toMatchObject({
      total_advances_paid: 7000,
      need_to_settle: 20000,
      settled_amount: 24000,
      grand_total: 51000,
      pending_count: 1,
      settled_count: 1,
    })
  })

  it('keeps an inactive employee visible when they have a record that month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Gone', status: 'Inactive' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, final_salary: 15000 })

    const { body } = await list({ month_year: THIS_MONTH })
    expect(body.data.map((e: any) => e.id)).toContain('e1')
  })
})

describe('/api/employees/salary/[id]', () => {
  it('returns 404 for an unknown record', async () => {
    await signInAs('ADMIN')

    const { status, body } = await read('999')
    expect(status).toBe(404)
    expect(body.error).toBe('Salary record not found')
  })

  it('recomputes the salary when attendance is corrected', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    aSalaryRecord({
      id: '1',
      employee_id: 'e1',
      month_year: THIS_MONTH,
      base_salary: 30000,
      days_present: 27,
      calculated_salary: 30000,
      final_salary: 30000,
    })

    const { status } = await edit('1', { days_present: 25 })

    expect(status).toBe(200)
    expect(record('1')).toMatchObject({ days_present: 25, calculated_salary: 28000, final_salary: 28000 })
  })

  it('refuses overtime on a month that was not fully attended', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, days_present: 25 })

    const { status, body } = await edit('1', { days_present: 25, ot_days: 2 })
    expect(status).toBe(400)
    expect(body.error).toBe('ot_days can only be set when days_present is 27')
  })

  it.each([
    ['days_present', { days_present: 30 }, 'days_present must be between 0 and 27'],
    ['ot_days', { days_present: 27, ot_days: 5 }, 'ot_days must be between 0 and 3'],
    ['base_salary', { base_salary: 0 }, 'base_salary must be greater than 0'],
  ])('validates %s', async (_field, body, message) => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH })

    const { status, body: response } = await edit('1', body)
    expect(status).toBe(400)
    expect(response.error).toBe(message)
  })

  it('refuses to edit a settled record', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled', days_present: 27 })

    const { status, body } = await edit('1', { days_present: 20 })

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot update settled salary records')
    expect(record('1').days_present).toBe(27)
  })

  it('deletes a pending record', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending' })

    expect((await remove('1')).status).toBe(200)
    expect(db.count('salary_payments')).toBe(0)
  })

  it('refuses to delete a settled record', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled' })

    const { status, body } = await remove('1')
    expect(status).toBe(400)
    expect(body.error).toBe('Cannot delete settled salary records')
    expect(db.count('salary_payments')).toBe(1)
  })
})

describe('POST /api/employees/salary/settle', () => {
  it('requires an employee and a well-formed month', async () => {
    await signInAs('ADMIN')

    expect((await settle({ month_year: THIS_MONTH })).status).toBe(400)
    expect((await settle({ employee_id: 'e1', month_year: 'March' })).status).toBe(400)
  })

  it('returns 404 when there is no record for that month', async () => {
    await signInAs('ADMIN')

    const { status, body } = await settle({ employee_id: 'e1', month_year: THIS_MONTH })
    expect(status).toBe(404)
    expect(body.error).toBe('Salary record not found')
  })

  it('marks the record settled and stamps the date', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending', final_salary: 20000 })

    const { status } = await settle({ employee_id: 'e1', month_year: THIS_MONTH })

    expect(status).toBe(200)
    expect(record('1')).toMatchObject({ status: 'settled', settled_on: TODAY, final_salary: 20000 })
  })

  it('refuses to settle twice', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled' })

    const { status, body } = await settle({ employee_id: 'e1', month_year: THIS_MONTH })
    expect(status).toBe(400)
    expect(body.error).toBe('Salary already settled')
  })

  /**
   * Known defect — see BUGS.md #56. Settling a salary moves real money but writes no
   * ledger entry, so payroll never appears in the daily cash book — unlike doctor fees and
   * referral commissions, which both post a debit.
   */
  it.fails('should record the payout in the daily ledger', async () => {
    await signInAs('ADMIN')
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending', final_salary: 20000 })

    await settle({ employee_id: 'e1', month_year: THIS_MONTH })

    expect(db.count('daily_ledger_transactions')).toBe(1)
  })
})

describe('POST /api/employees/salary/settle-all', () => {
  it('rejects a malformed month', async () => {
    await signInAs('ADMIN')

    expect((await settleEveryone({ month_year: 'March' })).status).toBe(400)
  })

  it('refuses while any active employee is missing a salary record', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending' })

    const { status, body } = await settleEveryone({ month_year: THIS_MONTH })

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot settle all: 1 active employees are missing salary records')
    expect(body.missing_employee_ids).toEqual(['e2'])
    expect(record('1').status).toBe('pending')
  })

  it('ignores inactive employees when checking for missing records', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2', status: 'Inactive' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending' })

    expect((await settleEveryone({ month_year: THIS_MONTH })).status).toBe(200)
  })

  it('settles every pending record for the month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'pending' })
    aSalaryRecord({ id: '2', employee_id: 'e2', month_year: THIS_MONTH, status: 'pending' })
    aSalaryRecord({ id: '3', employee_id: 'e1', month_year: '2026-02', status: 'pending' })

    const { status, body } = await settleEveryone({ month_year: THIS_MONTH })

    expect(status).toBe(200)
    expect(body.settled_count).toBe(2)
    expect(record('1')).toMatchObject({ status: 'settled', settled_on: TODAY })
    expect(record('2').status).toBe('settled')
    expect(record('3').status).toBe('pending')
  })

  it('reports success with a zero count when nothing is pending', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled' })

    const { status, body } = await settleEveryone({ month_year: THIS_MONTH })

    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, message: 'No pending salaries to settle', settled_count: 0 })
  })
})
