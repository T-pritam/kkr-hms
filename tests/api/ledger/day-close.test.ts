/**
 * Ledger reporting and day close:
 *   GET  /api/ledger/daily-summary/[date]
 *   POST /api/ledger/close-day
 *   POST /api/ledger/close-employee-day
 *   GET  /api/ledger/employee-shift-summary
 */

import { describe, it, expect } from 'vitest'
import { GET as dailySummary } from '@/app/api/ledger/daily-summary/[date]/route'
import { POST as closeDay } from '@/app/api/ledger/close-day/route'
import { POST as closeEmployeeDay } from '@/app/api/ledger/close-employee-day/route'
import { GET as shiftSummary } from '@/app/api/ledger/employee-shift-summary/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, aClosure, aUser } from '../../helpers/seed'
import { TODAY } from '../../setup'

const summary = async (date: string) => {
  const { status, body } = await call(dailySummary, 'GET', `/api/ledger/daily-summary/${date}`, {
    params: { date },
  })
  // The route wraps its payload as { success, data }.
  return { status, body: body?.data ?? body, envelope: body }
}

const close = (body: unknown) => call(closeDay, 'POST', '/api/ledger/close-day', { body })

const closeEmployee = (body: unknown) =>
  call(closeEmployeeDay, 'POST', '/api/ledger/close-employee-day', { body })

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

  it('reports whether the day is closed', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', status: 'pending' })

    expect((await summary(TODAY)).body.is_day_closed).toBe(false)

    aTransaction({ transaction_date: TODAY, created_by: 'u-me', status: 'day_closed' })
    expect((await summary(TODAY)).body.is_day_closed).toBe(true)
  })

  it('returns zeroes for a day with no activity', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-me' })

    const { body } = await summary(TODAY)
    expect(body).toMatchObject({ total_credits: 0, total_debits: 0, net_balance: 0, transaction_count: 0 })
  })

  /**
   * Known defect — see BUGS.md #34. The summary is hard-scoped to the caller's own
   * entries, admins included, so the "Daily Ledger Summary" page never shows the day's
   * actual takings — only whatever the person looking at it happened to record.
   */
  it.fails('should show an admin the whole day, not just their own entries', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-admin', transaction_type: 'credit', amount: 1000 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-reception', transaction_type: 'credit', amount: 4000 })

    expect((await summary(TODAY)).body.total_credits).toBe(5000)
  })

  /** Known defect — see BUGS.md #35. Debits get no payment-mode breakdown, so cash paid out is invisible. */
  it.fails('should break debits down by payment mode too', async () => {
    await signInAs('ADMIN', { userId: 'u-me' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-me', transaction_type: 'debit', payment_mode: 'cash', amount: 800 })

    const { body } = await summary(TODAY)
    expect(body.debit_mode_summary?.cash).toBe(800)
  })
})

describe('POST /api/ledger/close-day', () => {
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
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

    expect(status).toBe(400)
    expect(body.error).toBe('This date has already been closed')
  })

  it('refuses a day with no transactions', async () => {
    await signInAs('ADMIN')

    const { status, body } = await close({ closure_date: TODAY })
    expect(status).toBe(404)
    expect(body.error).toBe('No transactions found for this date')
  })

  it('writes a closure record with the day’s totals', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 5000 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'upi', amount: 3000, reference_number: 'UPI-1' })
    aTransaction({ transaction_date: TODAY, transaction_type: 'debit', payment_mode: 'cash', amount: 1000 })

    const { status, body } = await close({ closure_date: TODAY, opening_balance: 2000, notes: 'End of day' })

    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      closure_date: TODAY,
      totalCredits: 8000,
      totalDebits: 1000,
      netBalance: 7000,
      closingBalance: 9000,
      transactionCount: 3,
      creditCount: 2,
      debitCount: 1,
    })

    expect(db.rows('daily_ledger_closures')[0]).toMatchObject({
      closure_date: TODAY,
      total_credits: 8000,
      total_debits: 1000,
      net_balance: 7000,
      total_credits_cash: 5000,
      total_credits_upi: 3000,
      opening_balance: 2000,
      closing_balance: 9000,
      closed_by: 'u-admin',
      notes: 'End of day',
    })
  })

  it('defaults the opening balance to zero', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 5000 })

    const { body } = await close({ closure_date: TODAY })

    expect(body.data.closingBalance).toBe(5000)
    expect(db.rows('daily_ledger_closures')[0].opening_balance).toBe(0)
  })

  it('freezes every transaction on the day', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: TODAY, status: 'pending' })
    aTransaction({ id: 't2', transaction_date: TODAY, status: 'verified' })
    aTransaction({ id: 't3', transaction_date: '2026-03-14', status: 'pending' })

    await close({ closure_date: TODAY })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.status).toBe('day_closed')
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't2')!.status).toBe('day_closed')
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't3')!.status).toBe('pending')
  })

  it('closes across all users, not just the caller', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aTransaction({ transaction_date: TODAY, created_by: 'u-admin', transaction_type: 'credit', amount: 1000 })
    aTransaction({ transaction_date: TODAY, created_by: 'u-reception', transaction_type: 'credit', amount: 4000 })

    const { body } = await close({ closure_date: TODAY })
    expect(body.data.totalCredits).toBe(5000)
  })

  it('closes a day whose entries were never verified', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, status: 'pending' })

    expect((await close({ closure_date: TODAY })).status).toBe(200)
  })

  /** Known defect — see BUGS.md #36. Unverified money should not be reconcilable. */
  it.fails('should refuse to close a day that still has unverified entries', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, status: 'pending' })

    expect((await close({ closure_date: TODAY })).status).toBe(400)
  })

  /**
   * Known defect — see BUGS.md #37. Card credits are counted in total_credits but the
   * per-mode switch has no 'card' branch, so the breakdown does not add up to the total
   * whenever a card payment is taken.
   */
  it.fails('should include card credits in the payment-mode breakdown', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 1000 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'card', amount: 4000 })

    await close({ closure_date: TODAY })

    const closure = db.rows('daily_ledger_closures')[0]
    const breakdown =
      Number(closure.total_credits_cash) + Number(closure.total_credits_upi) + Number(closure.total_credits_other)

    expect(breakdown).toBe(Number(closure.total_credits))
  })

  /**
   * Known defect — see BUGS.md #38. The opening balance is whatever the client sends; it
   * is never checked against the previous day's closing balance, so the running cash
   * position can silently break continuity.
   */
  it.fails('should carry the opening balance forward from the previous closing balance', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: '2026-03-14', closing_balance: 12345 })
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 1000 })

    await close({ closure_date: TODAY, opening_balance: 0 })

    expect(Number(db.rows('daily_ledger_closures').find((c) => c.closure_date === TODAY)!.opening_balance)).toBe(12345)
  })

  /**
   * Known defect — see BUGS.md #39. The status update and the closure insert are not in a
   * transaction. If the insert fails the day is frozen with no closure record, and there
   * is no re-open endpoint to recover.
   */
  it.fails('should not freeze the day when the closure record cannot be written', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', transaction_date: TODAY, status: 'pending' })
    db.failNext('daily_ledger_closures') // the already-closed lookup
    db.failNext('daily_ledger_closures') // the closure insert

    await close({ closure_date: TODAY })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.status).toBe('pending')
  })
})

