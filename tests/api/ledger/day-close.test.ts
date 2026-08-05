/**
 * Ledger reporting and day close:
 *   GET  /api/ledger/daily-summary/[date]
 *   POST /api/ledger/close-day
 *   GET  /api/ledger/employee-shift-summary
 *
 * The shift-settlement routes that replaced POST /api/ledger/close-employee-day have
 * their own file — settling a shift is no longer a way of closing anything.
 */

import { describe, it, expect } from 'vitest'
import { GET as dailySummary } from '@/app/api/ledger/daily-summary/[date]/route'
import { POST as closeDay } from '@/app/api/ledger/close-day/route'
import { GET as shiftSummary } from '@/app/api/ledger/employee-shift-summary/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, aClosure, aShiftSettlement, aUser } from '../../helpers/seed'
import { TODAY } from '../../setup'

const summary = async (date: string) => {
  const { status, body } = await call(dailySummary, 'GET', `/api/ledger/daily-summary/${date}`, {
    params: { date },
  })
  // The route wraps its payload as { success, data }.
  return { status, body: body?.data ?? body, envelope: body }
}

const close = (body: unknown) => call(closeDay, 'POST', '/api/ledger/close-day', { body })

const shifts = (query = {}) => call(shiftSummary, 'GET', '/api/ledger/employee-shift-summary', { query })

describe('GET /api/ledger/daily-summary/[date]', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await summary(TODAY)).status).toBe(401)
  })

  it('totals credits and debits and nets them off', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', transaction_type: 'credit', amount: 5000 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', transaction_type: 'credit', amount: 2000 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', transaction_type: 'debit', amount: 1500 })

    const { status, body } = await summary(TODAY)

    expect(status).toBe(200)
    expect(body).toMatchObject({
      date: TODAY,
      total_credits: 7000,
      total_debits: 1500,
      net_balance: 5500,
      credit_count: 2,
      debit_count: 1,
      transaction_count: 3,
    })
  })

  it('breaks credits down by payment mode', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    const base = { transaction_date: TODAY, created_by: 'u-me', transaction_type: 'credit' }
    aTransaction({ ...base, payment_mode: 'cash', amount: 1000 })
    aTransaction({ ...base, payment_mode: 'upi', amount: 2000, reference_number: 'UPI-1' })
    aTransaction({ ...base, payment_mode: 'card', amount: 3000 })
    aTransaction({ ...base, payment_mode: 'bank_transfer', amount: 4000 })
    aTransaction({ ...base, payment_mode: 'cheque', amount: 5000 })

    const { body } = await summary(TODAY)

    expect(body.payment_mode_summary).toEqual({
      cash: 1000,
      upi: 2000,
      card: 3000,
      bank_transfer: 4000,
      cheque: 5000,
    })
    expect(body.total_credits_other).toBe(9000) // bank transfer + cheque
    expect(body.total_credits).toBe(15000)
  })

  it('ignores other dates', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', amount: 1000 })
    aTransaction({ transaction_date: '2026-03-14', created_by: 'u-me', amount: 9999 })

    expect((await summary(TODAY)).body.total_credits).toBe(1000)
  })

  it('reads the closed flag from the closure record, not from row statuses', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', status: 'pending' })

    expect((await summary(TODAY)).body.is_day_closed).toBe(false)

    aClosure({ closure_date: TODAY })
    const { body } = await summary(TODAY)
    expect(body.is_day_closed).toBe(true)
    expect(body.closure.closure_date).toBe(TODAY)
  })

  it('treats a reopened day as open', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me' })
    aClosure({
      closure_date: TODAY,
      status: 'superseded',
      reopened_at: new Date().toISOString(),
      reopen_reason: 'missed a UPI receipt',
    })

    expect((await summary(TODAY)).body.is_day_closed).toBe(false)
  })

  it('counts entries still awaiting verification', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', status: 'pending' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', status: 'verified' })

    expect((await summary(TODAY)).body.unverified_count).toBe(1)
  })

  it('previews the opening balance the next close would inherit', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aClosure({ closure_date: '2026-03-14', closing_balance: 4200, closing_cash_balance: 1100 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me' })

    const { body } = await summary(TODAY)
    expect(body.opening_balance_preview).toBe(4200)
    expect(body.opening_cash_balance_preview).toBe(1100)
  })

  it('returns zeroes for a day with no activity', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })

    const { body } = await summary(TODAY)
    expect(body).toMatchObject({ total_credits: 0, total_debits: 0, net_balance: 0, transaction_count: 0 })
  })

  /** Was BUGS.md #34 — the summary was hard-scoped to the caller, admins included. */
  it('should show an admin the whole day, not just their own entries', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-admin', transaction_type: 'credit', amount: 1000 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-reception', transaction_type: 'credit', amount: 4000 })

    expect((await summary(TODAY)).body.total_credits).toBe(5000)
  })

  /** Was BUGS.md #35 — debits had no payment-mode breakdown, so cash paid out was invisible. */
  it('should break debits down by payment mode too', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', transaction_type: 'debit', payment_mode: 'cash', amount: 800 })

    const { body } = await summary(TODAY)
    expect(body.debit_mode_summary?.cash).toBe(800)
  })
})

