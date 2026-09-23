/**
 * Petty cash — the desk's float (PRD v2, CR-02).
 *
 * The client: *"Petty cash is a single shared amount used by all receptionists
 * across shifts… like a bank statement: credit/debit, date, and reason. This log
 * has no status. It is only a log, visible to both admin and receptionists. For
 * each credit, record which receptionist it was given to."*
 */

import { describe, it, expect } from 'vitest'
import { GET as listPettyCash, POST as addPettyCash } from '@/app/api/petty-cash/route'
import { PUT as editPettyCash, DELETE as removePettyCash } from '@/app/api/petty-cash/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aUser } from '../../helpers/seed'
import { TODAY } from '../../setup'

const list = (query = {}) => call(listPettyCash, 'GET', '/api/petty-cash', { query })
const add = (body: unknown) => call(addPettyCash, 'POST', '/api/petty-cash', { body })
const edit = (id: string, body: unknown) =>
  call(editPettyCash, 'PUT', `/api/petty-cash/${id}`, { body, params: { id } })
const remove = (id: string) =>
  call(removePettyCash, 'DELETE', `/api/petty-cash/${id}`, { params: { id } })

const entries = () => db.rows('petty_cash_entries')
const balanceOf = (body: any) => body.totals.balance

describe('petty cash — who may do what', () => {
  it('needs a session', async () => {
    signOut()
    expect((await list()).status).toBe(401)
    expect((await add({ kind: 'expense', amount: 100, reason: 'tea' })).status).toBe(401)
  })

  it('shuts out a lab technician', async () => {
    await signInAs('LAB_TECHNICIAN')
    expect((await list()).status).toBe(403)
  })

  // "visible to both admin and receptionists"
  it.each(['ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR'] as const)('lets %s read the log', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(200)
  })

  it('lets the desk record an expense', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })

    const { status, body } = await add({
      kind: 'expense',
      amount: 450,
      reason: 'Auto fare for the lab samples',
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({
      direction: 'out',
      kind: 'expense',
      amount: 450,
      payment_mode: 'cash',
      entry_date: TODAY,
      created_by: 'u-recep',
    })
  })

  // Q-13: money in is the admin's — they are the ones handing cash over.
  it('refuses a top-up or an opening balance from the desk', async () => {
    await signInAs('RECEPTIONIST')

    const topup = await add({ kind: 'topup', amount: 5000, reason: 'float' })
    const opening = await add({ kind: 'opening', amount: 5000, reason: 'go live' })

    expect(topup.status).toBe(400)
    expect(topup.body.fieldErrors.kind).toMatch(/ask an admin/)
    expect(opening.status).toBe(400)
    expect(entries()).toHaveLength(0)
  })

  it('lets an admin top up, naming who took the cash', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aUser({ id: 'u-priya', username: 'priya', role: 'RECEPTIONIST' })

    const { status, body } = await add({
      kind: 'topup',
      amount: 5000,
      reason: 'Weekly float',
      given_to: 'u-priya',
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({ direction: 'in', kind: 'topup', amount: 5000, given_to: 'u-priya' })
  })
})

describe('petty cash — what the log demands', () => {
  it('always wants a reason (Q-39)', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await add({ kind: 'expense', amount: 100, reason: '   ' })

    expect(status).toBe(400)
    expect(body.fieldErrors.reason).toBeTruthy()
    expect(entries()).toHaveLength(0)
  })

  it('wants a real amount and a known mode', async () => {
    await signInAs('RECEPTIONIST')

    expect((await add({ kind: 'expense', amount: 0, reason: 'x' })).status).toBe(400)
    expect((await add({ kind: 'expense', amount: -5, reason: 'x' })).status).toBe(400)
    expect((await add({ kind: 'expense', amount: 10, reason: 'x', payment_mode: 'crypto' })).status).toBe(400)
  })

  it('takes only one opening balance, ever', async () => {
    await signInAs('ADMIN')

    expect((await add({ kind: 'opening', amount: 2000, reason: 'Go live' })).status).toBe(201)

    const { status, body } = await add({ kind: 'opening', amount: 500, reason: 'Again' })
    expect(status).toBe(409)
    expect(body.code).toBe('OPENING_EXISTS')
  })
})