describe('POST /api/ledger/close-employee-day', () => {
  // DOCTOR was admitted here despite the guard's own message saying otherwise.
  // Settling a shift freezes every transaction that operator booked that day.
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)

    const { status, body } = await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })
    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden. Admin access required.')
  })

  it('requires both the employee and the date', async () => {
    await signInAs('ADMIN')

    expect((await closeEmployee({ settlement_date: TODAY })).body.error).toBe(
      'employee_id and settlement_date are required'
    )
    expect((await closeEmployee({ employee_id: 'u1' })).status).toBe(400)
  })

  it('returns 404 when that employee has nothing on that date', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'someone-else', transaction_date: TODAY })

    const { status, body } = await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })
    expect(status).toBe(404)
    expect(body.error).toBe('No transactions found for this employee on this date')
  })

  it('refuses an employee day that is already closed', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, status: 'day_closed' })

    const { status, body } = await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })
    expect(status).toBe(400)
    expect(body.error).toBe('This employee day has already been closed')
  })

  it('closes that employee’s entries and returns their totals', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', amount: 5000 })
    aTransaction({ id: 't2', created_by: 'u1', transaction_date: TODAY, transaction_type: 'debit', amount: 1200 })
    aTransaction({ id: 't3', created_by: 'u2', transaction_date: TODAY, transaction_type: 'credit', amount: 9999 })

    const { status, body } = await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })

    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      employee_id: 'u1',
      totalCredits: 5000,
      totalDebits: 1200,
      netBalance: 3800,
      transactionsClosed: 2,
    })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.status).toBe('day_closed')
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't3')!.status).toBe('pending')
  })

  it('records the settlement note', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', created_by: 'u1', transaction_date: TODAY })

    await closeEmployee({ employee_id: 'u1', settlement_date: TODAY, notes: 'Cash handed over' })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.notes).toBe('Cash handed over')
  })

  it('defaults the note to "Marked as paid"', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', created_by: 'u1', transaction_date: TODAY })

    await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.notes).toBe('Marked as paid')
  })

  /**
   * Known defect — see BUGS.md #40. Closing a shift overwrites the notes on every one of
   * that employee's transactions, destroying whatever was recorded against each entry.
   */
  it.fails('should not overwrite the notes already on each transaction', async () => {
    await signInAs('ADMIN')
    aTransaction({ id: 't1', created_by: 'u1', transaction_date: TODAY, notes: 'Patient paid in two parts' })

    await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.notes).toBe('Patient paid in two parts')
  })

  /**
   * Known defect — see BUGS.md #41. Nothing is persisted about the settlement: no record,
   * no cash-versus-UPI split, no closing balance. The only trace is the status change, so
   * the day cannot be audited afterwards.
   */
  it.fails('should record the shift settlement somewhere durable', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', amount: 5000 })

    await closeEmployee({ employee_id: 'u1', settlement_date: TODAY })

    expect(db.count('daily_ledger_closures')).toBe(1)
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
      isClosed: false,
    })

    expect(body.data.employeeSummaries.find((e: any) => e.employeeId === 'u2').netBalance).toBe(2000)
  })

  it('defaults to today', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, amount: 500 })

    expect((await shifts()).body.data.settlementDate).toBe(TODAY)
  })

  it('marks an employee closed once their shift is settled', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, status: 'day_closed' })

    expect((await shifts({ date: TODAY })).body.data.employeeSummaries[0].isClosed).toBe(true)
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

  /**
   * Known defect — see BUGS.md #42. The shift summary is what the settlement modal shows
   * before handing cash over, but it reports only a net figure — with no cash-versus-UPI
   * split there is no way to know how much physical cash the employee owes.
   */
  it.fails('should split each employee’s takings by payment mode', async () => {
    await signInAs('ADMIN')
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'cash', amount: 3000 })
    aTransaction({ created_by: 'u1', transaction_date: TODAY, transaction_type: 'credit', payment_mode: 'upi', amount: 2000, reference_number: 'UPI-1' })

    const summaryRow = (await shifts({ date: TODAY })).body.data.employeeSummaries[0]
    expect(summaryRow.cashCredits).toBe(3000)
  })
})