describe('POST /api/ledger/close-day', () => {
  // DOCTOR is refused too now: closing reconciles the day's cash and locks the period.
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    aTransaction({ transaction_date: TODAY })

    const { status, body } = await close({ closure_date: TODAY })

    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden. Admin access required.')
  })

  it('requires a closure date', async () => {
    await signInAs('ADMIN')

    const { status, body } = await close({})
    expect(status).toBe(400)
    expect(body.error).toBe('closure_date is required')
  })

  it('refuses a date that has already been closed', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: TODAY })
    aTransaction({ transaction_date: TODAY })

    const { status, body } = await close({ closure_date: TODAY })

    // 409, not 400: the request is well-formed, it conflicts with the period's state.
    expect(status).toBe(409)
    expect(body.error).toBe('This date has already been closed')
  })

  it('refuses a date in the future', async () => {
    await signInAs('ADMIN')

    const { status } = await close({ closure_date: '2099-01-01' })
    expect(status).toBe(400)
  })

  it('refuses a day with no transactions', async () => {
    await signInAs('ADMIN')

    const { status, body } = await close({ closure_date: TODAY })
    expect(status).toBe(404)
    expect(body.error).toBe('No transactions found for this date')
  })

  it('writes a closure record with the day’s totals', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    // The opening balance is derived from the previous close, never from the request.
    aClosure({ closure_date: '2026-03-14', closing_balance: 2000, closing_cash_balance: 2000 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 5000 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'upi', amount: 3000, reference_number: 'UPI-1' })
    aTransaction({ transaction_date: TODAY, transaction_type: 'debit', payment_mode: 'cash', amount: 1000 })

    const { status, body } = await close({ closure_date: TODAY, notes: 'End of day' })

    expect(status).toBe(200)
    expect(body.data.closure).toMatchObject({
      closure_date: TODAY,
      status: 'active',
      version: 1,
      total_credits: 8000,
      total_debits: 1000,
      net_balance: 7000,
      total_credits_cash: 5000,
      total_credits_upi: 3000,
      total_debits_cash: 1000,
      transaction_count: 3,
      credit_count: 2,
      debit_count: 1,
      opening_balance: 2000,
      closing_balance: 9000,
      // Cash only: 2000 carried in + 5000 taken - 1000 paid out.
      closing_cash_balance: 6000,
      closed_by: 'u-admin',
      notes: 'End of day',
    })
  })

  it('ignores an opening_balance sent by the client', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: '2026-03-14', closing_balance: 500 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 100 })

    const { body } = await close({ closure_date: TODAY, opening_balance: 999999 })
    expect(body.data.closure.opening_balance).toBe(500)
  })

  it('defaults the opening balance to zero when nothing precedes it', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 5000 })

    const { body } = await close({ closure_date: TODAY })

    expect(body.data.closure.closing_balance).toBe(5000)
    expect(body.data.closure.opening_balance).toBe(0)
  })

  it('leaves every transaction untouched — closing is a property of the date', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: TODAY, status: 'pending', notes: 'Paid in two parts' })
    aTransaction({ id: 't2', transaction_date: TODAY, status: 'verified' })

    await close({ closure_date: TODAY })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.status).toBe('pending')
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.notes).toBe('Paid in two parts')
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't2')!.status).toBe('verified')
  })

  it('closes across all users, not just the caller', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-admin', transaction_type: 'credit', amount: 1000 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-reception', transaction_type: 'credit', amount: 4000 })

    const { body } = await close({ closure_date: TODAY })
    expect(body.data.closure.total_credits).toBe(5000)
  })

  it('records the close in the audit log', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 1000 })

    await close({ closure_date: TODAY })

    const entry = db.find('record_audit_log', (r) => r.entity_type === 'ledger_day')
    expect(entry).toMatchObject({ action: 'finalised', actor_id: 'u-admin' })
  })

  it('closes a day whose entries were never verified', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, status: 'pending' })

    expect((await close({ closure_date: TODAY })).status).toBe(200)
  })

  /**
   * Was BUGS.md #36, decided against. Blocking on unverified entries would strand a day
   * whenever the person who verifies them is unavailable, and closing is a cash
   * reconciliation rather than a sign-off. The count is warned about and recorded instead.
   */
  it('warns about unverified entries rather than blocking the close', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, status: 'pending' })
    aTransaction({ transaction_date: TODAY, status: 'verified' })

    const { status, body } = await close({ closure_date: TODAY })

    expect(status).toBe(200)
    expect(body.data.warnings.unverified_count).toBe(1)
    expect(body.data.closure.unverified_count).toBe(1)
  })

  /** Was BUGS.md #37 — card credits counted toward the total with no branch in the switch. */
  it('should include card credits in the payment-mode breakdown', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 1000 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'card', amount: 4000 })

    await close({ closure_date: TODAY })

    const closure = db.rows('daily_ledger_closures')[0]
    const breakdown =
      Number(closure.total_credits_cash) +
      Number(closure.total_credits_upi) +
      Number(closure.total_credits_card) +
      Number(closure.total_credits_bank_transfer) +
      Number(closure.total_credits_cheque)

    expect(breakdown).toBe(Number(closure.total_credits))
    expect(Number(closure.total_credits_card)).toBe(4000)
  })

  /** Was BUGS.md #38 — the opening balance was whatever the client sent. */
  it('should carry the opening balance forward from the previous closing balance', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: '2026-03-14', closing_balance: 12345 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 1000 })

    await close({ closure_date: TODAY, opening_balance: 0 })

    expect(Number(db.rows('daily_ledger_closures').find((c) => c.closure_date === TODAY)!.opening_balance)).toBe(12345)
  })

  /**
   * Was BUGS.md #39. The failure mode is gone by construction rather than by care: the
   * close writes one row and touches no transaction, so there is nothing left frozen to
   * point at a closure that was never written.
   */
  it('leaves the date writable when the closure cannot be written', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: TODAY, status: 'pending' })
    db.failNext('close_ledger_day')

    const { status } = await close({ closure_date: TODAY })

    expect(status).toBe(500)
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.status).toBe('pending')
    expect(db.rows('daily_ledger_closures').filter((c) => c.status === 'active')).toHaveLength(0)
  })

  it('re-closing after a reopen supersedes rather than duplicates', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 1000 })
    const first = aClosure({
      closure_date: TODAY,
      status: 'superseded',
      version: 1,
      reopened_at: new Date().toISOString(),
      reopen_reason: 'missed a UPI receipt',
    })

    const { status, body } = await close({ closure_date: TODAY })

    expect(status).toBe(200)
    expect(body.data.closure.version).toBe(2)
    expect(body.data.closure.supersedes_id).toBe(first.id)
    // The superseded row is history and is never removed.
    expect(db.count('daily_ledger_closures')).toBe(2)
  })

  it('allows an empty day to be re-closed after a reopen emptied it', async () => {
    await signInAs('ADMIN')
    aClosure({
      closure_date: TODAY,
      status: 'superseded',
      version: 1,
      reopened_at: new Date().toISOString(),
      reopen_reason: 'the only entry was a duplicate',
    })

    expect((await close({ closure_date: TODAY })).status).toBe(200)
  })
})

