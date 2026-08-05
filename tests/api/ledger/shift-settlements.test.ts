/**
 * Shift settlements — POST/GET /api/ledger/shift-settlements and DELETE by id.
 *
 * These replace POST /api/ledger/close-employee-day, which conflated settling a
 * shift with closing the day. The three properties worth holding onto, and the
 * three things the old route got wrong, are the same list:
 *
 *   1. A settlement is durable and auditable. The old one wrote nothing.
 *   2. It touches no transaction. The old one flipped every row's status and
 *      overwrote every row's notes with "Marked as paid".
 *   3. It locks nothing. The old one locked the date for every other employee.
 */

import { describe, it, expect } from 'vitest'
import { POST as settleShift, GET as listSettlements } from '@/app/api/ledger/shift-settlements/route'
import { DELETE as reverseSettlement } from '@/app/api/ledger/shift-settlements/[id]/route'
import { POST as createTransaction } from '@/app/api/ledger/transactions/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, aClosure, aShiftSettlement, aUser } from '../../helpers/seed'
import { TODAY } from '../../setup'

const settle = (body: unknown) =>
  call(settleShift, 'POST', '/api/ledger/shift-settlements', { body })

const list = (query = {}) => call(listSettlements, 'GET', '/api/ledger/shift-settlements', { query })

const reverse = (id: string, body: unknown) =>
  call(reverseSettlement, 'DELETE', `/api/ledger/shift-settlements/${id}`, { body, params: { id } })

const create = (body: unknown) =>
  call(createTransaction, 'POST', '/api/ledger/transactions', { body })

describe('POST /api/ledger/shift-settlements', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await settle({ employee_id: 'u1', settlement_date: TODAY })).status).toBe(401)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

    const { status, body } = await settle({ employee_id: 'u1', settlement_date: TODAY })
    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden. Admin access required.')
  })

  it('requires both the employee and the date', async () => {
    await signInAs('ADMIN')

    expect((await settle({ settlement_date: TODAY })).body.error).toBe(
      'employee_id and settlement_date are required'
    )
    expect((await settle({ employee_id: 'u1' })).status).toBe(400)
  })

  it('returns 404 when that employee has nothing on that date', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'someone-else', transaction_date: TODAY })

    const { status, body } = await settle({ employee_id: 'u1', settlement_date: TODAY })
    expect(status).toBe(404)
    expect(body.error).toBe('No transactions found for this employee on this date')
  })

  it('writes a durable record with the per-mode split', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 5000 })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'upi', amount: 2000, reference_number: 'UPI-1' })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'debit', payment_mode: 'cash', amount: 1200 })
    aTransaction({ created_by: 'u2', transaction_date: TODAY, transaction_type: 'credit', amount: 9999 })

    const { status, body } = await settle({
      employee_id: 'u1',
      settlement_date: TODAY,
      cash_handed_over: 3500,
      notes: 'Counted with Anita',
    })

    expect(status).toBe(201)
    expect(body.data).toMatchObject({
      employee_id: 'u1',
      settlement_date: TODAY,
      total_credits: 7000,
      total_debits: 1200,
      net_balance: 5800,
      credits_cash: 5000,
      credits_upi: 2000,
      debits_cash: 1200,
      // Only physical cash is handed over; UPI never touches the drawer.
      cash_expected: 3800,
      cash_handed_over: 3500,
      transaction_count: 3,
      notes: 'Counted with Anita',
      settled_by: 'u-admin',
      status: 'active',
    })
  })

  it('does not touch a single transaction', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', created_by: 'u1', transaction_date: TODAY, status: 'pending', notes: 'Patient paid in two parts' })
    aTransaction({ id: 't2', created_by: 'u1', transaction_date: TODAY, status: 'verified', notes: null })

    await settle({ employee_id: 'u1', settlement_date: TODAY, notes: 'Cash handed over' })

    // Was BUGS.md #40 — the old route overwrote every row's notes.
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')).toMatchObject({
      status: 'pending',
      notes: 'Patient paid in two parts',
    })
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't2')!.status).toBe('verified')
  })

  it('does not close the day', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })

    await settle({ employee_id: 'u1', settlement_date: TODAY })

    // Was BUGS.md #41 — a settlement is not a closure and must not be recorded as one.
    expect(db.count('daily_ledger_closures')).toBe(0)
    expect(db.count('daily_ledger_shift_settlements')).toBe(1)
  })

  it('does not stop a colleague recording an entry on the same date', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })
    await settle({ employee_id: 'u1', settlement_date: TODAY })

    // Was BUGS.md #31 — one operator going home locked the date for everyone.
    await signInAs('RECEPTIONIST', { userId: 'u2' })
    const { status } = await create({
      transaction_date: TODAY,
      transaction_type: 'credit',
      source: 'opd',
      amount: 500,
      payment_mode: 'cash',
      description: 'OPD collection',
    })

    expect(status).toBe(201)
  })

  it('refuses a second active settlement for the same shift', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })

    expect((await settle({ employee_id: 'u1', settlement_date: TODAY })).status).toBe(201)

    const { status, body } = await settle({ employee_id: 'u1', settlement_date: TODAY })
    expect(status).toBe(409)
    expect(body.error).toBe('This shift has already been settled')
  })

  /**
   * A handover after the day was reconciled is a normal thing to happen, and it
   * mutates no ledger row and changes no total. Refusing would strand it.
   */
  it('allows a settlement on a date that is already closed', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })
    aClosure({ closure_date: TODAY })

    expect((await settle({ employee_id: 'u1', settlement_date: TODAY })).status).toBe(201)
  })

  it('records the settlement in the audit log', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ created_by: 'u1', transaction_date: TODAY })

    await settle({ employee_id: 'u1', settlement_date: TODAY })

    expect(db.find('record_audit_log', (r) => r.entity_type === 'ledger_shift')).toMatchObject({
      action: 'finalised',
      actor_id: 'u-admin',
    })
  })
})

