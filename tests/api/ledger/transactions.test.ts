/**
 * /api/ledger/transactions — the daily cash book.
 */

import { describe, it, expect } from 'vitest'
import { GET as listTransactions, POST as createTransaction } from '@/app/api/ledger/transactions/route'
import { PUT as updateTransaction, DELETE as removeTransaction } from '@/app/api/ledger/transactions/[id]/route'
import { PUT as setStatus } from '@/app/api/ledger/transactions/[id]/status/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, signInWithRefreshTokenOnly } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, aPatient, aUser } from '../../helpers/seed'
import { NOW, TODAY } from '../../setup'

const list = (query = {}) => call(listTransactions, 'GET', '/api/ledger/transactions', { query })
const create = (body: unknown) => call(createTransaction, 'POST', '/api/ledger/transactions', { body })
const update = (id: string, body: unknown) =>
  call(updateTransaction, 'PUT', `/api/ledger/transactions/${id}`, { body, params: { id } })
const remove = (id: string) =>
  call(removeTransaction, 'DELETE', `/api/ledger/transactions/${id}`, { params: { id } })
const changeStatus = (id: string, body: unknown) =>
  call(setStatus, 'PUT', `/api/ledger/transactions/${id}/status`, { body, params: { id } })

const validTransaction = {
  transaction_date: TODAY,
  transaction_type: 'credit',
  source: 'opd',
  amount: 500,
  payment_mode: 'cash',
  description: 'OPD collection',
}

const transactionRow = (id: string) => db.find('daily_ledger_transactions', (r) => r.id === id)!

describe('ledger transactions — authentication', () => {
  it('rejects a caller with no session', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create(validTransaction)).status).toBe(401)
    expect((await update('t1', {})).status).toBe(401)
    expect((await remove('t1')).status).toBe(401)
    expect((await changeStatus('t1', { status: 'verified' })).status).toBe(401)
  })

  it('renews the session from a refresh token rather than rejecting', async () => {
    await signInWithRefreshTokenOnly('ADMIN')

    const { status } = await list()
    expect(status).toBe(200)
  })
})

describe('GET /api/ledger/transactions', () => {
  it('returns transactions newest first', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: '2026-03-01' })
    aTransaction({ id: 't2', transaction_date: '2026-03-10' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.map((t: any) => t.id)).toEqual(['t2', 't1'])
  })

  it('embeds the creator, verifier and patient', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'reception' })
    aUser({ id: 'u2', username: 'admin' })
    aPatient({ id: 'p1', name: 'Ramesh' })
    aTransaction({ id: 't1', created_by: 'u1', verified_by: 'u2', patient_id: 'p1' })

    const { body } = await list()

    expect(body.data[0].created_by_user).toEqual({ id: 'u1', username: 'reception' })
    expect(body.data[0].verified_by_user).toEqual({ id: 'u2', username: 'admin' })
    expect(body.data[0].patient).toEqual({ id: 'p1', name: 'Ramesh' })
  })

  it.each([
    ['transaction_type', 'debit'],
    ['source', 'expense'],
    ['payment_mode', 'upi'],
    ['status', 'verified'],
  ])('filters by %s', async (field, value) => {
    await signInAs('ADMIN')
    aTransaction({ id: 'match', [field]: value })
    aTransaction({ id: 'other' })

    const { body } = await list({ [field]: value })
    expect(body.data.map((t: any) => t.id)).toEqual(['match'])
  })

  it('filters by date range inclusively', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 'before', transaction_date: '2026-02-28' })
    aTransaction({ id: 'start', transaction_date: '2026-03-01' })
    aTransaction({ id: 'end', transaction_date: '2026-03-31' })
    aTransaction({ id: 'after', transaction_date: '2026-04-01' })

    const { body } = await list({ start_date: '2026-03-01', end_date: '2026-03-31' })

    expect(body.data.map((t: any) => t.id).sort()).toEqual(['end', 'start'])
  })

  it('filters by patient', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', patient_id: 'p1' })
    aTransaction({ id: 't2', patient_id: 'p2' })

    expect((await list({ patient_id: 'p1' })).body.data.map((t: any) => t.id)).toEqual(['t1'])
  })

  it('lets an admin filter by the user who recorded the entry', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', created_by: 'u1' })
    aTransaction({ id: 't2', created_by: 'u2' })

    expect((await list({ created_by: 'u1' })).body.data.map((t: any) => t.id)).toEqual(['t1'])
  })

  it.each(['NURSE', 'RECEPTIONIST'] as const)('shows %s only their own entries', async (role) => {
    await signInAs(role, { userId: 'u-me' })
    aTransaction({ id: 'mine', created_by: 'u-me' })
    aTransaction({ id: 'theirs', created_by: 'u-other' })

    expect((await list()).body.data.map((t: any) => t.id)).toEqual(['mine'])
  })

  it('ignores a created_by filter from a non-admin trying to see someone else’s entries', async () => {
    await signInAs('NURSE', { userId: 'u-me' })
    aTransaction({ id: 'mine', created_by: 'u-me' })
    aTransaction({ id: 'theirs', created_by: 'u-other' })

    expect((await list({ created_by: 'u-other' })).body.data.map((t: any) => t.id)).toEqual(['mine'])
  })

  it('lets a doctor see everyone’s entries', async () => {
    await signInAs('DOCTOR', { userId: 'u-doc' })
    aTransaction({ id: 't1', created_by: 'u-other' })

    expect((await list()).body.data).toHaveLength(1)
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('ADMIN')
    db.failNext('daily_ledger_transactions')

    expect((await list()).status).toBe(500)
  })
})

