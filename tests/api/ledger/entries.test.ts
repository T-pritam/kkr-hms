/**
 * The ledger log, and closing entries (PRD v2, CR-05 and CR-06).
 *
 * The two requirements these cover, in the client's words:
 *   *"It should show all entries, so others don't have to guess whether a
 *   payment was received."*
 *   *"Remove the per-user, per-day day close… select rows in bulk and mark them
 *   closed… add a separate tab showing rows that are not yet marked closed."*
 */

import { describe, it, expect } from 'vitest'
import { GET as listEntries } from '@/app/api/ledger/entries/route'
import { POST as closeEntries } from '@/app/api/ledger/close/route'
import { POST as reopenEntries } from '@/app/api/ledger/reopen/route'
import { GET as listLedgerUsers } from '@/app/api/ledger/users/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aTransaction, aPatient, aUser, anInstallment } from '../../helpers/seed'
import { NOW, TODAY } from '../../setup'

const list = (query = {}) => call(listEntries, 'GET', '/api/ledger/entries', { query })
const close = (body: unknown) => call(closeEntries, 'POST', '/api/ledger/close', { body })
const reopen = (body: unknown) => call(reopenEntries, 'POST', '/api/ledger/reopen', { body })

const row = (id: string) => db.find('daily_ledger_transactions', (r) => r.id === id)!

/** A day's worth of entries from three different people. */
function aBusyDay() {
  aUser({ id: 'u-asha', username: 'asha', role: 'RECEPTIONIST' })
  aUser({ id: 'u-ravi', username: 'ravi', role: 'RECEPTIONIST' })
  aUser({ id: 'u-admin', username: 'admin', role: 'ADMIN' })

  aTransaction({ id: 't1', created_by: 'u-asha', amount: 5000, payment_mode: 'cash', source: 'opd' })
  aTransaction({ id: 't2', created_by: 'u-ravi', amount: 3000, payment_mode: 'upi', source: 'opd' })
  aTransaction({
    id: 't3', created_by: 'u-admin', amount: 2000, payment_mode: 'cash',
    transaction_type: 'debit', source: 'expense', expense_category: 'supplies',
  })
  aTransaction({
    id: 't4', created_by: 'u-admin', amount: 1000, payment_mode: 'cash', source: 'opd',
    status: 'closed', closed_at: NOW.toISOString(), closed_by: 'u-admin',
  })
}

describe('the ledger log — who sees what', () => {
  it('needs a session', async () => {
    signOut()
    expect((await list()).status).toBe(401)
  })

  it('shuts out a lab technician', async () => {
    await signInAs('LAB_TECHNICIAN')
    expect((await list()).status).toBe(403)
  })

  // The requirement itself: no more "only my own rows".
  it.each(['RECEPTIONIST', 'NURSE', 'DOCTOR', 'ADMIN'] as const)(
    'shows %s every entry, whoever added it',
    async (role) => {
      await signInAs(role, { userId: 'u-asha' })
      aBusyDay()

      const { status, body } = await list()

      expect(status).toBe(200)
      expect(body.data.map((r: any) => r.id).sort()).toEqual(['t1', 't2', 't3', 't4'])
    },
  )

  it('lets a receptionist edit only their own open rows', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-asha' })
    aBusyDay()

    const { body } = await list()
    const byId = Object.fromEntries(body.data.map((r: any) => [r.id, r]))

    expect(byId.t1.can_edit).toBe(true) // theirs, open
    expect(byId.t2.can_edit).toBe(false) // someone else's
    expect(byId.t3.can_edit).toBe(false) // the admin's
  })

  it('lets an admin edit any open row, but not a closed one', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    const { body } = await list()
    const byId = Object.fromEntries(body.data.map((r: any) => [r.id, r]))

    expect(byId.t1.can_edit).toBe(true)
    expect(byId.t4.can_edit).toBe(false) // closed: reopen it first
    expect(byId.t4.can_close).toBe(false)
    expect(byId.t1.can_close).toBe(true)
  })

  it('points a payment row at the patient instead of offering an edit', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })
    aTransaction({ id: 't1', source: 'patient', patient_id: 'p1' })
    aTransaction({ id: 't2', source: 'opd' })
    anInstallment({ id: 'i1', ledger_transaction_id: 't1' })

    const { body } = await list()
    const byId = Object.fromEntries(body.data.map((r: any) => [r.id, r]))

    expect(byId.t1.payment_installment_id).toBe('i1')
    expect(byId.t1.can_edit).toBe(false)
    expect(byId.t2.payment_installment_id).toBeNull()
  })
})

