/**
 * GET /api/finances/lab-medicine — the patients behind Finances → Expenses →
 * "Lab & Medicine" (PRD v2 CR-15, AC-15.9).
 *
 * The client, 2026-09-24: *"Mark that amount as Expense; place directly in
 * Expenses in the finances tab, nothing in the ledger; create a different
 * expense type; make it clickable and show patient id and name with the amount
 * for the selected month."*
 *
 * The expense is derived from the charges, never stored, so this list and the
 * Overview's "Lab & Medicine" figure are the same query. The last test holds
 * them to that.
 */

import { describe, it, expect } from 'vitest'
import { GET as labMedicine } from '@/app/api/finances/lab-medicine/route'
import { GET as financeSummary } from '@/app/api/finances/summary/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { aCharge, aChargeItem, aPatient } from '../../helpers/seed'
import { THIS_MONTH } from '../../setup'

const list = (query = {}) => call(labMedicine, 'GET', '/api/finances/lab-medicine', { query })
const summary = (query = {}) => call(financeSummary, 'GET', '/api/finances/summary', { query })

/** Two patients, a month of lab and medicine, and the things that must not count. */
function aMonth() {
  aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
  aPatient({ id: 'p2', patient_id: '13/26', name: 'Sita Devi' })

  aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })
  aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy' })
  aChargeItem({ id: 'room', name: 'Room', category: 'room' })

  // Counted: included, lab or pharmacy, dated this month.
  aCharge({ id: 'c1', patient_id: 'p1', charge_item_id: 'lab', amount: 300, qty: 2, charge_date: '2026-03-05', lab_medicine_status: 'included' })
  aCharge({ id: 'c2', patient_id: 'p2', charge_item_id: 'med', amount: 900, qty: 1, charge_date: '2026-03-20', lab_medicine_status: 'included' })

  // Not counted, each for its own reason.
  aCharge({ id: 'undecided', patient_id: 'p1', charge_item_id: 'med', amount: 5000, qty: 1, charge_date: '2026-03-07', lab_medicine_status: null })
  aCharge({ id: 'room', patient_id: 'p1', charge_item_id: 'room', amount: 8000, qty: 1, charge_date: '2026-03-08', lab_medicine_status: 'included' })
  aCharge({ id: 'feb', patient_id: 'p2', charge_item_id: 'lab', amount: 4000, qty: 1, charge_date: '2026-02-28', lab_medicine_status: 'included' })
  aCharge({ id: 'apr', patient_id: 'p2', charge_item_id: 'lab', amount: 4000, qty: 1, charge_date: '2026-04-01', lab_medicine_status: 'included' })
}

describe('lab & medicine expense — who may see it', () => {
  it('needs a session', async () => {
    signOut()
    expect((await list()).status).toBe(401)
  })

  // Finances is hidden from reception (Q-05). Reception decides these charges
  // from the patient's Overview and Charges tab instead.
  it.each(['RECEPTIONIST', 'NURSE', 'LAB_TECHNICIAN'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(403)
  })

  it.each(['ADMIN', 'DOCTOR'] as const)('lets %s read it, like the rest of Finances', async (role) => {
    await signInAs(role)
    expect((await list()).status).toBe(200)
  })
})

describe('lab & medicine expense — what the list holds', () => {
  it('lists each included charge with the patient ID, name and amount', async () => {
    await signInAs('ADMIN')
    aMonth()

    const { body } = await list({ month: THIS_MONTH })

    expect(body.rows).toHaveLength(2)
    expect(body.rows.find((r: { id: string }) => r.id === 'c1')).toMatchObject({
      patient: { id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' },
      description: 'Lab Test',
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
   * Undecided is nobody's expense until someone says so; a room charge is
   * internal whatever its status; other months are other months. Each is the
   * kind of row that would quietly inflate the figure if the filter slipped.
   */
  it('leaves out undecided charges, other categories and other months', async () => {
    await signInAs('ADMIN')
    aMonth()

    const ids = (await list({ month: THIS_MONTH })).body.rows.map((r: { id: string }) => r.id)

    expect(ids).not.toContain('undecided')
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

  it('says so plainly when nothing is included', async () => {
    await signInAs('ADMIN')

    expect((await list({ month: THIS_MONTH })).body).toMatchObject({ rows: [], total: 0, count: 0 })
  })
})

describe('lab & medicine expense — agrees with the Overview', () => {
  it('lists exactly what the Overview line adds up to', async () => {
    await signInAs('ADMIN')
    aMonth()

    const drill = (await list({ month: THIS_MONTH })).body
    const overview = (await summary({ month_year: THIS_MONTH })).body.data

    expect(overview.expenses.lab_medicine).toBe(drill.total)
  })
})