describe('POST /api/ledger/transactions — validation', () => {
  it.each(['transaction_date', 'transaction_type', 'source', 'amount', 'payment_mode', 'description'])(
    'requires %s',
    async (field) => {
      await signInAs('RECEPTIONIST')
      const body: Record<string, unknown> = { ...validTransaction }
      delete body[field]

      const { status, body: response } = await create(body)
      expect(status).toBe(400)
      expect(response.error).toBe('Missing required fields')
    }
  )

  it('reports a zero amount as a missing field, because zero is falsy', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await create({ ...validTransaction, amount: 0 })
    expect(status).toBe(400)
    expect(body.error).toBe('Missing required fields')
  })

  it('rejects a negative amount', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await create({ ...validTransaction, amount: -100 })
    expect(status).toBe(400)
    expect(body.error).toBe('Amount must be greater than 0')
  })

  it.each(['transfer', 'CREDIT', '', 'refund'])('rejects the transaction type %j', async (type) => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await create({ ...validTransaction, transaction_type: type })
    expect(status).toBe(400)
    expect(body.error).toMatch(/Invalid transaction type|Missing required fields/)
  })

  it.each(['salary', 'doctor_settlement', 'refund'])('rejects the source %j', async (source) => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await create({ ...validTransaction, source })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid source')
  })

  it.each(['cash', 'upi', 'card', 'bank_transfer', 'cheque'])('accepts the payment mode %s', async (mode) => {
    await signInAs('RECEPTIONIST')

    const { status } = await create({
      ...validTransaction,
      payment_mode: mode,
      reference_number: mode === 'upi' ? 'UPI-1' : undefined,
    })
    expect(status).toBe(201)
  })

  it('rejects an unknown payment mode', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await create({ ...validTransaction, payment_mode: 'crypto' })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid payment mode')
  })

  it('requires a reference number for UPI', async () => {
    await signInAs('RECEPTIONIST')

    const missing = await create({ ...validTransaction, payment_mode: 'upi' })
    expect(missing.status).toBe(400)
    expect(missing.body.error).toBe('Reference number required for UPI payments')

    const blank = await create({ ...validTransaction, payment_mode: 'upi', reference_number: '   ' })
    expect(blank.status).toBe(400)
  })

  it('does not require a reference for card, bank transfer or cheque', async () => {
    await signInAs('RECEPTIONIST')

    for (const mode of ['card', 'bank_transfer', 'cheque']) {
      expect((await create({ ...validTransaction, payment_mode: mode })).status).toBe(201)
    }
  })
})

