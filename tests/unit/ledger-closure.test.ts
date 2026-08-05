/**
 * lib/ledger/closure — the single answer to "is this ledger date closed?".
 *
 * The question used to be answered four different ways, and all four asked the
 * wrong table: they looked for a transaction row carrying status = 'day_closed'
 * rather than for a closure record. Since settling one operator's shift set that
 * status, a receptionist going home locked the date for every colleague.
 *
 * The property that matters most here is the one the old code could not express:
 * a superseded closure is history, so a reopened date is open.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  LEDGER_DAY_CLOSED,
  assertLedgerDateOpen,
  getActiveClosure,
  getActiveClosures,
  isLedgerDateClosed,
  ledgerDateClosedMessage,
} from '@/lib/ledger/closure'
import { createFakeClient, db } from '../helpers/fake-supabase'
import { aClosure, aTransaction, aUser } from '../helpers/seed'

const supabase = createFakeClient(db)

beforeEach(() => {
  db.reset()
})

describe('getActiveClosure', () => {
  it('returns the active closure for the date', async () => {
    aClosure({ closure_date: '2026-03-10', version: 2 })

    const closure = await getActiveClosure(supabase, '2026-03-10')
    expect(closure).toMatchObject({ closure_date: '2026-03-10', version: 2 })
  })

  it('returns null when the date was never closed', async () => {
    expect(await getActiveClosure(supabase, '2026-03-10')).toBeNull()
  })

  it('ignores a superseded closure — a reopened day is open', async () => {
    aClosure({
      closure_date: '2026-03-10',
      status: 'superseded',
      reopened_at: '2026-03-11T10:00:00.000Z',
      reopen_reason: 'missed a UPI receipt',
    })

    expect(await getActiveClosure(supabase, '2026-03-10')).toBeNull()
  })

  it('finds the active closure alongside its superseded history', async () => {
    aClosure({
      closure_date: '2026-03-10',
      version: 1,
      status: 'superseded',
      reopened_at: '2026-03-11T10:00:00.000Z',
      reopen_reason: 'missed a UPI receipt',
    })
    aClosure({ closure_date: '2026-03-10', version: 2 })

    expect((await getActiveClosure(supabase, '2026-03-10'))!.version).toBe(2)
  })

  it('never reads a transaction status', async () => {
    // This is the whole point: settling a shift no longer implies a closed date.
    aTransaction({ transaction_date: '2026-03-10', status: 'verified' })

    expect(await getActiveClosure(supabase, '2026-03-10')).toBeNull()
  })
})

describe('getActiveClosures', () => {
  it('maps the active closures in a range by date', async () => {
    aClosure({ closure_date: '2026-03-09' })
    aClosure({ closure_date: '2026-03-10' })
    aClosure({ closure_date: '2026-03-12' })

    const byDate = await getActiveClosures(supabase, '2026-03-10', '2026-03-12')

    expect([...byDate.keys()].sort()).toEqual(['2026-03-10', '2026-03-12'])
  })

  it('excludes superseded closures from the range', async () => {
    aClosure({
      closure_date: '2026-03-10',
      status: 'superseded',
      reopened_at: '2026-03-11T10:00:00.000Z',
      reopen_reason: 'missed a UPI receipt',
    })

    expect((await getActiveClosures(supabase, '2026-03-01', '2026-03-31')).size).toBe(0)
  })

  it('returns an empty map when nothing is closed', async () => {
    expect((await getActiveClosures(supabase, '2026-03-01', '2026-03-31')).size).toBe(0)
  })
})

describe('isLedgerDateClosed', () => {
  it('is true only for an active closure', async () => {
    aClosure({ closure_date: '2026-03-10' })

    expect(await isLedgerDateClosed(supabase, '2026-03-10')).toBe(true)
    expect(await isLedgerDateClosed(supabase, '2026-03-11')).toBe(false)
  })
})

describe('assertLedgerDateOpen', () => {
  it('returns null when the date is open, so the write proceeds', async () => {
    expect(await assertLedgerDateOpen(supabase, '2026-03-10', 'create')).toBeNull()
  })

  it('returns a 409 carrying the closure and a machine-readable code', async () => {
    aUser({ id: 'u-admin', username: 'anita' })
    aClosure({ closure_date: '2026-03-10', version: 2, closed_by: 'u-admin' })

    const response = await assertLedgerDateOpen(supabase, '2026-03-10', 'create')

    expect(response).not.toBeNull()
    // 409, not 400: the request is well-formed, it conflicts with the period's state.
    expect(response!.status).toBe(409)

    const body = await response!.json()
    expect(body.code).toBe(LEDGER_DAY_CLOSED)
    expect(body.closure).toMatchObject({
      closure_date: '2026-03-10',
      version: 2,
      closed_by_name: 'anita',
    })
  })
})

describe('ledgerDateClosedMessage', () => {
  it('names the date and points at the way out', () => {
    const message = ledgerDateClosedMessage('2026-03-10', 'create')

    expect(message).toContain('2026-03-10')
    expect(message).toContain('reopen')
  })

  it('reads naturally for every action', () => {
    expect(ledgerDateClosedMessage('2026-03-10', 'update')).toContain('update an entry on')
    expect(ledgerDateClosedMessage('2026-03-10', 'delete')).toContain('delete an entry on')
    expect(ledgerDateClosedMessage('2026-03-10', 'verify')).toContain('verify an entry on')
    expect(ledgerDateClosedMessage('2026-03-10', 'settle')).toContain('post a settlement to')
  })
})
