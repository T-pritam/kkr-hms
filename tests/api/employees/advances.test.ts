/**
 * The salary advance log — /api/employees/advances and the routes reception can reach.
 *
 * Two things this file exists to hold in place.
 *
 * **The role split.** Reception can read the log and nothing else in the module.
 * They must not be able to pay an advance, and they must not be able to see the
 * staff register or payroll. Before this work `POST /api/employees/[id]/salary/
 * advances` and its validation sibling had **no role check at all** — they
 * verified the token, never read `payload.role`, and went straight to work, so
 * any signed-in user could pay an advance out of anyone's salary.
 *
 * **Attribution.** `given_by` (who handed over the cash, free text) and
 * `created_by` (who was at the keyboard) are separate answers to separate
 * questions, and neither was recorded anywhere before.
 */

import { describe, it, expect } from 'vitest'
import { GET as listAdvances, POST as addAdvance } from '@/app/api/employees/advances/route'
import { POST as addEmployeeAdvance } from '@/app/api/employees/[id]/salary/advances/route'
import { GET as advanceValidation } from '@/app/api/employees/[id]/salary/advances/validation/route'
import { GET as employeeHistory } from '@/app/api/employees/[id]/history/route'
import { GET as payslip } from '@/app/api/employees/[id]/payslip/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { anEmployee, anAdvance, aSalaryRecord } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const log = (query: Record<string, unknown> = {}) =>
  call(listAdvances, 'GET', '/api/employees/advances', { query: { month_year: THIS_MONTH, ...query } })

const createAdvance = (body: unknown) =>
  call(addAdvance, 'POST', '/api/employees/advances', { body })

const payAdvance = (id: string, body: unknown) =>
  call(addEmployeeAdvance, 'POST', `/api/employees/${id}/salary/advances`, { body, params: { id } })

const validation = (id: string, query: Record<string, unknown> = {}) =>
  call(advanceValidation, 'GET', `/api/employees/${id}/salary/advances/validation`, {
    params: { id },
    query: { month_year: THIS_MONTH, ...query },
  })

const history = (id: string) =>
  call(employeeHistory, 'GET', `/api/employees/${id}/history`, { params: { id } })

const slip = (id: string, query: Record<string, unknown> = {}) =>
  call(payslip, 'GET', `/api/employees/${id}/payslip`, {
    params: { id },
    query: { month_year: THIS_MONTH, ...query },
  })

describe('advance log — who can see it', () => {
  it('rejects an anonymous request', async () => {
    signOut()
    expect((await log()).status).toBe(401)
  })

  it.each(['ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const)('lets %s read the log', async (role) => {
    await signInAs(role)
    expect((await log()).status).toBe(200)
  })

  /** Running the lab does not include reading payroll. */
  it('forbids LAB_TECHNICIAN', async () => {
    await signInAs('LAB_TECHNICIAN')
    expect((await log()).status).toBe(403)
    expect((await validation('e1')).status).toBe(403)
  })

  it('lets RECEPTIONIST read the advance limits the log quotes', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', base_salary: 27000 })

    expect((await validation('e1')).status).toBe(200)
  })
})

describe('advance log — who can pay one', () => {
  /**
   * The hole this closes. Both of these returned 200/201 for every signed-in
   * role, including a lab technician. Reception was later let back in
   * deliberately (advance:write) because they hand the cash over themselves.
   */
  it.each(['LAB_TECHNICIAN', 'NURSE'] as const)(
    'forbids %s from paying an advance',
    async (role) => {
      await signInAs(role)
      anEmployee({ id: 'e1', base_salary: 27000 })

      const body = { amount: 1000, date_given: TODAY, month_year: THIS_MONTH }

      expect((await payAdvance('e1', body)).status).toBe(403)
      expect((await createAdvance({ employee_id: 'e1', ...body })).status).toBe(403)
      expect(db.count('advances')).toBe(0)
    },
  )

  it.each(['ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const)('lets %s pay an advance', async (role) => {
    await signInAs(role)
    anEmployee({ id: 'e1', base_salary: 27000 })

    const { status } = await payAdvance('e1', {
      amount: 1000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })

    expect(status).toBe(200)
  })
})