describe('POST /api/ledger/transactions — creation', () => {
  it('stores the entry as pending, attributed to the caller', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })

    const { status, body } = await create({
      ...validTransaction,
      amount: 1500,
      patient_id: null,
      notes: 'Morning shift',
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({ success: true, message: 'Transaction created successfully' })

    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      transaction_date: TODAY,
      transaction_type: 'credit',
      source: 'opd',
      amount: 1500,
      payment_mode: 'cash',
      description: 'OPD collection',
      notes: 'Morning shift',
      status: 'pending',
      created_by: 'u-recep',
    })
  })

  it('parses a string amount into a number', async () => {
    await signInAs('RECEPTIONIST')

    await create({ ...validTransaction, amount: '2500.50' })
    expect(db.rows('daily_ledger_transactions')[0].amount).toBe(2500.5)
  })

  it('refuses to book into a day that has been closed', async () => {
    await signInAs('RECEPTIONIST')
    aTransaction({ transaction_date: '2026-03-12', status: 'day_closed' })

    const { status, body } = await create({ ...validTransaction, transaction_date: '2026-03-12' })

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot create transaction for 2026-03-12. The day has been closed.')
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })

  it('still allows other dates once one day is closed', async () => {
    await signInAs('RECEPTIONIST')
    aTransaction({ transaction_date: '2026-03-12', status: 'day_closed' })

    expect((await create({ ...validTransaction, transaction_date: '2026-03-13' })).status).toBe(201)
  })

  /**
   * Known defect — see BUGS.md #31. The closed-day guard looks at transaction rows rather
   * than the closure record, and it is not scoped to the user, so closing one employee's
   * shift (close-employee-day) locks the whole date for every other employee.
   */
  it.fails('should not let one employee’s shift close block another employee’s entries', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: '2026-03-12', status: 'day_closed', created_by: 'u-someone-else' })

    const { status } = await create({ ...validTransaction, transaction_date: '2026-03-12' })
    expect(status).toBe(201)
  })
})

describe('PUT /api/ledger/transactions/[id]', () => {
  it('returns 404 for an unknown transaction', async () => {
    await signInAs('ADMIN')

    const { status, body } = await update('missing', { amount: 100 })
    expect(status).toBe(404)
    expect(body.error).toBe('Transaction not found')
  })

  it('lets the creator amend their own entry', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', amount: 500 })

    const { status } = await update('t1', { amount: 750, description: 'Corrected' })

    expect(status).toBe(200)
    expect(transactionRow('t1')).toMatchObject({ amount: 750, description: 'Corrected' })
  })

  it('refuses an entry created by someone else', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-other', amount: 500 })

    const { status, body } = await update('t1', { amount: 999 })

    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(transactionRow('t1').amount).toBe(500)
  })

  it('refuses to touch a closed entry', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', status: 'day_closed', amount: 500 })

    const { status, body } = await update('t1', { amount: 999 })

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot update closed transaction')
    expect(transactionRow('t1').amount).toBe(500)
  })

  it('re-validates the amount, the payment mode and the description', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me' })

    expect((await update('t1', { amount: 0 })).body.error).toBe('Amount must be greater than 0')
    expect((await update('t1', { payment_mode: 'crypto' })).body.error).toBe('Invalid payment mode')
    expect((await update('t1', { description: '  ' })).body.error).toBe('Description cannot be empty')
  })

  it('requires a reference when switching an entry to UPI', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', payment_mode: 'cash', reference_number: null })

    const { status, body } = await update('t1', { payment_mode: 'upi' })

    expect(status).toBe(400)
    expect(body.error).toBe('Reference number required for UPI payments')
  })

  it('refuses to clear the reference on an entry that is already UPI', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', payment_mode: 'upi', reference_number: 'UPI-1' })

    expect((await update('t1', { reference_number: '' })).status).toBe(400)
  })

  it('leaves fields the caller did not send untouched', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', amount: 500, description: 'Original', notes: 'Keep me' })

    await update('t1', { amount: 750 })

    expect(transactionRow('t1')).toMatchObject({ description: 'Original', notes: 'Keep me' })
  })

  /**
   * Known defect — see BUGS.md #32. The ownership check compares against lowercase
   * 'admin' while tokens carry 'ADMIN', so an administrator is treated as a stranger and
   * cannot correct anyone else's entry.
   */
  it.fails('should let an admin amend another user’s entry', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ id: 't1', created_by: 'u-other', amount: 500 })

    const { status } = await update('t1', { amount: 750 })
    expect(status).toBe(200)
  })
})