describe('the ledger log — filters and totals', () => {
  it('totals money in, money out, net and cash, over the whole filter', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    const { body } = await list()

    expect(body.totals).toEqual({
      in: 9000, // 5000 + 3000 + 1000
      out: 2000,
      net: 7000,
      cash_in: 6000, // 5000 + 1000; the 3000 was UPI
      cash_out: 2000,
      count: 4,
    })
  })

  it('filters by date range, direction, mode, type and who added it', async () => {
    await signInAs('ADMIN')
    aBusyDay()
    aTransaction({ id: 'old', transaction_date: '2026-01-05', amount: 700 })

    expect((await list({ from: TODAY, to: TODAY })).body.data).toHaveLength(4)
    expect((await list({ from: '2026-01-01', to: '2026-01-31' })).body.data.map((r: any) => r.id)).toEqual(['old'])
    expect((await list({ direction: 'debit' })).body.data.map((r: any) => r.id)).toEqual(['t3'])
    expect((await list({ mode: 'upi' })).body.data.map((r: any) => r.id)).toEqual(['t2'])
    expect((await list({ source: 'expense' })).body.data.map((r: any) => r.id)).toEqual(['t3'])
    expect((await list({ added_by: 'u-asha' })).body.data.map((r: any) => r.id)).toEqual(['t1'])
  })

  it('has a Not closed view: every open row, whoever added it, whatever the date', async () => {
    await signInAs('ADMIN')
    aBusyDay()
    aTransaction({ id: 'older-open', transaction_date: '2026-03-01', amount: 400 })

    const { body } = await list({ status: 'open', from: '2026-01-01', to: TODAY })

    expect(body.data.map((r: any) => r.id).sort()).toEqual(['older-open', 't1', 't2', 't3'])
    expect(body.totals.count).toBe(4)
  })

  it('pages 50 at a time, newest first', async () => {
    await signInAs('ADMIN')
    for (let i = 0; i < 60; i += 1) {
      aTransaction({ id: `t${i}`, amount: 100 + i })
    }

    const first = await list({ page: 1 })
    const second = await list({ page: 2 })

    expect(first.body.data).toHaveLength(50)
    expect(second.body.data).toHaveLength(10)
    expect(first.body.page_size).toBe(50)
    expect(first.body.totals.count).toBe(60)
  })
})

describe('closing entries', () => {
  it('refuses anyone but an admin, and says so', async () => {
    await signInAs('RECEPTIONIST')
    aBusyDay()

    expect((await close({ ids: ['t1'] })).status).toBe(403)
    expect((await reopen({ ids: ['t4'], reason: 'x' })).status).toBe(403)
    expect(row('t1').status).toBe('open')
  })

  // AC-06.2, and the shape of requirement 6: any rows, any dates, any users.
  it('closes a hand-picked set in one batch, with the note and the amount counted', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBusyDay()
    aTransaction({ id: 'other-day', transaction_date: '2026-03-01' })

    const { status, body } = await close({
      ids: ['t1', 't2', 'other-day'],
      note: 'evening count',
      amount_received: 8000,
    })

    expect(status).toBe(200)
    expect(body.closed).toBe(3)

    for (const id of ['t1', 't2', 'other-day']) {
      expect(row(id)).toMatchObject({ status: 'closed', closed_by: 'u-admin' })
      expect(row(id).closed_at).toBeTruthy()
      expect(row(id).close_batch_id).toBe(body.batch.id)
    }
    expect(db.rows('ledger_close_batches')[0]).toMatchObject({
      note: 'evening count',
      amount_received: 8000,
      row_count: 3,
      closed_by: 'u-admin',
    })
    // Untouched, because it wasn't ticked.
    expect(row('t3').status).toBe('open')
  })

  it('skips rows that are already closed rather than failing the batch', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    const { status, body } = await close({ ids: ['t1', 't4'] })

    expect(status).toBe(200)
    expect(body.closed).toBe(1)
    expect(body.skipped).toBe(1)
  })

  it('refuses an empty selection, and a set that is entirely closed', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    expect((await close({ ids: [] })).status).toBe(400)
    expect((await close({ ids: ['t4'] })).status).toBe(409)
  })

  it('rejects a nonsense amount received', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    expect((await close({ ids: ['t1'], amount_received: 'lots' })).status).toBe(400)
    expect(row('t1').status).toBe('open')
  })

  it('closes nothing if the batch cannot be written', async () => {
    await signInAs('ADMIN')
    aBusyDay()
    db.failNext('ledger_close_batches')

    const { status } = await close({ ids: ['t1', 't2'] })

    expect(status).toBe(500)
    expect(row('t1').status).toBe('open')
    expect(row('t2').status).toBe('open')
  })

  it('reports a failed read as a 500 and closes nothing', async () => {
    await signInAs('ADMIN')
    aBusyDay()
    db.failNext('daily_ledger_transactions')

    expect((await close({ ids: ['t1'] })).status).toBe(500)
    expect(db.count('ledger_close_batches')).toBe(0)
    expect(row('t1').status).toBe('open')
  })
})

