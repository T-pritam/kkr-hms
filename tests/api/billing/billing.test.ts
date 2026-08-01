/**
 * /api/patients/[id]/billing — the patient's billing record.
 */

import { describe, it, expect } from 'vitest'
import {
  GET as getBilling,
  POST as createBilling,
  PATCH as updateBilling,
} from '@/app/api/patients/[id]/billing/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aPatient, aBilling, aReferral } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const read = (patientId: string) =>
  call(getBilling, 'GET', `/api/patients/${patientId}/billing`, { params: { id: patientId } })

const create = (patientId: string, body: unknown) =>
  call(createBilling, 'POST', `/api/patients/${patientId}/billing`, { body, params: { id: patientId } })

const update = (patientId: string, body: unknown) =>
  call(updateBilling, 'PATCH', `/api/patients/${patientId}/billing`, { body, params: { id: patientId } })

describe('billing — authentication and roles', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await read('p1')).status).toBe(401)
    expect((await create('p1', {})).status).toBe(401)
    expect((await update('p1', {})).status).toBe(401)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('lets %s read and create billing', async (role) => {
    await signInAs(role)
    aPatient({ id: 'p1' })

    expect((await read('p1')).status).toBe(200)
    expect((await create('p1', {})).status).toBe(200)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s on PATCH', async (role) => {
    await signInAs(role)
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await update('p1', { billing_id: 'b1', base_charge: 5000 })

    expect(status).toBe(403)
    expect(body.error).toBe('Only admins can update billing')
    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.base_charge)).toBe(0)
  })
})

describe('GET /api/patients/[id]/billing', () => {
  it('returns the patient’s billing records, newest first', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b-old', patient_id: 'p1', created_at: '2026-01-01T00:00:00.000Z' })
    aBilling({ id: 'b-new', patient_id: 'p1', created_at: '2026-03-01T00:00:00.000Z' })

    const { status, body } = await read('p1')

    expect(status).toBe(200)
    expect(body.billings.map((b: any) => b.id)).toEqual(['b-new', 'b-old'])
  })

  it('returns an empty list for a patient with no billing record', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1' })

    const { body } = await read('p1')
    expect(body.billings).toEqual([])
    expect(body.referral).toBeNull()
  })

  it('resolves the referral when the patient has one', async () => {
    await signInAs('NURSE')
    aReferral({ id: 'r1', name: 'Dr. Referrer', phone: '9876500000', status: 'active' })
    aPatient({ id: 'p1', referred_by: 'r1' })

    const { body } = await read('p1')

    expect(body.referral).toEqual({ id: 'r1', name: 'Dr. Referrer', phone: '9876500000', status: 'active' })
  })

  it('returns a null referral when the referrer no longer exists', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', referred_by: 'deleted-referral' })

    expect((await read('p1')).body.referral).toBeNull()
  })

  it('returns 500 when the patient does not exist', async () => {
    await signInAs('NURSE')

    expect((await read('missing')).status).toBe(500)
  })
})

describe('POST /api/patients/[id]/billing', () => {
  it('creates a billing record aligned to the patient’s join date', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1', date_of_join: '2026-02-14' })

    const { status, body } = await create('p1', { base_charge: 20000, referral_commission_amount: 3000 })

    expect(status).toBe(200)
    expect(body.id).toEqual(expect.any(String))

    expect(db.rows('patient_billing')[0]).toMatchObject({
      patient_id: 'p1',
      base_charge: 20000,
      referral_commission_amount: 3000,
      joined_date: '2026-02-14',
      month_year: '2026-02',
      created_by: 'u-recep',
    })
  })

  it('defaults the amounts to zero', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    await create('p1', {})

    expect(db.rows('patient_billing')[0]).toMatchObject({
      base_charge: 0,
      referral_commission_amount: 0,
    })
  })

  it('falls back to today when the patient has no join date', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', date_of_join: null })

    await create('p1', {})

    expect(db.rows('patient_billing')[0]).toMatchObject({ joined_date: TODAY, month_year: THIS_MONTH })
  })

  it('links a referral to the patient when one is supplied', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', referred_by: null })
    aReferral({ id: 'r1' })

    await create('p1', { referral_id: 'r1' })

    expect(db.find('patients', (r) => r.id === 'p1')!.referred_by).toBe('r1')
  })

  it('returns 500 when the insert fails', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })
    db.failNext('patient_billing')

    expect((await create('p1', {})).status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #22. Nothing stops a second billing record being opened
   * for the same patient. The UI guards with an in-flight flag, which does not survive a
   * double submit from two tabs. Totals and payments then split across two records.
   */
  it.fails('should refuse to open a second billing record for the same patient', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {})

    expect(status).toBeGreaterThanOrEqual(400)
    expect(db.count('patient_billing')).toBe(1)
  })
})

