/**
 * General expenses, and the two books staying apart (PRD v2, CR-07).
 *
 * The client: *"Admin expenses are general expenses and are NOT related to
 * petty cash. Petty cash applies to receptionists only."*
 *
 * So an admin's expense goes in the Expenses log — with how it was paid and who
 * recorded it, neither of which a general expense ever kept — and the desk's
 * goes in the float. Neither is a ledger row any more.
 */

import { describe, it, expect } from 'vitest'
import {
  GET as listExpenses,
  POST as addExpense,
  PUT as editExpense,
} from '@/app/api/finances/expenses/route'
import { POST as addLedgerEntry } from '@/app/api/ledger/transactions/route'
import { POST as addPettyCash } from '@/app/api/petty-cash/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { anExpense } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const list = (query = {}) => call(listExpenses, 'GET', '/api/finances/expenses', { query })
const add = (body: unknown) => call(addExpense, 'POST', '/api/finances/expenses', { body })
const edit = (body: unknown) => call(editExpense, 'PUT', '/api/finances/expenses', { body })
const ledgerEntry = (body: unknown) => call(addLedgerEntry, 'POST', '/api/ledger/transactions', { body })
const pettyCash = (body: unknown) => call(addPettyCash, 'POST', '/api/petty-cash', { body })

const VALID = {
  expense_type: 'Electric Bill',
  amount: 5000,
  expense_date: TODAY,
  remarks: 'March bill',
}

describe('who records a general expense', () => {
  it('needs a session', async () => {
    signOut()
    expect((await add(VALID)).status).toBe(401)
    expect((await list()).status).toBe(401)
  })

  // It is the admin's money, not the desk's float (requirement 7).
  it.each(['RECEPTIONIST', 'NURSE', 'LAB_TECHNICIAN'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await add(VALID)).status).toBe(403)
    expect(db.count('expenses')).toBe(0)
  })

  it('lets an admin record one, and a doctor read the log', async () => {
    await signInAs('ADMIN')
    expect((await add(VALID)).status).toBe(200)

    await signInAs('DOCTOR')
    expect((await list({ month_year: THIS_MONTH })).status).toBe(200)
  })
})

describe('what a general expense must say', () => {
  // AC-07.2, and Q-39 = A.
  it('keeps how it was paid and who recorded it', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })

    const { status } = await add({ ...VALID, payment_mode: 'bank_transfer' })

    expect(status).toBe(200)
    expect(db.rows('expenses')[0]).toMatchObject({
      expense_type: 'Electric Bill',
      amount: 5000,
      payment_mode: 'bank_transfer',
      remarks: 'March bill',
      created_by: 'u-admin',
    })
  })

  it('defaults to cash when no mode is given', async () => {
    await signInAs('ADMIN')
    await add(VALID)
    expect(db.rows('expenses')[0].payment_mode).toBe('cash')
  })

  it('refuses one with no reason', async () => {
    await signInAs('ADMIN')

    const { status, body } = await add({ ...VALID, remarks: '   ' })

    expect(status).toBe(400)
    expect(body.error).toBe('Say what this expense was for')
    expect(db.count('expenses')).toBe(0)
  })

  it('refuses an unknown payment mode', async () => {
    await signInAs('ADMIN')

    const { status } = await add({ ...VALID, payment_mode: 'crypto' })

    expect(status).toBe(400)
    expect(db.count('expenses')).toBe(0)
  })

  it('still reports a bad amount as a bad amount', async () => {
    await signInAs('ADMIN')

    const { body } = await add({ ...VALID, amount: -5, remarks: '' })
    expect(body.error).toBe('Amount must be greater than 0')
  })

  it('records who last changed it', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    anExpense({ id: '1', amount: 1000, month_year: THIS_MONTH, expense_type: 'Electric Bill' })

    const { status } = await edit({
      id: '1',
      expense_type: 'Electric Bill',
      amount: 1200,
      expense_date: TODAY,
      remarks: 'corrected',
    })

    expect(status).toBe(200)
    expect(db.rows('expenses')[0]).toMatchObject({ amount: 1200, updated_by: 'u-admin' })
  })

  it('names who added each one in the log', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    await add(VALID)

    const { body } = await list({ month_year: THIS_MONTH })

    expect(body.data[0].created_by).toBe('u-admin')
  })
})

describe('the two books stay apart (Q-07 = A)', () => {
  it('keeps an admin expense out of the ledger', async () => {
    await signInAs('ADMIN')

    await add(VALID)

    expect(db.count('expenses')).toBe(1)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('will not let anyone book an expense to the ledger any more', async () => {
    await signInAs('ADMIN')

    const { status } = await ledgerEntry({
      transaction_date: TODAY,
      transaction_type: 'debit',
      source: 'expense',
      amount: 500,
      payment_mode: 'cash',
      description: 'Gauze',
    })

    expect(status).toBe(400)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it("keeps the desk's spending in petty cash, not the Expenses log", async () => {
    await signInAs('RECEPTIONIST')

    const { status } = await pettyCash({ kind: 'expense', amount: 450, reason: 'Auto fare' })

    expect(status).toBe(201)
    expect(db.count('petty_cash_entries')).toBe(1)
    expect(db.count('expenses')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })
})