describe('DELETE /api/ledger/transactions/[id]', () => {
  it('returns 404 for an unknown transaction', async () => {
    await signInAs('ADMIN')
    expect((await remove('missing')).status).toBe(404)
  })

  it('lets the creator delete their own entry', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me' })

    expect((await remove('t1')).status).toBe(200)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('refuses to delete a closed entry', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', status: 'day_closed' })

    const { status, body } = await remove('t1')

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot delete closed transaction')
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })

  it('refuses an entry created by someone else', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-other' })

    expect((await remove('t1')).status).toBe(403)
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })

  /** Known defect — see BUGS.md #32. The same lowercase 'admin' comparison. */
  it.fails('should let an admin delete another user’s entry', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ id: 't1', created_by: 'u-other' })

    expect((await remove('t1')).status).toBe(200)
  })
})

describe('PUT /api/ledger/transactions/[id]/status', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    aTransaction({ id: 't1' })

    const { status, body } = await changeStatus('t1', { status: 'verified' })

    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden. Admin access required.')
  })

  it('lets an admin verify an entry', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ id: 't1', status: 'pending' })

    const { status } = await changeStatus('t1', { status: 'verified' })

    expect(status).toBe(200)
    expect(transactionRow('t1')).toMatchObject({
      status: 'verified',
      verified_by: 'u-admin',
      verified_at: NOW.toISOString(),
    })
  })

  it('lets a doctor verify an entry', async () => {
    await signInAs('DOCTOR')
    aTransaction({ id: 't1', status: 'pending' })

    expect((await changeStatus('t1', { status: 'verified' })).status).toBe(200)
  })

  it('clears the verification when set back to pending', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', status: 'verified', verified_by: 'u-someone', verified_at: '2026-03-01T00:00:00.000Z' })

    await changeStatus('t1', { status: 'pending' })

    expect(transactionRow('t1')).toMatchObject({ status: 'pending', verified_by: null, verified_at: null })
  })

  it.each(['day_closed', 'approved', '', undefined])('rejects the status %j', async (value) => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1' })

    const { status, body } = await changeStatus('t1', { status: value })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid status. Must be pending or verified.')
  })

  it('returns 404 for an unknown transaction', async () => {
    await signInAs('ADMIN')
    expect((await changeStatus('missing', { status: 'verified' })).status).toBe(404)
  })

  it('refuses to change the status of a closed entry', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', status: 'day_closed' })

    const { status, body } = await changeStatus('t1', { status: 'verified' })

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot update status of closed transaction')
  })

  /**
   * Known defect — see BUGS.md #33. Nothing stops the person who recorded an entry from
   * verifying it themselves, which defeats the point of a second-pair-of-eyes check.
   */
  it.fails('should not let a user verify their own entry', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', status: 'pending' })

    const { status } = await changeStatus('t1', { status: 'verified' })
    expect(status).toBe(403)
  })
})

