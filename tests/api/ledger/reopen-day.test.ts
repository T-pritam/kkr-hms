/**
 * POST /api/ledger/reopen-day
 *
 * Until this route existed there was no way back from a close. A day shut by
 * mistake, or one that a receipt turned up for an hour later, stayed frozen for
 * good — nothing could be added, amended, verified or removed by anyone.
 *
 * The properties that matter here are that a reopen is never silent (a reason is
 * mandatory), never destructive (the old closure survives as history), and that
 * a reopened date is genuinely writable again.
 */

import { describe, it, expect } from 'vitest'
import { POST as reopenDay } from '@/app/api/ledger/reopen-day/route'
import { POST as closeDay } from '@/app/api/ledger/close-day/route'
import { POST as createTransaction } from '@/app/api/ledger/transactions/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, aClosure } from '../../helpers/seed'
import { TODAY } from '../../setup'

const reopen = (body: unknown) => call(reopenDay, 'POST', '/api/ledger/reopen-day', { body })
const close = (body: unknown) => call(closeDay, 'POST', '/api/ledger/close-day', { body })
const create = (body: unknown) =>
  call(createTransaction, 'POST', '/api/ledger/transactions', { body })

const A_GOOD_REASON = 'The 6pm UPI receipt was missed before closing'

const anEntry = {
  transaction_date: TODAY,
  transaction_type: 'credit',
  source: 'opd',
  amount: 500,
  payment_mode: 'cash',
  description: 'OPD collection',
}

describe('POST /api/ledger/reopen-day', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })).status).toBe(401)
  })

  // Reopening unlocks reconciled money. Narrower than reading the day.
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    aClosure({ closure_date: TODAY })

    const { status, body } = await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })
    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden. Admin access required.')
  })

  it('requires a closure date', async () => {
    await signInAs('ADMIN')
    expect((await reopen({ reason: A_GOOD_REASON })).status).toBe(400)
  })

  it('requires a reason', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: TODAY })

    const { status, body } = await reopen({ closure_date: TODAY })
    expect(status).toBe(400)
    expect(body.error).toContain('at least 10 characters')
  })

  it('refuses a reason that is too short to mean anything', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: TODAY })

    expect((await reopen({ closure_date: TODAY, reason: 'oops' })).status).toBe(400)
    expect((await reopen({ closure_date: TODAY, reason: '          ' })).status).toBe(400)
    expect(db.rows('daily_ledger_closures')[0].status).toBe('active')
  })

  it('refuses a date that is not currently closed', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY })

    const { status, body } = await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })
    expect(status).toBe(409)
    expect(body.error).toBe('This date is not currently closed')
  })

  it('supersedes the closure and records who reopened it and why', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aClosure({ closure_date: TODAY, total_credits: 3200 })

    const { status, body } = await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })

    expect(status).toBe(200)
    expect(body.data.closure).toMatchObject({
      status: 'superseded',
      reopened_by: 'u-admin',
      reopen_reason: A_GOOD_REASON,
    })
    expect(body.data.closure.reopened_at).toBeTruthy()

    // The reported totals survive on the superseded row.
    expect(Number(db.rows('daily_ledger_closures')[0].total_credits)).toBe(3200)
  })

  it('never deletes the closure it replaces', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: TODAY })

    await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })

    expect(db.count('daily_ledger_closures')).toBe(1)
    expect(db.rows('daily_ledger_closures')[0].status).toBe('superseded')
  })

  it('makes the date writable again', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY })
    aClosure({ closure_date: TODAY })

    expect((await create(anEntry)).status).toBe(409)

    await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })

    expect((await create(anEntry)).status).toBe(201)
  })

  it('re-closing produces a second version pointing back at the first', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 1000 })

    const first = await close({ closure_date: TODAY })
    expect(first.body.data.closure.version).toBe(1)

    await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })

    const second = await close({ closure_date: TODAY })
    expect(second.body.data.closure.version).toBe(2)
    expect(second.body.data.closure.supersedes_id).toBe(first.body.data.closure.id)

    // One active closure, one superseded — the history is intact.
    const closures = db.rows('daily_ledger_closures')
    expect(closures.filter((c) => c.status === 'active')).toHaveLength(1)
    expect(closures.filter((c) => c.status === 'superseded')).toHaveLength(1)
  })

  it('never leaves two active closures on one date', async () => {
    await signInAs('ADMIN')
    aTransaction({ transaction_date: TODAY, transaction_type: 'credit', amount: 1000 })

    await close({ closure_date: TODAY })
    // A second close without a reopen must be refused.
    expect((await close({ closure_date: TODAY })).status).toBe(409)

    expect(db.rows('daily_ledger_closures').filter((c) => c.status === 'active')).toHaveLength(1)
  })

  it('reports how many later closures were derived from this day', async () => {
    await signInAs('ADMIN')
    aClosure({ closure_date: '2026-03-10' })
    aClosure({ closure_date: '2026-03-11' })
    aClosure({ closure_date: '2026-03-12' })

    const { body } = await reopen({ closure_date: '2026-03-10', reason: A_GOOD_REASON })
    expect(body.data.later_closure_count).toBe(2)
  })

  it('records the reopen in the audit log', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aClosure({ closure_date: TODAY })

    await reopen({ closure_date: TODAY, reason: A_GOOD_REASON })

    const entry = db.find('record_audit_log', (r) => r.entity_type === 'ledger_day')
    expect(entry).toMatchObject({ action: 'reopened', actor_id: 'u-admin' })
    expect(entry!.changes).toMatchObject({ reason: { from: null, to: A_GOOD_REASON } })
  })
})
