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
import { aPatient, aBilling, aCharge, aReferral } from '../../helpers/seed'
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

  /**
   * Reception sets the referral person and the commission now (CR-04, Q-19 e).
   * A doctor, a nurse or the lab still cannot.
   */
  it.each(['DOCTOR', 'NURSE', 'LAB_TECHNICIAN'] as const)('refuses %s on PATCH', async (role) => {
    await signInAs(role)
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await update('p1', { billing_id: 'b1', base_charge: 5000 })

    expect(status).toBe(403)
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

    // A base charge sent by an older client is ignored: packages are gone (PRD v2 CR-15).
    expect(db.rows('patient_billing')[0]).toMatchObject({
      patient_id: 'p1',
      base_charge: 0,
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

  it('returns 500 when the database fails', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })
    db.failNext('patient_billing')

    expect((await create('p1', {})).status).toBe(500)
  })

  /**
   * Was BUGS.md #22: nothing stopped a second bill being opened for the same
   * patient, and every screen reads only one. Refused with 409 now, and a
   * unique index (20260925000005) closes the race the check alone cannot.
   */
  it('refuses to open a second bill for the same patient', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await create('p1', {})

    expect(status).toBe(409)
    expect(body).toMatchObject({ code: 'BILL_EXISTS', billing_id: 'b1' })
    expect(db.count('patient_billing')).toBe(1)
  })
})

describe('PATCH /api/patients/[id]/billing', () => {
  it('updates the referral commission, and ignores a base charge', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await update('p1', { billing_id: 'b1', base_charge: 20000, referral_commission_amount: 3000 })

    expect(status).toBe(200)
    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      base_charge: 0,
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

  /**
   * A 404 rather than the 500 this used to return: the route now looks the
   * billing row up before writing (to check it belongs to the patient), so a
   * missing id is a missing record, not a database error.
   */
  it('returns 404 when the billing id does not exist', async () => {
    await signInAs('ADMIN')

    expect((await update('p1', { billing_id: 'missing', base_charge: 1 })).status).toBe(404)
  })

  it('requires a billing id at all', async () => {
    await signInAs('ADMIN')

    expect((await update('p1', { base_charge: 1 })).status).toBe(400)
  })

  /**
   * The "included in package" flags went with the package (PRD v2 CR-15). An
   * older client still sending them gets a 200, and nothing is stored.
   */
  it('ignores the old "included in package" flags', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await update('p1', {
      billing_id: 'b1',
      base_charge: 20000,
      doctor_fees_included_in_package: true,
      referral_commission_included_in_package: true,
    })

    expect(status).toBe(200)
    const billing = db.find('patient_billing', (r) => r.id === 'b1')!
    expect(billing.base_charge).toBe(0)
    expect(billing.doctor_fees_included_in_package).not.toBe(true)
    expect(billing.referral_commission_included_in_package).not.toBe(true)
  })

  /** BUGS.md #24, resolved — the billing row must belong to the patient in the URL. */
  it('refuses to update a billing record belonging to another patient', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b-other', patient_id: 'p2', base_charge: 0 })

    const { status } = await update('p1', { billing_id: 'b-other', base_charge: 99999 })

    expect(status).toBe(404)
    expect(Number(db.find('patient_billing', (r) => r.id === 'b-other')!.base_charge)).toBe(0)
  })
})

/**
 * The patient's bill after PRD v2 CR-15: charges are internal and nothing is
 * owed against them, so total_charges is the charges alone — no base package,
 * and never the referral commission (it is the patient's expense).
 */
describe('PATCH /api/patients/[id]/billing — no package', () => {
  it('rejects a negative commission', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    expect(
      (await update('p1', { billing_id: 'b1', referral_commission_amount: -500 })).status,
    ).toBe(400)
  })

  it('keeps the commission off the bill', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aCharge({ patient_billing_id: 'b1', amount: 12000, qty: 1 })

    await update('p1', { billing_id: 'b1', referral_commission_amount: 2000 })

    const billing = db.find('patient_billing', (r) => r.id === 'b1')!
    expect(Number(billing.referral_commission_amount)).toBe(2000)
    expect(Number(billing.total_charges)).toBe(12000)
  })
})

/**
 * Who may still change a referral commission (client revision, 2026-09-24).
 *
 * This replaces the own-row rule: while the commission is unsettled the desk
 * shares it — the amount and the referral person both — and once it is settled
 * it is the admin's alone. None of this was covered before.
 */
describe('PATCH /api/patients/[id]/billing — changing a commission', () => {
  it('lets reception set and re-set an unsettled commission and its referral person', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    aReferral({ id: 'r1', name: 'Suresh' })
    aReferral({ id: 'r2', name: 'Meena' })

    await update('p1', { billing_id: 'b1', referral_id: 'r1', referral_commission_amount: 2000 })

    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    const { status } = await update('p1', {
      billing_id: 'b1',
      referral_id: 'r2',
      referral_commission_amount: 2500,
    })

    expect(status).toBe(200)
    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      referral_commission_amount: 2500,
      // Recorded, not enforced — the audit trail replaces the ownership lock.
      referral_commission_set_by: 'u-recep',
    })
    expect(db.find('patients', (r) => r.id === 'p1')!.referred_by).toBe('r2')
  })

  it('stops reception touching a settled commission', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1', referred_by: 'r1' })
    aBilling({
      id: 'b1',
      patient_id: 'p1',
      referral_commission_amount: 2000,
      referral_settled: true,
    })
    aReferral({ id: 'r1', name: 'Suresh' })
    aReferral({ id: 'r2', name: 'Meena' })

    const amount = await update('p1', { billing_id: 'b1', referral_commission_amount: 3000 })
    const person = await update('p1', { billing_id: 'b1', referral_id: 'r2' })
    const reopen = await update('p1', { billing_id: 'b1', referral_settled: false })

    for (const attempt of [amount, person, reopen]) {
      expect(attempt.status).toBe(403)
      expect(attempt.body.code).toBe('ADMIN_ONLY')
    }
    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      referral_commission_amount: 2000,
      referral_settled: true,
    })
    expect(db.find('patients', (r) => r.id === 'p1')!.referred_by).toBe('r1')
  })

  /**
   * The case that used to be refused for everyone: `canModify` treated a
   * settled row as locked, and its admin branch refuses a locked row too. An
   * admin now corrects it in one action and the debit follows.
   */
  /**
   * Correcting a settled commission is now one write, on one row. It used to be
   * two — the bill and the ledger debit it had written — and the pair could
   * disagree. A payout writes no ledger entry at all (client revision,
   * 2026-09-24), so there is nothing left to keep in step.
   */
  it('lets an admin correct a settled commission in place', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh' })
    aBilling({ id: 'b1', patient_id: 'p1', referral_commission_amount: 2000 })

    await update('p1', {
      billing_id: 'b1',
      referral_settled: true,
      referral_settlement_payment_method: 'cash',
    })

    expect(db.count('daily_ledger_transactions')).toBe(0)

    const { status } = await update('p1', { billing_id: 'b1', referral_commission_amount: 1500 })

    expect(status).toBe(200)
    expect(db.find('patient_billing', (r) => r.id === 'b1')).toMatchObject({
      referral_commission_amount: 1500,
      // Still settled: an amendment, not a reopen.
      referral_settled: true,
      // …and the name beside the amount is whoever last changed it.
      referral_commission_set_by: 'u-admin',
    })
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })
})
