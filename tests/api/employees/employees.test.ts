/**
 * /api/employees — the staff register, CSV import and advances.
 */

import { describe, it, expect } from 'vitest'
import { GET as listEmployees, POST as createEmployee } from '@/app/api/employees/route'
import { GET as getEmployee, PUT as updateEmployee, DELETE as deleteEmployee } from '@/app/api/employees/[id]/route'
import { POST as importEmployees } from '@/app/api/employees/import/route'
import { GET as listAdvances, POST as addAdvance } from '@/app/api/employees/advances/route'
import { POST as addEmployeeAdvance } from '@/app/api/employees/[id]/salary/advances/route'
import { GET as advanceValidation } from '@/app/api/employees/[id]/salary/advances/validation/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { anEmployee, anAdvance, aSalaryRecord } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const list = (query = {}) => call(listEmployees, 'GET', '/api/employees', { query })
const create = (body: unknown) => call(createEmployee, 'POST', '/api/employees', { body })
const read = (id: string) => call(getEmployee, 'GET', `/api/employees/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateEmployee, 'PUT', `/api/employees/${id}`, { body, params: { id } })
const remove = (id: string) => call(deleteEmployee, 'DELETE', `/api/employees/${id}`, { params: { id } })

const advances = (query = {}) => call(listAdvances, 'GET', '/api/employees/advances', { query })
const createAdvance = (body: unknown) => call(addAdvance, 'POST', '/api/employees/advances', { body })
const createEmployeeAdvance = (id: string, body: unknown) =>
  call(addEmployeeAdvance, 'POST', `/api/employees/${id}/salary/advances`, { body, params: { id } })
const validation = async (id: string, query = {}) => {
  const { status, body } = await call(advanceValidation, 'GET', `/api/employees/${id}/salary/advances/validation`, {
    params: { id },
    query,
  })
  // The route wraps its payload as { success, data }.
  return { status, body: body?.data ?? body }
}

function csvUpload(content: string, filename = 'employees.csv') {
  const form = new FormData()
  form.append('file', new File([content], filename, { type: 'text/csv' }))
  return call(importEmployees, 'POST', '/api/employees/import', { formData: form })
}

describe('/api/employees — access control', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({ name: 'X', designation: 'Nurse', base_salary: 1 })).status).toBe(401)
  })

  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

    expect((await list()).status).toBe(403)
    expect((await create({ name: 'X', designation: 'Nurse', base_salary: 1 })).status).toBe(403)
  })

  /**
   * Every employee and salary endpoint admits DOCTOR as well as ADMIN, despite the error
   * text saying "Admin access required". Only the page middleware keeps non-admins out of
   * /employees, so a direct API call from a doctor's session succeeds. See BUGS.md #53.
   */
  it('admits DOCTOR to the employee register', async () => {
    await signInAs('DOCTOR')
    expect((await list()).status).toBe(200)
  })

  it.fails('should restrict the employee register to admins', async () => {
    await signInAs('DOCTOR')
    expect((await list()).status).toBe(403)
  })
})

describe('GET /api/employees', () => {
  it('returns active employees by default, ordered by name', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Zara', status: 'Active' })
    anEmployee({ id: 'e2', name: 'Amit', status: 'Active' })
    anEmployee({ id: 'e3', name: 'Gone', status: 'Inactive' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.data.map((e: any) => e.id)).toEqual(['e2', 'e1'])
  })

  it('can list inactive employees', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', status: 'Inactive' })

    expect((await list({ status: 'Inactive' })).body.data.map((e: any) => e.id)).toEqual(['e1'])
  })

  it('attaches the month’s salary record when asked', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })
    anEmployee({ id: 'e2' })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, final_salary: 24000 })

    const { body } = await list({ month_year: THIS_MONTH })

    const withRecord = body.data.find((e: any) => e.id === 'e1')
    const without = body.data.find((e: any) => e.id === 'e2')

    expect(withRecord.has_salary_record).toBe(true)
    expect(withRecord.salary_record.final_salary).toBe(24000)
    expect(without.has_salary_record).toBe(false)
    expect(without.salary_record).toBeNull()
  })
})

describe('POST /api/employees', () => {
  it.each([
    ['a missing name', { designation: 'Nurse', base_salary: 27000 }, 'Name must be between 2 and 100 characters'],
    ['a one-character name', { name: 'A', designation: 'Nurse', base_salary: 27000 }, 'Name must be between 2 and 100 characters'],
    ['a missing designation', { name: 'Ramesh', base_salary: 27000 }, 'Designation is required and must be max 50 characters'],
    ['a zero salary', { name: 'Ramesh', designation: 'Nurse', base_salary: 0 }, 'Base salary must be greater than 0'],
    ['a negative salary', { name: 'Ramesh', designation: 'Nurse', base_salary: -1 }, 'Base salary must be greater than 0'],
  ])('rejects %s', async (_case, body, message) => {
    await signInAs('ADMIN')

    const { status, body: response } = await create(body)
    expect(status).toBe(400)
    expect(response.error).toBe(message)
  })

  it('rejects a name over 100 characters and a designation over 50', async () => {
    await signInAs('ADMIN')

    expect((await create({ name: 'A'.repeat(101), designation: 'Nurse', base_salary: 1 })).status).toBe(400)
    expect((await create({ name: 'Ramesh', designation: 'D'.repeat(51), base_salary: 1 })).status).toBe(400)
  })

  it('creates the employee with defaults', async () => {
    await signInAs('ADMIN')

    const { status } = await create({ name: 'Ramesh', designation: 'Nurse', base_salary: 27000 })

    expect(status).toBe(201)
    expect(db.rows('employees')[0]).toMatchObject({
      name: 'Ramesh',
      designation: 'Nurse',
      base_salary: 27000,
      join_date: TODAY,
      status: 'Active',
    })
  })
})

describe('/api/employees/[id]', () => {
  it('returns 404 for an unknown employee', async () => {
    await signInAs('ADMIN')

    const { status, body } = await read('missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Employee not found')
  })

  it('updates the editable fields', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Old', base_salary: 20000 })

    const { status } = await update('e1', { name: 'New', base_salary: 30000 })

    expect(status).toBe(200)
    expect(db.find('employees', (r) => r.id === 'e1')).toMatchObject({ name: 'New', base_salary: 30000 })
  })

  it('rejects an unknown status', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { status, body } = await update('e1', { status: 'Retired' })
    expect(status).toBe(400)
    expect(body.error).toBe('Status must be Active or Inactive')
  })

  it('deactivates rather than deleting, preserving salary history', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', status: 'Active' })
    aSalaryRecord({ employee_id: 'e1' })

    const { status, body } = await remove('e1')

    expect(status).toBe(200)
    expect(body.message).toBe('Employee marked as Inactive successfully')
    expect(db.find('employees', (r) => r.id === 'e1')!.status).toBe('Inactive')
    expect(db.count('salary_payments')).toBe(1)
  })
})

describe('POST /api/employees/import — CSV', () => {
  const header = 'Name,Salary,Role'

  it('requires a file', async () => {
    await signInAs('ADMIN')

    const { status, body } = await call(importEmployees, 'POST', '/api/employees/import', {
      formData: new FormData(),
    })
    expect(status).toBe(400)
    expect(body.error).toBe('No file provided')
  })

  it('requires a .csv extension', async () => {
    await signInAs('ADMIN')

    const { status, body } = await csvUpload(`${header}\nRamesh,27000,Nurse`, 'employees.xlsx')
    expect(status).toBe(400)
    expect(body.error).toBe('File must be a CSV')
  })

  it('rejects a file with only a header', async () => {
    await signInAs('ADMIN')

    const { status, body } = await csvUpload(header)
    expect(status).toBe(400)
    expect(body.error).toBe('CSV file is empty or has no data rows')
  })

  it('requires Name and Salary columns', async () => {
    await signInAs('ADMIN')

    const { status, body } = await csvUpload('Employee,Pay\nRamesh,27000')
    expect(status).toBe(400)
    expect(body.error).toBe('CSV must contain Name and Salary columns')
  })

  it('imports the rows', async () => {
    await signInAs('ADMIN')

    const { status, body } = await csvUpload(`${header}\nRamesh,27000,Nurse\nSuresh,30000,Wardboy`)

    expect(status).toBe(200)
    expect(body.imported).toBe(2)
    expect(body.message).toBe('Successfully imported 2 employees')

    expect(db.rows('employees')).toHaveLength(2)
    expect(db.rows('employees')[0]).toMatchObject({
      name: 'Ramesh',
      base_salary: 27000,
      designation: 'Nurse',
      join_date: TODAY,
      status: 'Active',
    })
  })

  it('matches headers case-insensitively and in any order', async () => {
    await signInAs('ADMIN')

    const { status } = await csvUpload('ROLE,salary,NaMe\nNurse,27000,Ramesh')

    expect(status).toBe(200)
    expect(db.rows('employees')[0]).toMatchObject({ name: 'Ramesh', base_salary: 27000, designation: 'Nurse' })
  })

  it('defaults the designation to Nurse when Role is absent', async () => {
    await signInAs('ADMIN')

    await csvUpload('Name,Salary\nRamesh,27000')
    expect(db.rows('employees')[0].designation).toBe('Nurse')
  })

  it('skips bad rows and reports them without failing the import', async () => {
    await signInAs('ADMIN')

    const { status, body } = await csvUpload(`${header}\nRamesh,27000,Nurse\n,30000,Wardboy\nSuresh,500,Nurse`)

    expect(status).toBe(200)
    expect(body.imported).toBe(1)
    expect(body.errors).toEqual(['Row 3: Name is required', 'Row 4: Invalid salary (minimum ₹1000)'])
    expect(db.count('employees')).toBe(1)
  })

  it('enforces a minimum salary of 1000', async () => {
    await signInAs('ADMIN')

    const { status, body } = await csvUpload(`${header}\nRamesh,999,Nurse`)
    expect(status).toBe(400)
    expect(body.error).toBe('No valid employee data found')
  })

  it('rejects a non-numeric salary', async () => {
    await signInAs('ADMIN')

    expect((await csvUpload(`${header}\nRamesh,abc,Nurse`)).status).toBe(400)
  })

  it('ignores blank lines', async () => {
    await signInAs('ADMIN')

    const { body } = await csvUpload(`${header}\nRamesh,27000,Nurse\n\n\nSuresh,30000,Nurse\n`)
    expect(body.imported).toBe(2)
  })

  /**
   * Known defect — see BUGS.md #54. The parser splits on commas with no quote handling, so
   * a quoted name containing a comma is torn in half and its salary column shifts.
   */
  it.fails('should handle a quoted field containing a comma', async () => {
    await signInAs('ADMIN')

    await csvUpload(`${header}\n"Kumar, Ramesh",27000,Nurse`)

    expect(db.rows('employees')[0]).toMatchObject({ name: 'Kumar, Ramesh', base_salary: 27000 })
  })

  it('handles a CRLF file, because each value is trimmed', async () => {
    await signInAs('ADMIN')

    await csvUpload(`${header}\r\nRamesh,27000,Nurse\r\n`)

    expect(db.rows('employees')[0].designation).toBe('Nurse')
  })

  /** Known defect — see BUGS.md #54. Re-uploading the same file silently duplicates everyone. */
  it.fails('should not create a duplicate for an employee who already exists', async () => {
    await signInAs('ADMIN')
    anEmployee({ name: 'Ramesh' })

    await csvUpload(`${header}\nRamesh,27000,Nurse`)

    expect(db.count('employees')).toBe(1)
  })
})

describe('/api/employees/advances', () => {
  it('requires month_year to list', async () => {
    await signInAs('ADMIN')

    const { status, body } = await advances()
    expect(status).toBe(400)
    expect(body.error).toBe('month_year parameter is required')
  })

  it('lists the month’s advances with a summary', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Ramesh' })
    anAdvance({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 2000, month_year: THIS_MONTH })
    anAdvance({ employee_id: 'e1', amount: 9999, month_year: '2026-02' })

    const { status, body } = await advances({ month_year: THIS_MONTH })

    expect(status).toBe(200)
    expect(body.summary).toMatchObject({ total_amount: 7000, advance_count: 2, employee_count: 1 })
  })

  it.each([
    ['employee_id', { amount: 1000, date_given: TODAY, month_year: THIS_MONTH }],
    ['amount', { employee_id: 'e1', date_given: TODAY, month_year: THIS_MONTH }],
    ['date_given', { employee_id: 'e1', amount: 1000, month_year: THIS_MONTH }],
  ])('requires %s', async (_field, body) => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    expect((await createAdvance(body)).status).toBe(400)
  })

  it('rejects a malformed month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { status, body } = await createAdvance({
      employee_id: 'e1',
      amount: 1000,
      date_given: TODAY,
      month_year: 'March 2026',
    })

    expect(status).toBe(400)
    expect(body.error).toBe('Invalid month_year format. Must be YYYY-MM')
  })

  it('returns 404 for an unknown employee', async () => {
    await signInAs('ADMIN')

    const { status } = await createAdvance({
      employee_id: 'missing',
      amount: 1000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })
    expect(status).toBe(404)
  })

  it('records the advance and refreshes the salary record', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, calculated_salary: 27000, total_advance: 0, final_salary: 27000 })

    const { status } = await createAdvance({
      employee_id: 'e1',
      amount: 5000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })

    expect(status).toBe(201)
    expect(db.find('salary_payments', (r) => String(r.id) === '1')).toMatchObject({
      total_advance: 5000,
      final_salary: 22000,
    })
  })

  /**
   * Known defect — see BUGS.md #55. This endpoint applies no cap at all, while the
   * per-employee route enforces the advance limit. An advance far beyond the salary is
   * accepted here, leaving a negative final salary.
   */
  it.fails('should refuse an advance beyond the salary cap', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })

    const { status } = await createAdvance({
      employee_id: 'e1',
      amount: 500000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })

    expect(status).toBe(400)
  })
})

describe('POST /api/employees/[id]/salary/advances — the capped route', () => {
  it('requires amount, date and month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    const { status, body } = await createEmployeeAdvance('e1', { amount: 1000 })
    expect(status).toBe(400)
    expect(body.error).toBe('Amount, date, and month_year are required')
  })

  it('returns 404 for an unknown employee', async () => {
    await signInAs('ADMIN')

    const { status } = await createEmployeeAdvance('missing', {
      amount: 1000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })
    expect(status).toBe(404)
  })

  it('allows an advance within the base salary when no salary record exists', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })

    const { status } = await createEmployeeAdvance('e1', {
      amount: 5000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })

    expect(status).toBe(200)
    expect(db.rows('advances')[0]).toMatchObject({ employee_id: 'e1', amount: 5000, month_year: THIS_MONTH })
  })

  it('refuses an advance beyond the base salary', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })

    const { status, body } = await createEmployeeAdvance('e1', {
      amount: 30000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })

    expect(status).toBe(400)
    expect(body.error).toBe('Advance amount cannot exceed ₹27000.00')
    expect(db.count('advances')).toBe(0)
  })

  it('refuses any advance once the salary is settled', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled' })

    const { status, body } = await createEmployeeAdvance('e1', {
      amount: 1000,
      date_given: TODAY,
      month_year: THIS_MONTH,
    })

    expect(status).toBe(400)
    expect(body.error).toBe('Salary is already settled. No further advances can be added.')
  })

  it('caps against the calculated salary once a record exists', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })
    aSalaryRecord({
      id: '1',
      employee_id: 'e1',
      month_year: THIS_MONTH,
      calculated_salary: 20000,
      total_advance: 15000,
    })

    const tooMuch = await createEmployeeAdvance('e1', { amount: 6000, date_given: TODAY, month_year: THIS_MONTH })
    expect(tooMuch.status).toBe(400)

    const allowed = await createEmployeeAdvance('e1', { amount: 5000, date_given: TODAY, month_year: THIS_MONTH })
    expect(allowed.status).toBe(200)
  })

  it('rolls the new advance into the salary record', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })
    aSalaryRecord({
      id: '1',
      employee_id: 'e1',
      month_year: THIS_MONTH,
      calculated_salary: 27000,
      total_advance: 2000,
      final_salary: 25000,
    })

    await createEmployeeAdvance('e1', { amount: 3000, date_given: TODAY, month_year: THIS_MONTH })

    expect(db.find('salary_payments', (r) => String(r.id) === '1')).toMatchObject({
      total_advance: 5000,
      final_salary: 22000,
    })
  })
})

describe('GET /api/employees/[id]/salary/advances/validation', () => {
  it('rejects a malformed month', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1' })

    expect((await validation('e1', { month_year: 'nope' })).status).toBe(400)
  })

  it('returns 404 for an unknown employee', async () => {
    await signInAs('ADMIN')

    expect((await validation('missing', { month_year: THIS_MONTH })).status).toBe(404)
  })

  it('reports the base-salary allowance when no record exists', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Ramesh', base_salary: 27000 })

    const { status, body } = await validation('e1', { month_year: THIS_MONTH })

    expect(status).toBe(200)
    expect(body).toMatchObject({
      employee_id: 'e1',
      employee_name: 'Ramesh',
      month_year: THIS_MONTH,
      base_salary: 27000,
      has_salary_record: false,
      max_allowed_advance: 27000,
      can_add_advance: true,
      scenario: 'No Salary Record',
    })
  })

  it('reports the remaining allowance once a record exists', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, calculated_salary: 25000, total_advance: 10000 })
    anAdvance({ employee_id: 'e1', month_year: THIS_MONTH, amount: 10000 })

    const { body } = await validation('e1', { month_year: THIS_MONTH })

    expect(body).toMatchObject({
      has_salary_record: true,
      calculated_salary: 25000,
      current_total_advances: 10000,
      max_allowed_advance: 15000,
      can_add_advance: true,
      scenario: 'Salary Record Exists',
    })
  })

  it('reports that a settled salary allows nothing further', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', base_salary: 27000 })
    aSalaryRecord({ id: '1', employee_id: 'e1', month_year: THIS_MONTH, status: 'settled' })

    const { body } = await validation('e1', { month_year: THIS_MONTH })

    expect(body.can_add_advance).toBe(false)
    expect(body.validation_message).toBe('Salary is already settled. No further advances can be added.')
  })
})