describe('advance attribution', () => {
  it('records who handed over the cash and who was at the keyboard', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    anEmployee({ id: 'e1', base_salary: 27000 })

    await payAdvance('e1', {
      amount: 5000,
      date_given: TODAY,
      month_year: THIS_MONTH,
      given_by: 'Anita Sharma',
      remarks: 'Festival',
    })

    expect(db.rows('advances')[0]).toMatchObject({
      given_by: 'Anita Sharma',
      created_by: 'u-admin',
      remarks: 'Festival',
    })
  })

  /** Blank means "that was me" — it must not store an empty string. */
  it('leaves given_by null when nobody else handed it over', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })

    await payAdvance('e1', {
      amount: 5000,
      date_given: TODAY,
      month_year: THIS_MONTH,
      given_by: '   ',
    })

    expect(db.rows('advances')[0].given_by).toBeNull()
  })

  it('records attribution on the bulk route too', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    anEmployee({ id: 'e1' })

    await createAdvance({
      employee_id: 'e1',
      amount: 2000,
      date_given: TODAY,
      month_year: THIS_MONTH,
      given_by: 'Anita',
    })

    expect(db.rows('advances')[0]).toMatchObject({ given_by: 'Anita', created_by: 'u-admin' })
  })
})

describe('GET /api/employees/advances — the log', () => {
  it('requires a month', async () => {
    await signInAs('RECEPTIONIST')
    const { status } = await call(listAdvances, 'GET', '/api/employees/advances', { query: {} })
    expect(status).toBe(400)
  })

  it('rejects a malformed month', async () => {
    await signInAs('RECEPTIONIST')
    expect((await log({ month_year: 'August' })).status).toBe(400)
  })

  it('returns the month, and only the month', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Ramesh' })
    anAdvance({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 9999, month_year: '2020-01' })

    const { body } = await log()

    expect(body.data).toHaveLength(1)
    expect(body.summary.total_amount).toBe(5000)
  })

  it('subtotals by employee, heaviest first', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Ramesh', base_salary: 27000 })
    anEmployee({ id: 'e2', name: 'Suresh', base_salary: 30000 })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 3000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e2', amount: 9000, month_year: THIS_MONTH })

    const { body } = await log()

    expect(body.by_employee.map((e: any) => e.name)).toEqual(['Suresh', 'Ramesh'])
    expect(body.by_employee[1]).toMatchObject({ total: 5000, count: 2, base_salary: 27000 })
  })

  /**
   * Reception reads this log for the advance amounts, never for what they are
   * a fraction of — the subtotals still add up, the salaries are gone.
   */
  it('keeps the subtotals but strips base_salary for RECEPTIONIST', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Ramesh', base_salary: 27000 })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 3000, month_year: THIS_MONTH })

    const { body } = await log()

    expect(body.by_employee[0]).toMatchObject({ name: 'Ramesh', total: 5000, count: 2 })
    expect(body.by_employee[0].base_salary).toBeFalsy()
    expect(body.data.every((r: any) => !r.employee?.base_salary)).toBe(true)
  })

  it('reports the figures the KPI strip shows', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e2', amount: 7000, month_year: THIS_MONTH })

    const { body } = await log()

    expect(body.summary).toMatchObject({
      total_amount: 9000,
      advance_count: 2,
      employee_count: 2,
      largest_advance: 7000,
    })
  })

  it('reports zeroes rather than NaN for an empty month', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await log()

    expect(status).toBe(200)
    expect(body.data).toEqual([])
    expect(body.by_employee).toEqual([])
    expect(body.summary).toMatchObject({ total_amount: 0, advance_count: 0, largest_advance: 0 })
  })

  it('filters to one employee', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e2', amount: 7000, month_year: THIS_MONTH })

    const { body } = await log({ employee_id: 'e2' })

    expect(body.data).toHaveLength(1)
    expect(body.summary.total_amount).toBe(7000)
  })

  it('filters by designation', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', designation: 'Nurse' })
    anEmployee({ id: 'e2', designation: 'Wardboy' })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e2', amount: 7000, month_year: THIS_MONTH })

    const { body } = await log({ designation: 'Wardboy' })

    expect(body.summary.total_amount).toBe(7000)
  })

  it('filters by a date range inside the month', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1' })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH, date_given: `${THIS_MONTH}-02` })
    anAdvance({ employee_id: 'e1', amount: 7000, month_year: THIS_MONTH, date_given: `${THIS_MONTH}-20` })

    const { body } = await log({ from: `${THIS_MONTH}-10`, to: `${THIS_MONTH}-28` })

    expect(body.summary.total_amount).toBe(7000)
  })

  it('searches name, remarks and given_by', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Ramesh' })
    anEmployee({ id: 'e2', name: 'Suresh' })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH, remarks: 'Festival' })
    anAdvance({ employee_id: 'e2', amount: 7000, month_year: THIS_MONTH, given_by: 'Anita' })

    expect((await log({ search: 'ramesh' })).body.summary.total_amount).toBe(2000)
    expect((await log({ search: 'festival' })).body.summary.total_amount).toBe(2000)
    expect((await log({ search: 'anita' })).body.summary.total_amount).toBe(7000)
  })

  /** A remark like "Advance (urgent), see note" must not corrupt the filter. */
  it('does not let punctuation in the search break the query', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1' })
    anAdvance({ employee_id: 'e1', month_year: THIS_MONTH })

    expect((await log({ search: 'Advance (urgent), see note' })).status).toBe(200)
  })

  it('reports the previous month for the change figure', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1' })
    anAdvance({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 4000, month_year: '2026-02' })

    // THIS_MONTH is 2026-03 under the frozen test clock.
    const { body } = await log()

    expect(body.summary.previous_month).toBe('2026-02')
    expect(body.summary.previous_total).toBe(4000)
  })
})