describe('GET /api/ledger/employee-shift-summary', () => {
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

    const { status, body } = await shifts({ date: TODAY })
    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden. Admin access required.')
  })

  it('groups the day’s activity by employee', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'reception1' })
    aUser({ id: 'u2', username: 'reception2' })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', amount: 5000 })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'debit', amount: 1000 })
    aTransaction({ created_by: 'u2', transaction_date: TODAY, transaction_type: 'credit', amount: 2000 })

    const { status, body } = await shifts({ date: TODAY })

    expect(status).toBe(200)
    expect(body.data.settlementDate).toBe(TODAY)

    const first = body.data.employeeSummaries.find((e: any) => e.employeeId === 'u1')
    expect(first).toMatchObject({
      employeeName: 'reception1',
      totalCredits: 5000,
      totalDebits: 1000,
      netBalance: 4000,
      creditCount: 1,
      debitCount: 1,
      transactionCount: 2,
      isSettled: false,
    })

    expect(body.data.employeeSummaries.find((e: any) => e.employeeId === 'u2').netBalance).toBe(2000)
  })

  it('defaults to today', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, amount: 500 })

    expect((await shifts()).body.data.settlementDate).toBe(TODAY)
  })

  it('marks an employee settled from the settlement record, not a row status', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })
    aShiftSettlement({ employee_id: 'u1', settlement_date: TODAY })

    expect((await shifts({ date: TODAY })).body.data.employeeSummaries[0].isSettled).toBe(true)
  })

  it('reports whether the date itself is closed, separately from settlement', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })
    aClosure({ closure_date: TODAY })

    const { body } = await shifts({ date: TODAY })
    expect(body.data.dayClosed).toBe(true)
    // Settling and closing are different acts; neither implies the other.
    expect(body.data.employeeSummaries[0].isSettled).toBe(false)
  })

  it('ignores a reversed settlement', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY })
    aShiftSettlement({
      employee_id: 'u1',
      settlement_date: TODAY,
      status: 'reversed',
      reversed_at: new Date().toISOString(),
      reversal_reason: 'counted the float twice',
    })

    expect((await shifts({ date: TODAY })).body.data.employeeSummaries[0].isSettled).toBe(false)
  })

  it('falls back to "Unknown" when the user row is missing', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'ghost-user', transaction_date: TODAY })

    expect((await shifts({ date: TODAY })).body.data.employeeSummaries[0].employeeName).toBe('Unknown')
  })

  it('returns an empty list for a quiet day', async () => {
    await signInAs('ADMIN')

    expect((await shifts({ date: TODAY })).body.data.employeeSummaries).toEqual([])
  })

  /** Was BUGS.md #42 — only a net figure, so the cash actually owed was unknowable. */
  it('should split each employee’s takings by payment mode', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 3000 })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'upi', amount: 2000, reference_number: 'UPI-1' })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'debit', payment_mode: 'cash', amount: 500 })

    const summaryRow = (await shifts({ date: TODAY })).body.data.employeeSummaries[0]
    expect(summaryRow.creditsCash).toBe(3000)
    expect(summaryRow.creditsUpi).toBe(2000)
    expect(summaryRow.debitsCash).toBe(500)
    // Only cash leaves the drawer.
    expect(summaryRow.cashExpected).toBe(2500)
  })
})
