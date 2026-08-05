/**
 * GET /api/ledger/open-days — the unclosed-day worklist.
 *
 * Finding out what still needed closing used to mean stepping through the Daily
 * Ledger date picker one day at a time, which is why the production database
 * accumulated six dates of activity and not one closure. These tests pin the
 * behaviour that makes the backlog visible: oldest first, closed dates gone,
 * reopened dates distinguishable from never-closed ones.
 */

import { describe, it, expect } from 'vitest'
import { GET as openDays } from '@/app/api/ledger/open-days/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { aTransaction, aClosure } from '../../helpers/seed'
import { TODAY } from '../../setup'

const list = (query = {}) => call(openDays, 'GET', '/api/ledger/open-days', { query })

describe('GET /api/ledger/open-days', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await list()).status).toBe(401)
  })

  // The banner renders nothing on a 403, so other roles simply never see it.
  it.each(['NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(403)
  })

  it.each(['ADMIN', 'DOCTOR'] as const)('allows %s', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(200)
  })

  it('lists dates with activity and no closure, oldest first', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-12' })
    aTransaction({ transaction_date: '2026-03-10' })
    aTransaction({ transaction_date: '2026-03-11' })

    const { body } = await list()

    expect(body.data.open_days.map((d: any) => d.date)).toEqual([
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
    ])
    expect(body.data.total_open).toBe(3)
    expect(body.data.oldest_open_date).toBe('2026-03-10')
  })

  it('excludes a date that has been closed', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-10' })
    aTransaction({ transaction_date: '2026-03-11' })
    aClosure({ closure_date: '2026-03-10' })

    expect((await list()).body.data.open_days.map((d: any) => d.date)).toEqual(['2026-03-11'])
  })

  it('brings a reopened date back, flagged as reopened', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-10' })
    aClosure({
      closure_date: '2026-03-10',
      status: 'superseded',
      reopened_at: '2026-03-11T10:00:00.000Z',
      reopen_reason: 'missed a UPI receipt',
    })

    const [day] = (await list()).body.data.open_days

    expect(day.date).toBe('2026-03-10')
    // A day that was closed and reopened must not look like one nobody ever closed.
    expect(day.reopened).toBe(true)
    expect(day.last_reopen_reason).toBe('missed a UPI receipt')
  })

  it('marks a never-closed date as not reopened', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-10' })

    const [day] = (await list()).body.data.open_days
    expect(day.reopened).toBe(false)
    expect(day.last_reopened_at).toBeNull()
  })

  it('totals each day and counts what is still unverified', async () => {
    await signInAs('ADMIN')
    const base = { transaction_date: '2026-03-10' }
    aTransaction({ ...base, transaction_type: 'credit', payment_mode: 'cash', amount: 5000, status: 'verified' })
    aTransaction({ ...base, transaction_type: 'credit', payment_mode: 'upi', amount: 2000, status: 'pending', reference_number: 'UPI-1' })
    aTransaction({ ...base, transaction_type: 'debit', payment_mode: 'cash', amount: 1000, status: 'pending' })

    const [day] = (await list()).body.data.open_days

    expect(day).toMatchObject({
      transaction_count: 3,
      credit_count: 2,
      debit_count: 1,
      total_credits: 7000,
      total_debits: 1000,
      net_balance: 6000,
      cash_credits: 5000,
      unverified_count: 2,
    })
  })

  // Today is in progress, not late. Listing it every morning trains people to
  // ignore the list.
  it('excludes today by default', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY })

    expect((await list()).body.data.open_days).toEqual([])
  })

  it('includes today on request', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY })

    const { body } = await list({ include_today: 'true' })
    expect(body.data.open_days.map((d: any) => d.date)).toEqual([TODAY])
  })

  it('returns an empty list when everything is closed', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-10' })
    aClosure({ closure_date: '2026-03-10' })

    const { body } = await list()
    expect(body.data.open_days).toEqual([])
    expect(body.data.oldest_open_date).toBeNull()
  })

  it('honours the limit', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: '2026-03-10' })
    aTransaction({ transaction_date: '2026-03-11' })
    aTransaction({ transaction_date: '2026-03-12' })

    expect((await list({ limit: '2' })).body.data.open_days).toHaveLength(2)
  })
})
