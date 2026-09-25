/**
 * GET /api/finances/medicine — the patients behind Finances → Expenses →
 * "Medicine" (round 8, 26 Sep; was "Lab & Medicine", AC-15.9).
 *
 * Every medicine charge is the hospital's expense — no question, no "not
 * decided". Lab is no longer here: the in-house lab is income, taken as a
 * payment.
 *
 * The expense is derived from the charges, never stored, so this list and the
 * Overview's "Medicine" figure are the same query. The last test holds them to
 * that.
 */

import { describe, it, expect } from 'vitest'
import { GET as medicine } from '@/app/api/finances/medicine/route'
import { GET as financeSummary } from '@/app/api/finances/summary/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { aCharge, aChargeItem, aPatient } from '../../helpers/seed'
import { THIS_MONTH } from '../../setup'

const list = (query = {}) => call(medicine, 'GET', '/api/finances/medicine', { query })
const summary = (query = {}) => call(financeSummary, 'GET', '/api/finances/summary', { query })

/** Two patients, a month of medicine, and the things that must not count. */
function aMonth() {
  aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
  aPatient({ id: 'p2', patient_id: '13/26', name: 'Sita Devi' })

  aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })
  aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy' })
  aChargeItem({ id: 'room', name: 'Room', category: 'room' })

  // Counted: every medicine charge dated this month — with or without the old
  // status, which no longer means anything.
  aCharge({ id: 'c1', patient_id: 'p1', charge_item_id: 'med', amount: 300, qty: 2, charge_date: '2026-03-05', lab_medicine_status: null })
  aCharge({ id: 'c2', patient_id: 'p2', charge_item_id: 'med', amount: 900, qty: 1, charge_date: '2026-03-20', lab_medicine_status: 'included' })

  // Not counted, each for its own reason.
  aCharge({ id: 'lab', patient_id: 'p1', charge_item_id: 'lab', amount: 5000, qty: 1, charge_date: '2026-03-07', lab_medicine_status: 'included' })
  aCharge({ id: 'room', patient_id: 'p1', charge_item_id: 'room', amount: 8000, qty: 1, charge_date: '2026-03-08' })
  aCharge({ id: 'feb', patient_id: 'p2', charge_item_id: 'med', amount: 4000, qty: 1, charge_date: '2026-02-28' })
  aCharge({ id: 'apr', patient_id: 'p2', charge_item_id: 'med', amount: 4000, qty: 1, charge_date: '2026-04-01' })
}

describe('medicine expense — who may see it', () => {
  it('needs a session', async () => {
    signOut()
    expect((await list()).status).toBe(401)
  })

  // Finances is hidden from reception (Q-05).
  it.each(['RECEPTIONIST', 'NURSE', 'LAB_TECHNICIAN'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(403)
  })

  it.each(['ADMIN', 'DOCTOR'] as const)('lets %s read it, like the rest of Finances', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(200)
  })
})

describe('medicine expense — what the list holds', () => {
  it('lists each medicine charge with the patient ID, name and amount', async () => {
    await signInAs('ADMIN')
    aMonth()

    const { body } = await list({ month: THIS_MONTH })

    expect(body.rows).toHaveLength(2)
    expect(body.rows.find((r: { id: string }) => r.id === 'c1')).toMatchObject({
      patient: { id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' },
      description: 'Medication',
      charge_date: '2026-03-05',
      // amount × qty, as on the bill
      amount: 600,
    })
    expect(body.rows.find((r: { id: string }) => r.id === 'c2')).toMatchObject({
      patient: { patient_id: '13/26', name: 'Sita Devi' },
      amount: 900,
    })
  })

  it('totals the month and counts the charges', async () => {
    await signInAs('ADMIN')
    aMonth()

    const { body } = await list({ month: THIS_MONTH })

    expect(body).toMatchObject({ month: THIS_MONTH, total: 1500, count: 2 })
  })

  /**
   * Lab is income now, whatever its old status said; a room charge is internal;
   * other months are other months. Each is the kind of row that would quietly
   * inflate the figure if the filter slipped.
   */
  it('leaves out lab, other categories and other months', async () => {
    await signInAs('ADMIN')
    aMonth()

    const ids = (await list({ month: THIS_MONTH })).body.rows.map((r: { id: string }) => r.id)

    expect(ids).not.toContain('lab')
    expect(ids).not.toContain('room')
    expect(ids).not.toContain('feb')
    expect(ids).not.toContain('apr')
  })

  it('puts the newest first', async () => {
    await signInAs('ADMIN')
    aMonth()

    const ids = (await list({ month: THIS_MONTH })).body.rows.map((r: { id: string }) => r.id)
    expect(ids).toEqual(['c2', 'c1'])
  })

  it('answers for another month when asked', async () => {
    await signInAs('ADMIN')
    aMonth()

    const { body } = await list({ month: '2026-02' })
    expect(body).toMatchObject({ month: '2026-02', total: 4000, count: 1 })
  })

  it('defaults to the current IST month, and rejects a nonsense one', async () => {
    await signInAs('ADMIN')

    expect((await list()).body.month).toBe(THIS_MONTH)
    expect((await list({ month: 'March' })).status).toBe(400)
  })

  it('says so plainly when there is no medicine', async () => {
    await signInAs('ADMIN')

    expect((await list({ month: THIS_MONTH })).body).toMatchObject({ rows: [], total: 0, count: 0 })
  })
})

describe('medicine expense — agrees with the Overview', () => {
  it('lists exactly what the Overview line adds up to', async () => {
    await signInAs('ADMIN')
    aMonth()

    const drill = (await list({ month: THIS_MONTH })).body
    const overview = (await summary({ month_year: THIS_MONTH })).body.data

    expect(overview.expenses.medicine).toBe(drill.total)
  })
})
