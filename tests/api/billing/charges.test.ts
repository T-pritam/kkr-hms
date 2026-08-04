/**
 * /api/patients/[id]/charges — itemised patient charges.
 */

import { describe, it, expect } from 'vitest'
import { GET as listCharges, POST as createCharge } from '@/app/api/patients/[id]/charges/route'
import { PATCH as editCharge, DELETE as removeCharge } from '@/app/api/patients/[id]/charges/[chargeId]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aCharge, aUser } from '../../helpers/seed'
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

    expect(status).toBe(200)
    expect(body.id).toEqual(expect.any(String))

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
    aBilling({ id: 'b1' })

    await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: 100 })

    expect(db.rows('patient_charges')[0].charge_date).toBe(TODAY)
  })

  it('returns 500 when the insert fails', async () => {
    await signInAs('NURSE')
    db.failNext('patient_charges')

    expect((await create('p1', { amount: 100 })).status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #17. The charges form collects a mandatory quantity and
   * the totals multiply by it, but the route never persists `qty`, so the column keeps
   * its default of 1 and a three-unit charge is billed as one.
   */
  it.fails('should persist the quantity it was given', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1' })

    await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: 500, qty: 3 })

    expect(db.rows('patient_charges')[0].qty).toBe(3)
  })

  /** Known defect — see BUGS.md #18. No field is validated: type, description and amount are all optional. */
  it.fails('should reject a charge with no amount', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1' })

    const { status } = await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure' })
    expect(status).toBe(400)
  })

  /** Known defect — see BUGS.md #18. A negative amount is accepted and reduces the bill. */
  it.fails('should reject a negative amount', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b1' })

    const { status } = await create('p1', { patient_billing_id: 'b1', charge_type: 'Procedure', amount: -5000 })
    expect(status).toBe(400)
  })

  /** Known defect — see BUGS.md #18. The billing cycle is never checked against the patient in the URL. */
  it.fails('should reject a billing id belonging to a different patient', async () => {
    await signInAs('NURSE')
    aBilling({ id: 'b-other', patient_id: 'p2' })

    const { status } = await create('p1', { patient_billing_id: 'b-other', charge_type: 'Procedure', amount: 100 })
    expect(status).toBeGreaterThanOrEqual(400)
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

  it('blanks the fields the caller omits', async () => {
    await signInAs('ADMIN')
    aCharge({ id: 'c1', patient_id: 'p1', description: 'Original', charge_type: 'X-Ray' })

    await edit('p1', 'c1', { amount: 250 })

    const stored = db.find('patient_charges', (r) => r.id === 'c1')!
    expect(stored.description).toBeUndefined()
    expect(stored.charge_type).toBeUndefined()
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