describe('reopening entries', () => {
  it('needs a reason, and keeps it on the row', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBusyDay()

    expect((await reopen({ ids: ['t4'] })).status).toBe(400)
    expect((await reopen({ ids: ['t4'], reason: '   ' })).status).toBe(400)

    const { status, body } = await reopen({ ids: ['t4'], reason: 'wrong amount on a receipt' })

    expect(status).toBe(200)
    expect(body.reopened).toBe(1)
    expect(row('t4')).toMatchObject({
      status: 'open',
      closed_at: null,
      closed_by: null,
      close_batch_id: null,
      reopened_by: 'u-admin',
      reopen_reason: 'wrong amount on a receipt',
    })
  })

  it('refuses a set that is already open', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    expect((await reopen({ ids: ['t1'], reason: 'why not' })).status).toBe(409)
  })

  it('makes the row editable again', async () => {
    await signInAs('ADMIN')
    aBusyDay()

    expect((await list()).body.data.find((r: any) => r.id === 't4').can_edit).toBe(false)
    await reopen({ ids: ['t4'], reason: 'correcting it' })
    expect((await list()).body.data.find((r: any) => r.id === 't4').can_edit).toBe(true)
  })
})

/**
 * The names behind the "Added by" filter (Q-22). Reception may filter by who
 * added a row, but cannot see the user register (§3.2) — so this lists only
 * people who actually appear in the ledger, and only their name.
 */
describe('the ledger log — the "Added by" list', () => {
  const ledgerUsers = () => call(listLedgerUsers, 'GET', '/api/ledger/users')

  it('needs a session, and shuts out a lab technician', async () => {
    signOut()
    expect((await ledgerUsers()).status).toBe(401)

    await signInAs('LAB_TECHNICIAN')
    expect((await ledgerUsers()).status).toBe(403)
  })

  it('names everyone who has added a row, once each, by name', async () => {
    await signInAs('RECEPTIONIST')
    aBusyDay()

    const { status, body } = await ledgerUsers()

    expect(status).toBe(200)
    expect(body.data).toEqual([
      { id: 'u-admin', username: 'admin' },
      { id: 'u-asha', username: 'asha' },
      { id: 'u-ravi', username: 'ravi' },
    ])
  })

  it('leaves out a user who has never added a row', async () => {
    await signInAs('RECEPTIONIST')
    aBusyDay()
    aUser({ id: 'u-quiet', username: 'quiet', role: 'RECEPTIONIST' })

    const ids = (await ledgerUsers()).body.data.map((u: { id: string }) => u.id)
    expect(ids).not.toContain('u-quiet')
  })

  it('returns a name and nothing else — no e-mail, no role', async () => {
    await signInAs('RECEPTIONIST')
    aBusyDay()

    const [first] = (await ledgerUsers()).body.data
    expect(Object.keys(first).sort()).toEqual(['id', 'username'])
  })
})
