/**
 * /api/patients/[id]/charges — itemised patient charges.
 */

import { describe, it, expect } from 'vitest'
import { GET as listCharges, POST as createCharge } from '@/app/api/patients/[id]/charges/route'
import { PATCH as editCharge, DELETE as removeCharge } from '@/app/api/patients/[id]/charges/[chargeId]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aCharge, aChargeItem, aUser } from '../../helpers/seed'
import { TODAY } from '../../setup'

const list = (patientId: string, query = {}) =>
  call(listCharges, 'GET', `/api/patients/${patientId}/charges`, { params: { id: patientId }, query })

const create = (patientId: string, body: unknown) =>
  call(createCharge, 'POST', `/api/patients/${patientId}/charges`, { body, params: { id: patientId } })

const edit = (patientId: string, chargeId: string, body: unknown) =>
  call(editCharge, 'PATCH', `/api/patients/${patientId}/charges/${chargeId}`, {
    body,
    params: { id: patientId, chargeId },
  })

const remove = (patientId: string, chargeId: string) =>
  call(removeCharge, 'DELETE', `/api/patients/${patientId}/charges/${chargeId}`, {
    params: { id: patientId, chargeId },
  })

describe('charges — authentication', () => {
  it('rejects unauthenticated access to every verb', async () => {
    signOut()

    expect((await list('p1')).status).toBe(401)
    expect((await create('p1', {})).status).toBe(401)
    expect((await edit('p1', 'c1', {})).status).toBe(401)
    expect((await remove('p1', 'c1')).status).toBe(401)
  })
})

describe('GET /api/patients/[id]/charges', () => {
  it('returns the patient’s charges newest first', async () => {
    await signInAs('NURSE')
    aCharge({ id: 'c1', patient_id: 'p1', charge_date: '2026-03-01' })
    aCharge({ id: 'c2', patient_id: 'p1', charge_date: '2026-03-10' })

    const { status, body } = await list('p1')

    expect(status).toBe(200)
    expect(body.map((c: any) => c.id)).toEqual(['c2', 'c1'])
  })

  it('does not leak another patient’s charges', async () => {
    await signInAs('NURSE')
    aCharge({ id: 'c1', patient_id: 'p1' })
    aCharge({ id: 'c2', patient_id: 'p2' })

    expect((await list('p1')).body.map((c: any) => c.id)).toEqual(['c1'])
  })

  it('filters to a single billing cycle when billing_id is given', async () => {
    await signInAs('NURSE')
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1' })
    aCharge({ id: 'c2', patient_id: 'p1', patient_billing_id: 'b2' })

    expect((await list('p1', { billing_id: 'b1' })).body.map((c: any) => c.id)).toEqual(['c1'])
  })

  it('embeds the creating user', async () => {
    await signInAs('NURSE')
    aUser({ id: 'u1', username: 'nurse1' })
    aCharge({ id: 'c1', patient_id: 'p1', created_by: 'u1' })

    expect((await list('p1')).body[0].users).toEqual({ id: 'u1', username: 'nurse1' })
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('NURSE')
    db.failNext('patient_charges')

    expect((await list('p1')).status).toBe(500)
  })
})