/**
 * The expense category the form always collected and never sent.
 *
 * The modal has rendered a `required` category select since it was written, and
 * built a POST body that left it out. The API never destructured it and the
 * table had no column for it, so every ledger debit ever recorded lost the one
 * field that classified it — silently, with a success toast. These are the
 * regression tests for that.
 */
describe('ledger expenses — the category', () => {
  const expense = (over: Record<string, unknown> = {}) =>
    create({
      ...validTransaction,
      transaction_type: 'debit',
      source: 'expense',
      description: 'Gauze and gloves',
      expense_category: 'supplies',
      ...over,
    })

  it('persists the category on an expense', async () => {
    await signInAs('ADMIN')

    const { status } = await expense()

    expect(status).toBe(201)
    expect(db.rows('daily_ledger_transactions')[0].expense_category).toBe('supplies')
  })

  it('requires one on an expense', async () => {
    await signInAs('ADMIN')

    const { status, body } = await expense({ expense_category: undefined })
    expect(status).toBe(400)
    expect(body.error).toContain('Expense category must be one of')
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('rejects a category outside the list', async () => {
    await signInAs('ADMIN')

    const { status } = await expense({ expense_category: 'bribes' })
    expect(status).toBe(400)
  })

  it.each([undefined, null, '', '   '])(
    'rejects "other" with a detail of %p',
    async (expense_category_detail) => {
      await signInAs('ADMIN')

      const { status, body } = await expense({
        expense_category: 'other',
        expense_category_detail,
      })

      expect(status).toBe(400)
      expect(body.error).toBe('Describe the expense when the category is Other')
    },
  )

  it('stores the detail for "other", trimmed', async () => {
    await signInAs('ADMIN')

    const { status } = await expense({
      expense_category: 'other',
      expense_category_detail: '  Courier charges  ',
    })

    expect(status).toBe(201)
    expect(db.rows('daily_ledger_transactions')[0].expense_category_detail).toBe('Courier charges')
  })

  it('discards a detail on a category that does not take one', async () => {
    await signInAs('ADMIN')

    await expense({ expense_category: 'supplies', expense_category_detail: 'should not stick' })
    expect(db.rows('daily_ledger_transactions')[0].expense_category_detail).toBeNull()
  })

  /** A credit or an OPD collection must not drift into carrying a category. */
  it('nulls the pair on a non-expense row even if the client sends them', async () => {
    await signInAs('ADMIN')

    const { status } = await create({
      ...validTransaction,
      expense_category: 'supplies',
      expense_category_detail: 'nope',
    })

    expect(status).toBe(201)
    const row = db.rows('daily_ledger_transactions')[0]
    expect(row.expense_category).toBeNull()
    expect(row.expense_category_detail).toBeNull()
  })

  it('lets an edit change the category', async () => {
    await signInAs('ADMIN', { userId: 'u1' })
    aTransaction({ id: 't1', source: 'expense', created_by: 'u1', expense_category: 'supplies' })

    const { status } = await update('t1', { expense_category: 'maintenance' })

    expect(status).toBe(200)
    expect(transactionRow('t1').expense_category).toBe('maintenance')
  })

  it('refuses an edit that switches to "other" without a detail', async () => {
    await signInAs('ADMIN', { userId: 'u1' })
    aTransaction({ id: 't1', source: 'expense', created_by: 'u1', expense_category: 'supplies' })

    const { status, body } = await update('t1', { expense_category: 'other' })

    expect(status).toBe(400)
    expect(body.error).toBe('Describe the expense when the category is Other')
  })

  it('clears a stranded detail when switching away from "other"', async () => {
    await signInAs('ADMIN', { userId: 'u1' })
    aTransaction({
      id: 't1',
      source: 'expense',
      created_by: 'u1',
      expense_category: 'other',
      expense_category_detail: 'Courier charges',
    })

    const { status } = await update('t1', { expense_category: 'staff' })

    expect(status).toBe(200)
    expect(transactionRow('t1').expense_category_detail).toBeNull()
  })
})