describe('PATCH /api/patients/[id]/billing', () => {
  it('updates the base charge and the referral commission', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await update('p1', { billing_id: 'b1', base_charge: 20000, referral_commission_amount: 3000 })

    expect(status).toBe(200)
    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      base_charge: 20000,
      referral_commission_amount: 3000,
      updated_by: 'u-admin',
    })
  })

  it('records a referral settlement', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1', referral_commission_amount: 3000, referral_settled: false })

    await update('p1', {
      billing_id: 'b1',
      referral_settled: true,
      referral_settlement_date: '2026-03-12T00:00:00.000Z',
      referral_settlement_notes: 'Paid in cash',
      referral_settlement_payment_method: 'cash',
    })

    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      referral_settled: true,
      referral_settlement_date: '2026-03-12T00:00:00.000Z',
      referral_settlement_notes: 'Paid in cash',
      referral_settlement_payment_method: 'cash',
    })
  })

  it('stores the transaction reference under its differently named column', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    // Request field is referral_settlement_transaction_ref; the column is referral_transaction_ref.
    await update('p1', { billing_id: 'b1', referral_settlement_transaction_ref: 'NEFT-99' })

    expect(db.find('patient_billing', (r) => r.id === 'b1')!.referral_transaction_ref).toBe('NEFT-99')
  })

  it('leaves fields the caller did not mention alone', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1', base_charge: 20000, referral_commission_amount: 3000 })

    await update('p1', { billing_id: 'b1', referral_settled: true })

    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      base_charge: 20000,
      referral_commission_amount: 3000,
    })
  })

  it('can clear the patient’s referral', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1', referred_by: 'r1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    await update('p1', { billing_id: 'b1', referral_id: null })

    expect(db.find('patients', (r) => r.id === 'p1')!.referred_by).toBeNull()
  })

  it('returns 500 when the billing id does not exist', async () => {
    await signInAs('ADMIN')

    expect((await update('p1', { billing_id: 'missing', base_charge: 1 })).status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #23. The route writes two columns the live schema does not
   * have. Any request carrying either flag fails outright with a 500, which is what the
   * "included in package" checkboxes in the billing tab send.
   */
  it.fails('should accept the "included in package" flags the UI sends', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await update('p1', {
      billing_id: 'b1',
      base_charge: 20000,
      doctor_fees_included_in_package: true,
    })

    expect(status).toBe(200)
  })

  it('rejects the package flags today, because the columns do not exist', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await update('p1', {
      billing_id: 'b1',
      referral_commission_included_in_package: true,
    })

    expect(status).toBe(500)
    expect(body.error).toBe('Failed to update patient billing')
  })

  /**
   * Known defect — see BUGS.md #24. The billing record is looked up by an id taken from
   * the request body; nothing checks that it belongs to the patient named in the URL.
   */
  it.fails('should refuse to update a billing record belonging to another patient', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b-other', patient_id: 'p2', base_charge: 0 })

    await update('p1', { billing_id: 'b-other', base_charge: 99999 })

    expect(Number(db.find('patient_billing', (r) => r.id === 'b-other')!.base_charge)).toBe(0)
  })
})