describe('POST /api/patients/[id]/charges', () => {
  it('creates a charge against the patient and billing cycle', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await create('p1', {
      patient_billing_id: 'b1',
      charge_type: 'X-Ray',
      description: 'Chest X-Ray',
      amount: 800,
      charge_date: '2026-03-12',
    })

    // 201 rather than the 200 this route used to return, matching /api/doctors
    // and the rest of the routes written since.
    expect(status).toBe(201)
    expect(body.charge.id).toEqual(expect.any(String))

    expect(db.rows('patient_charges')[0]).toMatchObject({
      patient_id: 'p1',
      patient_billing_id: 'b1',
      charge_type: 'X-Ray',
      description: 'Chest X-Ray',
      amount: 800,
      charge_date: '2026-03-12',
      created_by: 'u-nurse',
    })
  })

  it('defaults the charge date to today', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: 100 })

    expect(db.rows('patient_charges')[0].charge_date).toBe(TODAY)
  })

  it('returns 500 when the insert fails', async () => {
    await signInAs('NURSE')
    // A real billing row, because the ownership check now runs before the insert
    // and would otherwise 404 before the seeded failure could be reached.
    aBilling({ id: 'b1', patient_id: 'p1' })
    db.failNext('patient_charges')

    expect(
      (await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: 100 }))
        .status,
    ).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #17. The charges form collects a mandatory quantity and
   * the totals multiply by it, but the route never persists `qty`, so the column keeps
   * its default of 1 and a three-unit charge is billed as one.
   */
  it('persists the quantity it was given', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: 500, qty: 3 })

    expect(db.rows('patient_charges')[0].qty).toBe(3)
  })

  /** BUGS.md #18, resolved — lib/billing/validate.ts. */
  it('rejects a charge with no amount', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await create('p1', {
      patient_billing_id: 'b1',
      charge_type: 'Procedure',
    })

    expect(status).toBe(400)
    expect(body.fieldErrors.amount).toEqual(expect.any(String))
  })

  it('rejects a negative amount, which would otherwise reduce the bill', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_type: 'Procedure',
      amount: -5000,
    })

    expect(status).toBe(400)
  })

  it('rejects a charge with no name and no catalogue entry', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 100 })

    expect(status).toBe(400)
  })

  it('rejects a quantity below one', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_type: 'Procedure',
      amount: 100,
      qty: 0,
    })

    expect(status).toBe(400)
  })

  /** BUGS.md #24, resolved — the billing row must belong to the patient in the URL. */
  it('rejects a billing id belonging to a different patient', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b-other', patient_id: 'p2' })

    const { status } = await create('p1', {
      patient_billing_id: 'b-other',
      charge_type: 'Procedure',
      amount: 100,
    })

    expect(status).toBe(404)
    expect(db.count('patient_charges')).toBe(0)
  })

  it('requires a billing record at all', async () => {
    await signInAs('NURSE')

    expect((await create('p1', { charge_type: 'Procedure', amount: 100 })).status).toBe(400)
  })

  /** A lab technician has no business putting money on a bill. */
  it('refuses a role that is not permitted to bill', async () => {
    await signInAs('LAB_TECHNICIAN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_type: 'Procedure',
      amount: 100,
    })

    expect(status).toBe(403)
  })
})

/**
 * The reason `billing_mode` exists. A per-day service is entered once as a range
 * and stored as one row per day, so a single day can be repriced or removed
 * without unpicking the rest of the stay.
 */
describe('POST /api/patients/[id]/charges — per-day charges', () => {
  const perDayItem = () =>
    aChargeItem({ name: 'ICU Bed', billing_mode: 'per_day', category: 'room', default_price: 5000 })

  it('expands a date range into one row per day, inclusive of both ends', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })
    const item = perDayItem()

    const { status, body } = await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      amount: 5000,
      qty: 1,
      from_date: '2026-08-01',
      to_date: '2026-08-04',
    })

    expect(status).toBe(201)
    expect(body.charges).toHaveLength(4)

    const rows = db.rows('patient_charges')
    expect(rows.map((r) => r.charge_date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ])
    // Every row carries the snapshotted name, not just the catalogue id.
    expect(rows.every((r) => r.charge_type === 'ICU Bed')).toBe(true)
  })

  it('gives the whole block one group id so it can be shown and removed as a unit', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })
    const item = perDayItem()

    await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      amount: 5000,
      from_date: '2026-08-01',
      to_date: '2026-08-03',
    })

    const groups = new Set(db.rows('patient_charges').map((r) => r.charge_group_id))
    expect(groups.size).toBe(1)
    expect([...groups][0]).toEqual(expect.any(String))
  })

  it('bills a single day when the range is one day long', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })
    const item = perDayItem()

    await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      amount: 5000,
      from_date: '2026-08-01',
      to_date: '2026-08-01',
    })

    expect(db.count('patient_charges')).toBe(1)
  })

  it('multiplies the daily total by qty per day', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1', base_charge: 0 })
    const item = perDayItem()

    await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      amount: 5000,
      qty_per_day: 2,
      from_date: '2026-08-01',
      to_date: '2026-08-02',
    })

    // 2 days x 2 units x 5000
    expect(
      Number(db.find('patient_billing', (r) => r.id === 'b1')!.patient_charges_total),
    ).toBe(20000)
  })

  it('refuses a range that ends before it starts', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })
    const item = perDayItem()

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      amount: 5000,
      from_date: '2026-08-10',
      to_date: '2026-08-01',
    })

    expect(status).toBe(400)
    expect(db.count('patient_charges')).toBe(0)
  })

  /** A mistyped year would otherwise insert tens of thousands of rows. */
  it('refuses a range longer than the cap rather than truncating it', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })
    const item = perDayItem()

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      amount: 5000,
      from_date: '2026-08-01',
      to_date: '2062-08-01',
    })

    expect(status).toBe(400)
    expect(db.count('patient_charges')).toBe(0)
  })

  /**
   * The catalogue decides how a service is billed, not the request — otherwise a
   * caller could bill a whole stay as one row by claiming it was one_time.
   */
  it('takes the billing mode from the catalogue, not the request body', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })
    const item = perDayItem()

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: item.id,
      billing_mode: 'one_time',
      amount: 5000,
      charge_date: '2026-08-01',
    })

    // Rejected for the missing range, because the catalogue says per_day.
    expect(status).toBe(400)
  })

  it('rejects a catalogue id that does not exist', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_item_id: 'nope',
      amount: 100,
    })

    expect(status).toBe(400)
  })

  it('still accepts an ad-hoc charge that is not in the catalogue', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      charge_type: 'Something unusual',
      amount: 250,
    })

    expect(status).toBe(201)
    expect(db.rows('patient_charges')[0]).toMatchObject({
      charge_type: 'Something unusual',
      charge_item_id: null,
      billing_mode: 'one_time',
    })
  })
})

