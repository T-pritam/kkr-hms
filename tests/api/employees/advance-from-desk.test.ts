/**
 * Advances paid by the desk (PRD v2, CR-03).
 *
 * The client: *"Add an Employee Advance section to the receptionist view so
 * receptionists can pay advances to employees. Receptionists must NOT see other
 * employee details such as salary, present days, or remaining amount to settle.
 * Advance details must show which user gave the advance."*
 *
 * So the two halves tested here are: the money (an advance the desk pays is a
 * petty cash debit, and the two move together), and the privacy (no payroll
 * figure reaches a receptionist, in any response).
 */

import { describe, it, expect } from 'vitest'
import { POST as createAdvance } from '@/app/api/employees/advances/route'
import { PUT as editAdvance, DELETE as removeAdvance } from '@/app/api/employees/advances/[id]/route'
import { GET as employeePicker } from '@/app/api/employees/for-advance/route'
import { GET as listPettyCash } from '@/app/api/petty-cash/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { anEmployee, anAdvance, aSalaryRecord } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const pay = (body: unknown) => call(createAdvance, 'POST', '/api/employees/advances', { body })
const edit = (id: string, body: unknown) =>
  call(editAdvance, 'PUT', `/api/employees/advances/${id}`, { body, params: { id } })
const remove = (id: string) =>
  call(removeAdvance, 'DELETE', `/api/employees/advances/${id}`, { params: { id } })
const picker = () => call(employeePicker, 'GET', '/api/employees/for-advance')
const pettyCash = () => call(listPettyCash, 'GET', '/api/petty-cash')

const advances = () => db.rows('advances')
const debits = () => db.rows('petty_cash_entries')

const VALID = { amount: 2000, date_given: TODAY, month_year: THIS_MONTH }

describe('the employee picker reception may see', () => {
  it('gives code, name and designation, and nothing about pay', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Asha', employee_code: 'EMP-1', designation: 'Nurse', base_salary: 27000 })

    const { status, body } = await picker()

    expect(status).toBe(200)
    expect(body.data[0]).toEqual({
      id: 'e1',
      employee_code: 'EMP-1',
      name: 'Asha',
      designation: 'Nurse',
    })
    expect(JSON.stringify(body)).not.toContain('27000')
  })

  it('needs a session, and shuts out the lab', async () => {
    signOut()
    expect((await picker()).status).toBe(401)

    await signInAs('LAB_TECHNICIAN')
    expect((await picker()).status).toBe(403)
  })
})

describe('an advance the desk pays', () => {
  // AC-03.2
  it('is recorded, and comes out of petty cash', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })

    const { status, body } = await pay({ employee_id: 'e1', ...VALID })

    expect(status).toBe(201)
    expect(advances()).toHaveLength(1)
    expect(advances()[0]).toMatchObject({
      employee_id: 'e1',
      amount: 2000,
      // AC-03.3: who gave it is the logged-in user, not free text (Q-15 = A).
      created_by: 'u-recep',
    })

    expect(debits()).toHaveLength(1)
    expect(debits()[0]).toMatchObject({
      direction: 'out',
      kind: 'advance',
      amount: 2000,
      reason: 'Advance to Asha',
      advance_id: advances()[0].id,
      created_by: 'u-recep',
    })
    expect(advances()[0].petty_cash_entry_id).toBe(debits()[0].id)
    expect(body.petty_cash_entry).toBeTruthy()
  })

  it('moves the float', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })

    await pay({ employee_id: 'e1', ...VALID })

    expect((await pettyCash()).body.totals).toEqual({ in: 0, out: 2000, balance: -2000 })
  })

  // An admin hands cash *to* the desk; their own advance is not from the float.
  it('does not touch petty cash when an admin pays it', async () => {
    await signInAs('ADMIN')
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })

    await pay({ employee_id: 'e1', ...VALID })

    expect(advances()).toHaveLength(1)
    expect(debits()).toHaveLength(0)
  })

  // Q-07 = A: desk spending never reaches the ledger.
  it('is never a ledger entry', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })

    await pay({ employee_id: 'e1', ...VALID })

    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('leaves nothing behind if the petty cash debit cannot be written', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })
    db.failNext('petty_cash_entries')

    const { status } = await pay({ employee_id: 'e1', ...VALID })

    expect(status).toBe(500)
    expect(advances()).toHaveLength(0)
  })
})