describe('petty cash — the statement', () => {
  async function aFloat() {
    await signInAs('ADMIN', { userId: 'u-admin' })
    await add({ kind: 'opening', amount: 2000, reason: 'Go live' })
    await add({ kind: 'topup', amount: 5000, reason: 'Weekly float' })

    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    await add({ kind: 'expense', amount: 450, reason: 'Auto fare' })
    await add({ kind: 'expense', amount: 1200, reason: 'Stationery' })
  }

  it('adds up to a balance, and carries a running one down the rows', async () => {
    await aFloat()

    const { body } = await list()

    expect(body.totals).toEqual({ in: 7000, out: 1650, balance: 5350 })
    // Newest first on screen; the running balance counts forward from the start.
    expect(body.data.map((r: any) => r.running_balance)).toEqual([5350, 6550, 7000, 2000])
  })

  // Q-10 = B: the desk sometimes spends ahead of a top-up.
  it('lets the balance go negative rather than lose the entry', async () => {
    await signInAs('RECEPTIONIST')

    const { status } = await add({ kind: 'expense', amount: 900, reason: 'Courier' })

    expect(status).toBe(201)
    expect(balanceOf((await list()).body)).toBe(-900)
  })

  it('filters by date and by kind', async () => {
    await aFloat()

    expect((await list({ kind: 'topup' })).body.data).toHaveLength(1)
    expect((await list({ from: '2020-01-01', to: '2020-12-31' })).body.data).toHaveLength(0)
  })

  it('has no status on any row, and nothing to close', async () => {
    await aFloat()

    const { body } = await list()
    for (const row of body.data) {
      expect(row).not.toHaveProperty('status')
      expect(row).not.toHaveProperty('closed_at')
    }
  })
})

describe('petty cash — correcting an entry (Q-12 = A)', () => {
  async function anExpense(userId = 'u-recep') {
    await signInAs('RECEPTIONIST', { userId })
    const { body } = await add({ kind: 'expense', amount: 450, reason: 'Auto fare' })
    return body
  }

  it('lets the desk fix its own, at any time, with no lock', async () => {
    const entry = await anExpense()

    const { status, body } = await edit(entry.id, {
      amount: 500,
      reason: 'Auto fare (corrected)',
      entry_date: TODAY,
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({ amount: 500, reason: 'Auto fare (corrected)' })
    expect(balanceOf((await list()).body)).toBe(-500)
  })

  it("refuses someone else's entry, and lets an admin fix anything", async () => {
    const entry = await anExpense('u-asha')

    await signInAs('RECEPTIONIST', { userId: 'u-ravi' })
    const refused = await edit(entry.id, { amount: 10, reason: 'nope' })
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('NOT_YOUR_ENTRY')

    await signInAs('ADMIN')
    expect((await edit(entry.id, { amount: 480, reason: 'Auto fare' })).status).toBe(200)
  })

  it('deletes its own, and keeps the deletion in the history (Q-70)', async () => {
    const entry = await anExpense()

    expect((await remove(entry.id)).status).toBe(200)
    expect(entries()).toHaveLength(0)

    const history = db.rows('petty_cash_entry_history')
    expect(history.map((h: any) => h.action)).toEqual(['create', 'delete'])
    expect(history[1].before).toMatchObject({ amount: 450, reason: 'Auto fare' })
  })

  it('keeps every change in the history', async () => {
    const entry = await anExpense()
    await edit(entry.id, { amount: 500, reason: 'Auto fare' })

    const history = db.rows('petty_cash_entry_history')
    expect(history.map((h: any) => h.action)).toEqual(['create', 'update'])
    expect(history[1]).toMatchObject({
      before: { amount: 450 },
      after: { amount: 500 },
      changed_by: 'u-recep',
    })
  })

  it('404s for an entry that is not there', async () => {
    await signInAs('ADMIN')
    expect((await edit('missing', { amount: 1, reason: 'x' })).status).toBe(404)
    expect((await remove('missing')).status).toBe(404)
  })
})