describe('GET /api/employees/[id]/history', () => {
  it('returns every salary month and every advance', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH })
    aSalaryRecord({ id: '2', employee_id: 'e1', month_year: '2026-02' })
    anAdvance({ employee_id: 'e1', month_year: THIS_MONTH })

    const { status, body } = await history('e1')

    expect(status).toBe(200)
    expect(body.data.salaries).toHaveLength(2)
    expect(body.data.advances).toHaveLength(1)
  })

  it('returns empty lists for someone with no history', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { body } = await history('e1')
    expect(body.data).toEqual({ salaries: [], advances: [] })
  })

  it('is not open to reception — it is payroll', async () => {
    await signInAs('RECEPTIONIST')
    expect((await history('e1')).status).toBe(403)
  })
})

describe('GET /api/employees/[id]/payslip', () => {
  it('returns the record, the salary row and the itemised advances', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Ramesh' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, final_salary: 22000 })
    anAdvance({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })

    const { status, body } = await slip('e1')

    expect(status).toBe(200)
    expect(body.data.employee.name).toBe('Ramesh')
    expect(body.data.salary_record.final_salary).toBe(22000)
    expect(body.data.advances).toHaveLength(1)
  })

  /** A month with no payroll run yet is still worth printing — advances exist. */
  it('renders a month with no salary record', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anAdvance({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })

    const { status, body } = await slip('e1')

    expect(status).toBe(200)
    expect(body.data.salary_record).toBeNull()
    expect(body.data.advances).toHaveLength(1)
  })

  it('404s for an unknown employee', async () => {
    await signInAs('ADMIN')
    expect((await slip('missing')).status).toBe(404)
  })

  it('rejects a malformed month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    expect((await slip('e1', { month_year: 'August' })).status).toBe(400)
  })
})