describe('GET /api/ledger/shift-settlements', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await list({ date: TODAY })).status).toBe(403)
  })

  it('requires a date', async () => {
    await signInAs('ADMIN')
    expect((await list()).status).toBe(400)
  })

  it('returns the active settlements for the date', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'reception1' })
    aShiftSettlement({ employee_id: 'u1', settlement_date: TODAY })
    aShiftSettlement({ employee_id: 'u2', settlement_date: '2026-03-10' })

    const { body } = await list({ date: TODAY })
    expect(body.data).toHaveLength(1)
    expect(body.data[0].employee_id).toBe('u1')
  })

  it('omits reversed settlements', async () => {
    await signInAs('ADMIN')
    aShiftSettlement({
      employee_id: 'u1',
      settlement_date: TODAY,
      status: 'reversed',
      reversed_at: new Date().toISOString(),
      reversal_reason: 'counted the float twice',
    })

    expect((await list({ date: TODAY })).body.data).toEqual([])
  })
})

describe('DELETE /api/ledger/shift-settlements/[id]', () => {
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await reverse('s1', { reason: 'counted the float twice' })).status).toBe(403)
  })

  it('requires a reason', async () => {
    await signInAs('ADMIN')
    aShiftSettlement({ id: 's1', employee_id: 'u1', settlement_date: TODAY })

    expect((await reverse('s1', {})).status).toBe(400)
    expect((await reverse('s1', { reason: 'oops' })).status).toBe(400)
    expect(db.find('daily_ledger_shift_settlements', (r) => r.id === 's1')!.status).toBe('active')
  })

  it('returns 404 for an unknown settlement', async () => {
    await signInAs('ADMIN')
    expect((await reverse('missing', { reason: 'counted the float twice' })).status).toBe(404)
  })

  it('reverses rather than deletes, keeping the original figures', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aShiftSettlement({ id: 's1', employee_id: 'u1', settlement_date: TODAY, cash_expected: 3800 })

    const { status, body } = await reverse('s1', { reason: 'counted the float twice' })

    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      status: 'reversed',
      reversed_by: 'u-admin',
      reversal_reason: 'counted the float twice',
    })
    // The row the operator was signed off against has to remain readable.
    expect(db.count('daily_ledger_shift_settlements')).toBe(1)
    expect(Number(db.rows('daily_ledger_shift_settlements')[0].cash_expected)).toBe(3800)
  })

  it('refuses to reverse the same settlement twice', async () => {
    await signInAs('ADMIN')
    aShiftSettlement({
      id: 's1',
      employee_id: 'u1',
      settlement_date: TODAY,
      status: 'reversed',
      reversed_at: new Date().toISOString(),
      reversal_reason: 'counted the float twice',
    })

    expect((await reverse('s1', { reason: 'counted the float twice' })).status).toBe(409)
  })

  it('lets a corrected settlement be recorded afterwards', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })
    aShiftSettlement({ id: 's1', employee_id: 'u1', settlement_date: TODAY })

    await reverse('s1', { reason: 'counted the float twice' })

    expect((await settle({ employee_id: 'u1', settlement_date: TODAY })).status).toBe(201)
  })

  it('records the reversal in the audit log', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aShiftSettlement({ id: 's1', employee_id: 'u1', settlement_date: TODAY })

    await reverse('s1', { reason: 'counted the float twice' })

    expect(db.find('record_audit_log', (r) => r.entity_type === 'ledger_shift')).toMatchObject({
      action: 'reopened',
      actor_id: 'u-admin',
    })
  })
})