describe('what reception is told when it cannot pay (Q-16 = A)', () => {
  // AC-03.4
  it('gives the desk no figures, and the admin the real reason', async () => {
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 5000 })

    await signInAs('RECEPTIONIST')
    const desk = await pay({ employee_id: 'e1', amount: 50000, date_given: TODAY, month_year: THIS_MONTH })

    expect(desk.status).toBe(400)
    expect(desk.body.error).toBe('That is more than this employee is allowed right now. Ask an admin.')
    expect(desk.body.error).not.toMatch(/5000|₹/)

    await signInAs('ADMIN')
    const admin = await pay({ employee_id: 'e1', amount: 50000, date_given: TODAY, month_year: THIS_MONTH })
    expect(admin.status).toBe(400)
    expect(admin.body.error).not.toBe(desk.body.error)
  })

  it('refuses an advance against a settled month, and writes no debit', async () => {
    await signInAs('RECEPTIONIST')
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })
    aSalaryRecord({ employee_id: 'e1', month_year: THIS_MONTH, status: 'settled', calculated_salary: 27000 })

    const { status, body } = await pay({ employee_id: 'e1', ...VALID })

    expect(status).toBe(400)
    expect(body.code).toBe('MONTH_SETTLED')
    expect(advances()).toHaveLength(0)
    expect(debits()).toHaveLength(0)
  })
})

describe('correcting an advance (Q-17 = A)', () => {
  async function anAdvanceFromTheDesk() {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })
    await pay({ employee_id: 'e1', ...VALID })
    return advances()[0]
  }

  // AC-03.5
  it('takes the petty cash debit with it', async () => {
    const advance = await anAdvanceFromTheDesk()

    const { status } = await edit(String(advance.id), { amount: 1500, date_given: TODAY })

    expect(status).toBe(200)
    expect(advances()[0].amount).toBe(1500)
    expect(debits()[0].amount).toBe(1500)
    expect((await pettyCash()).body.totals.balance).toBe(-1500)
  })

  it('removes the debit when the advance is deleted', async () => {
    const advance = await anAdvanceFromTheDesk()

    expect((await remove(String(advance.id))).status).toBe(200)

    expect(advances()).toHaveLength(0)
    expect(debits()).toHaveLength(0)
  })

  it("refuses someone else's advance", async () => {
    const advance = await anAdvanceFromTheDesk()

    await signInAs('RECEPTIONIST', { userId: 'u-someone-else' })
    const { status, body } = await edit(String(advance.id), { amount: 10, date_given: TODAY })

    expect(status).toBe(403)
    expect(body.code).toBe('NOT_YOUR_ENTRY')
    expect(advances()[0].amount).toBe(2000)
  })

  it('locks once the salary month is settled', async () => {
    const advance = await anAdvanceFromTheDesk()
    aSalaryRecord({ employee_id: 'e1', month_year: THIS_MONTH, status: 'settled', calculated_salary: 27000 })

    const edited = await edit(String(advance.id), { amount: 1, date_given: TODAY })
    const deleted = await remove(String(advance.id))

    expect(edited.status).toBe(409)
    expect(edited.body.code).toBe('ENTRY_LOCKED')
    expect(deleted.status).toBe(409)
    expect(advances()).toHaveLength(1)
  })

  it('keeps the salary record in step', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    anEmployee({ id: 'e1', name: 'Asha', base_salary: 27000 })
    aSalaryRecord({ id: 's1', employee_id: 'e1', month_year: THIS_MONTH, calculated_salary: 27000 })
    anAdvance({ id: 9, employee_id: 'e1', amount: 1000, month_year: THIS_MONTH, created_by: 'u-admin' })

    await pay({ employee_id: 'e1', ...VALID })

    expect(db.find('salary_payments', (r) => r.id === 's1')).toMatchObject({
      total_advance: 3000,
      final_salary: 24000,
    })

    await remove('9')

    expect(db.find('salary_payments', (r) => r.id === 's1')).toMatchObject({
      total_advance: 2000,
      final_salary: 25000,
    })
  })
})
