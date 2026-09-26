/**
 * POST /api/ledger/transactions, and editing one entry.
 *
 * The listing moved to `/api/ledger/entries` (CR-05) and "verify" is gone
 * (Q-24 = A), so what is left here is: can this entry be written, and may this
 * caller change it? A date no longer locks anything — only the row's own
 * Closed status does (CR-06, CR-08).
 */

import { describe, it, expect } from 'vitest'
import { POST as createTransaction } from '@/app/api/ledger/transactions/route'
import { PUT as updateTransaction, DELETE as removeTransaction } from '@/app/api/ledger/transactions/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, signInWithRefreshTokenOnly } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, anInstallment } from '../../helpers/seed'
import { NOW, TODAY } from '../../setup'

const create = (body: unknown) => call(createTransaction, 'POST', '/api/ledger/transactions', { body })
const update = (id: string, body: unknown) =>
  call(updateTransaction, 'PUT', `/api/ledger/transactions/${id}`, { body, params: { id } })
const remove = (id: string) =>
  call(removeTransaction, 'DELETE', `/api/ledger/transactions/${id}`, { params: { id } })
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

    expect((await create(validTransaction)).status).toBe(401)
    expect((await update('t1', {})).status).toBe(401)
    expect((await remove('t1')).status).toBe(401)
  })

  it('renews the session from a refresh token rather than rejecting', async () => {
    await signInWithRefreshTokenOnly('ADMIN')

    const { status } = await create(validTransaction)
    expect(status).toBe(201)
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
  it('stores a reception entry as Open, attributed to the caller', async () => {
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
      status: 'open',
      created_by: 'u-recep',
      closed_at: null,
    })
  })

  // Client, 26 Sep (Q-25 = A reversed): the admin's entries start Open too,
  // and are closed with everything else.
  it('stores an admin entry as Open, like everyone else\'s', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })

    expect((await create(validTransaction)).status).toBe(201)

    const row = db.rows('daily_ledger_transactions')[0]
    expect(row.status).toBe('open')
    expect(row.closed_by).toBeNull()
    expect(row.closed_at).toBeNull()
  })

  it('refuses a lab technician, who has no business in the money log', async () => {
    await signInAs('LAB_TECHNICIAN')

    expect((await create(validTransaction)).status).toBe(403)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('parses a string amount into a number', async () => {
    await signInAs('RECEPTIONIST')

    await create({ ...validTransaction, amount: '2500.50' })
    expect(db.rows('daily_ledger_transactions')[0].amount).toBe(2500.5)
  })

  // Q-22: an entry may be dated any past day, and lands in Not closed. Dates
  // stopped locking anything when day close went away (AC-08.3).
  it('accepts a backdated entry, still Open', async () => {
    await signInAs('RECEPTIONIST')

    const { status } = await create({ ...validTransaction, transaction_date: '2026-03-12' })

    expect(status).toBe(201)
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      transaction_date: '2026-03-12',
      status: 'open',
    })
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
    expect(body.code).toBe('NOT_YOUR_ENTRY')
    expect(transactionRow('t1').amount).toBe(500)
  })

  // §3.2: a Closed row is nobody's to change, admin included, until it is
  // reopened — that is what makes the reopen carry a reason (Q-04 = B).
  it('refuses an entry that is already closed, even for an admin', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-me', amount: 500, status: 'closed', closed_at: NOW.toISOString() })

    const { status, body } = await update('t1', { amount: 999 })

    expect(status).toBe(409)
    expect(body.code).toBe('ENTRY_LOCKED')
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
  it('should let an admin amend another user’s entry', async () => {
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
    aTransaction({ id: 't1', created_by: 'u-me', status: 'closed', closed_at: NOW.toISOString() })

    const { status, body } = await remove('t1')

    expect(status).toBe(409)
    expect(body.code).toBe('ENTRY_LOCKED')
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })

  it('refuses an entry created by someone else', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', created_by: 'u-other' })

    expect((await remove('t1')).status).toBe(403)
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })

  /** Known defect — see BUGS.md #32. The same lowercase 'admin' comparison. */
  it('should let an admin delete another user’s entry', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ id: 't1', created_by: 'u-other' })

    expect((await remove('t1')).status).toBe(200)
  })
})

/**
 * Desk spending left the ledger entirely (PRD v2 CR-07, Q-07 = A): the desk
 * spends from petty cash and the admin records a general expense. The rows
 * already booked stay readable, and the Overview still counts them for their
 * months — but nothing writes another one.
 */
describe('ledger expenses — moved out', () => {
  it('refuses a new expense entry, whoever asks', async () => {
    await signInAs('ADMIN')

    const { status, body } = await create({
      ...validTransaction,
      transaction_type: 'debit',
      source: 'expense',
      description: 'Gauze and gloves',
      expense_category: 'supplies',
    })

    expect(status).toBe(400)
    expect(body.error).toBe('Invalid source')
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('still lets an OPD receipt through', async () => {
    await signInAs('RECEPTIONIST')

    expect((await create(validTransaction)).status).toBe(201)
  })
})

/**
 * PRD v2 CR-12: a patient payment's credit moves with the payment. The ledger
 * screen editing or deleting it on its own is how "Paid" and the cash book
 * drifted apart (G-02).
 */
describe('ledger — entries that belong to a patient payment', () => {
  it('refuses to edit a payment credit, for admin too', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', source: 'patient', created_by: 'u-me', amount: 500 })
    anInstallment({ id: 'i1', ledger_transaction_id: 't1', amount: 500 })

    const { status, body } = await update('t1', { amount: 50 })

    expect(status).toBe(409)
    expect(body.code).toBe('LEDGER_ENTRY_IS_PAYMENT')
    expect(transactionRow('t1').amount).toBe(500)
  })

  it('refuses to delete a payment credit', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ id: 't1', source: 'patient', created_by: 'u-me' })
    anInstallment({ id: 'i1', ledger_transaction_id: 't1' })

    const { status, body } = await remove('t1')

    expect(status).toBe(409)
    expect(body.code).toBe('LEDGER_ENTRY_IS_PAYMENT')
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })

  it('refuses a registration-fee credit even if its link is missing', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', source: 'registration', created_by: 'u-me' })

    expect((await update('t1', { amount: 1 })).status).toBe(409)
    expect((await remove('t1')).status).toBe(409)
  })

  /** An orphan left by an old payment delete stays editable, so it can be cleaned up. */
  it('still lets an unlinked patient row be removed', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ id: 't1', source: 'patient', created_by: 'u-me' })

    expect((await remove('t1')).status).toBe(200)
  })

  it('does not accept a bare patient or registration credit from the ledger form', async () => {
    await signInAs('RECEPTIONIST')

    expect((await create({ ...validTransaction, source: 'patient' })).body.error).toBe('Invalid source')
    expect((await create({ ...validTransaction, source: 'registration' })).body.error).toBe('Invalid source')
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })
})