describe('PATCH /api/patients/[id]/charges/[chargeId]', () => {
  it('returns 404 for an unknown charge', async () => {
    await signInAs('ADMIN')

    const { status, body } = await edit('p1', 'missing', { amount: 100 })
    expect(status).toBe(404)
    expect(body.error).toBe('Charge not found')
  })

  it('lets the creator edit their own charge', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aCharge({ id: 'c1', patient_id: 'p1', created_by: 'u-nurse', amount: 100 })

    const { status } = await edit('p1', 'c1', { charge_type: 'Procedure', description: 'x', amount: 250, charge_date: TODAY })

    expect(status).toBe(200)
    expect(db.find('patient_charges', (r) => r.id === 'c1')!.amount).toBe(250)
  })

  it('lets an admin edit someone else’s charge', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1', created_by: 'someone-else', amount: 100 })

    expect((await edit('p1', 'c1', { amount: 250 })).status).toBe(200)
  })

  it('refuses when the caller is neither creator nor admin', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aCharge({ id: 'c1', patient_id: 'p1', created_by: 'someone-else', amount: 100 })

    const { status, body } = await edit('p1', 'c1', { amount: 999999 })

    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(db.find('patient_charges', (r) => r.id === 'c1')!.amount).toBe(100)
  })

  it('stamps updated_by', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aCharge({ id: 'c1', patient_id: 'p1' })

    await edit('p1', 'c1', { amount: 250 })
    expect(db.find('patient_charges', (r) => r.id === 'c1')!.updated_by).toBe('u-admin')
  })

  /**
   * This used to assert the opposite, because the old route wrote every column
   * unconditionally: `charge_type: body.charge_type` on a body that omitted it
   * stored `undefined` and wiped the field. Editing only the amount silently
   * erased the description and the charge type with it.
   *
   * Omitted now means unchanged, matching consultations/[consultationId].
   */
  it('leaves the fields the caller omits alone', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1', description: 'Original', charge_type: 'X-Ray' })

    await edit('p1', 'c1', { amount: 250 })

    expect(db.find('patient_charges', (r) => r.id === 'c1')).toMatchObject({
      amount: 250,
      description: 'Original',
      charge_type: 'X-Ray',
    })
  })

  it('persists an edited quantity', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1', qty: 1 })

    await edit('p1', 'c1', { qty: 3 })

    expect(db.find('patient_charges', (r) => r.id === 'c1')!.qty).toBe(3)
  })

  it('rejects an edit that would make the charge free or negative', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1', amount: 100 })

    expect((await edit('p1', 'c1', { amount: 0 })).status).toBe(400)
    expect((await edit('p1', 'c1', { amount: -50 })).status).toBe(400)
    expect((await edit('p1', 'c1', { qty: 0 })).status).toBe(400)
    expect(db.find('patient_charges', (r) => r.id === 'c1')!.amount).toBe(100)
  })

  it('can clear the description without clearing anything else', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1', description: 'Original', charge_type: 'X-Ray' })

    await edit('p1', 'c1', { description: '' })

    expect(db.find('patient_charges', (r) => r.id === 'c1')).toMatchObject({
      description: null,
      charge_type: 'X-Ray',
    })
  })
})

/** Cancelling a mistyped admission should not mean one request per night. */
describe('DELETE — removing a whole date-range block', () => {
  const seedBlock = () => {
    aBilling({ id: 'b1', patient_id: 'p1', base_charge: 0 })
    for (const day of ['2026-08-01', '2026-08-02', '2026-08-03']) {
      aCharge({
        id: `c-${day}`,
        patient_id: 'p1',
        patient_billing_id: 'b1',
        charge_group_id: 'grp-1',
        charge_date: day,
        amount: 5000,
        qty: 1,
      })
    }
  }

  it('removes every row sharing the group when asked', async () => {
    await signInAs('ADMIN')
    seedBlock()

    const { status, body } = await call(
      removeCharge,
      'DELETE',
      '/api/patients/p1/charges/c-2026-08-01',
      { params: { id: 'p1', chargeId: 'c-2026-08-01' }, query: { group: 'true' } },
    )

    expect(status).toBe(200)
    expect(body.removed).toBe(3)
    expect(db.count('patient_charges')).toBe(0)
    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.patient_charges_total)).toBe(0)
  })

  it('removes only the one day when not asked', async () => {
    await signInAs('ADMIN')
    seedBlock()

    await remove('p1', 'c-2026-08-01')

    expect(db.count('patient_charges')).toBe(2)
  })

  it('does not reach into another patient through a tampered group id', async () => {
    await signInAs('ADMIN')
    seedBlock()
    // Same group id, different patient — the scoping is what keeps it safe.
    aCharge({ id: 'c-other', patient_id: 'p2', charge_group_id: 'grp-1' })

    await call(removeCharge, 'DELETE', '/api/patients/p1/charges/c-2026-08-01', {
      params: { id: 'p1', chargeId: 'c-2026-08-01' },
      query: { group: 'true' },
    })

    expect(db.find('patient_charges', (r) => r.id === 'c-other')).toBeTruthy()
  })
})

describe('DELETE /api/patients/[id]/charges/[chargeId]', () => {
  it('returns 404 for an unknown charge', async () => {
    await signInAs('ADMIN')

    const { status, body } = await remove('p1', 'missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Charge not found')
  })

  it('hard-deletes the charge', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1' })

    const { status, body } = await remove('p1', 'c1')

    expect(status).toBe(200)
    expect(body.message).toBe('Charge deleted successfully')
    expect(db.count('patient_charges')).toBe(0)
  })

  it('refuses when the caller is neither creator nor admin', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aCharge({ id: 'c1', patient_id: 'p1', created_by: 'someone-else' })

    const { status } = await remove('p1', 'c1')

    expect(status).toBe(403)
    expect(db.count('patient_charges')).toBe(1)
  })

  it('lets the creator delete their own charge', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aCharge({ id: 'c1', patient_id: 'p1', created_by: 'u-nurse' })

    expect((await remove('p1', 'c1')).status).toBe(200)
  })
})

describe('charges — effect on billing totals', () => {
  /**
   * BUGS.md #16, resolved — recalculatePatientBilling's query now succeeds
   * (supabase/migrations/20260805000001_patient_billing_package_flags.sql), so adding or
   * removing a charge moves the billing record again.
   */
  it('should raise patient_charges_total when a charge is added', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1', base_charge: 0, patient_charges_total: 0, total_charges: 0 })

    await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: 1500 })

    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.patient_charges_total)).toBe(1500)
  })

  it('should lower the total when a charge is deleted', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1', patient_charges_total: 1500, total_charges: 1500 })
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', amount: 1500, qty: 1 })

    await remove('p1', 'c1')

    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.patient_charges_total)).toBe(0)
  })
})
