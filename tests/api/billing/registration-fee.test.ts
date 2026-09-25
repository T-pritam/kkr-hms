/**
 * The registration fee at registration — PRD v2 CR-11.
 *
 *   GET  /api/registration-fee         the amount the form pre-fills
 *   POST /api/patients { registration_fee }   charge it, and take it if ticked
 *   GET  /api/patients/[id]/billing    how much the fee on each bill came to
 *   PATCH/DELETE /api/charge-items/[id]  the fee's entry is admin-only
 */

import { describe, it, expect } from 'vitest'
import { GET as getRegistrationFee } from '@/app/api/registration-fee/route'
import { POST as createPatient } from '@/app/api/patients/route'
import { GET as getBilling } from '@/app/api/patients/[id]/billing/route'
import { PATCH as patchItem, DELETE as deleteItem } from '@/app/api/charge-items/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aCharge, aChargeItem, aPatient } from '../../helpers/seed'
import { TODAY, THIS_MONTH } from '../../setup'

const VALID = { name: 'Ramesh Kumar', gender: 'Male', phone: '9876543210' }

const register = (body: unknown) => call(createPatient, 'POST', '/api/patients', { body })
const feeLookup = () => call(getRegistrationFee, 'GET', '/api/registration-fee')

const feeItem = (overrides = {}) =>
  aChargeItem({
    id: 'reg',
    code: 'REG',
    name: 'Registration',
    category: 'registration',
    default_price: 100,
    is_registration_fee: true,
    ...overrides,
  })

const bill = () => db.rows('patient_billing')[0]

describe('GET /api/registration-fee', () => {
  it('requires a session', async () => {
    signOut()
    expect((await feeLookup()).status).toBe(401)
  })

  it('returns the flagged catalogue entry', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()
    aChargeItem({ name: 'Room', default_price: 2000 })

    const { status, body } = await feeLookup()

    expect(status).toBe(200)
    expect(body.registrationFee).toEqual({ id: 'reg', name: 'Registration', amount: 100 })
  })

  it('returns null when no entry is flagged, or the flagged one is retired', async () => {
    await signInAs('RECEPTIONIST')
    expect((await feeLookup()).body.registrationFee).toBeNull()

    feeItem({ is_active: false })
    expect((await feeLookup()).body.registrationFee).toBeNull()
  })
})

describe('POST /api/patients — registration fee', () => {
  it('charges the fee and records it as collected, with a registration ledger credit', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    feeItem()

    const { status, body } = await register({
      ...VALID,
      registration_fee: { amount: 100, collected: true, payment_method: 'cash' },
    })

    expect(status).toBe(201)
    expect(body.registration_fee).toMatchObject({ status: 'collected', amount: 100 })

    const patient = db.rows('patients')[0]
    // Q-45 B: a charge line (services used) …
    expect(db.rows('patient_charges')[0]).toMatchObject({
      patient_id: patient.id,
      patient_billing_id: bill().id,
      charge_item_id: 'reg',
      charge_type: 'Registration',
      amount: 100,
      qty: 1,
      billing_mode: 'one_time',
      charge_date: TODAY,
      created_by: 'u-recep',
    })
    // … and a payment, of its own kind, with its ledger credit.
    expect(db.rows('patient_billing_installments')[0]).toMatchObject({
      patient_billing_id: bill().id,
      kind: 'registration',
      amount: 100,
      payment_method: 'cash',
      payment_date: TODAY,
      created_by: 'u-recep',
    })
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      source: 'registration',
      transaction_type: 'credit',
      amount: 100,
      patient_id: patient.id,
      created_by: 'u-recep',
    })
    expect(bill()).toMatchObject({
      registration_fee_status: 'collected',
      patient_charges_total: 100,
      total_charges: 100,
      patient_paid_amount: 100,
    })
  })

  it('takes the amount the desk typed, not the catalogue price (Q-42)', async () => {
    await signInAs('RECEPTIONIST')
    feeItem({ default_price: 100 })

    await register({ ...VALID, registration_fee: { amount: 50, collected: true, payment_method: 'cash' } })

    expect(db.rows('patient_charges')[0].amount).toBe(50)
    expect(db.rows('patient_billing_installments')[0].amount).toBe(50)
  })

  it('charges but does not collect when "collected" is left unticked (Q-43)', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    const { body } = await register({ ...VALID, registration_fee: { amount: 100, collected: false } })

    expect(body.registration_fee).toEqual({ status: 'not_collected', amount: 100 })
    expect(db.count('patient_charges')).toBe(1)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
    expect(bill().registration_fee_status).toBe('pending')
  })

  it('waives the fee at 0 — no charge, no payment', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    const { body } = await register({ ...VALID, registration_fee: { amount: 0, collected: true } })

    expect(body.registration_fee).toEqual({ status: 'waived', amount: 0 })
    expect(db.count('patient_charges')).toBe(0)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(bill().registration_fee_status).toBe('waived')
  })

  it('records UPI with its reference (Q-44)', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    await register({
      ...VALID,
      registration_fee: { amount: 100, collected: true, payment_method: 'upi', transaction_reference: 'UPI-77' },
    })

    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({ payment_mode: 'upi', reference_number: 'UPI-77' })
  })

  it('refuses a UPI fee with no reference before registering anyone', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    const { status, body } = await register({
      ...VALID,
      registration_fee: { amount: 100, collected: true, payment_method: 'upi' },
    })

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty('registration_fee.transaction_reference')
    expect(db.count('patients')).toBe(0)
  })

  it('only offers cash or UPI (Req 11)', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    const { status, body } = await register({
      ...VALID,
      registration_fee: { amount: 100, collected: true, payment_method: 'card' },
    })

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty('registration_fee.payment_method')
    expect(db.count('patients')).toBe(0)
  })

  it('refuses a negative or missing amount', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    expect((await register({ ...VALID, registration_fee: { amount: -1 } })).status).toBe(400)
    expect((await register({ ...VALID, registration_fee: { amount: '' } })).status).toBe(400)
    expect(db.count('patients')).toBe(0)
  })

  it('registers exactly as before when no fee block is sent', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    const { status, body } = await register(VALID)

    expect(status).toBe(201)
    expect(body).not.toHaveProperty('registration_fee')
    expect(db.count('patient_charges')).toBe(0)
    expect(bill().registration_fee_status).toBeUndefined()
  })

  it('reports not_configured, and charges nothing, when no catalogue entry is the fee', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await register({ ...VALID, registration_fee: { amount: 100, collected: true } })

    expect(status).toBe(201)
    expect(body.registration_fee).toEqual({ status: 'not_configured' })
    expect(db.count('patient_charges')).toBe(0)
  })

  /**
   * A failure after the patient exists does not undo the registration. The fee
   * stays charged and "not collected"; the desk takes it from the Payments tab.
   */
  it('still registers the patient when the fee payment is refused, and says so', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()
    // The ledger credit fails, so recordPayment undoes the installment it had
    // just written — the patient is registered, the fee is simply not collected.
    db.failNext('daily_ledger_transactions')

    const { status, body } = await register({
      ...VALID,
      registration_fee: { amount: 100, collected: true, payment_method: 'cash' },
    })

    expect(status).toBe(201)
    expect(body.registration_fee.status).toBe('failed')
    expect(db.count('patients')).toBe(1)
    expect(db.count('patient_charges')).toBe(1)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(bill().registration_fee_status).toBe('pending')
  })

  /** PRD v2 gap G-26: bills made at registration had no month, so Finances never counted them. */
  it('gives the new bill its join date and month', async () => {
    await signInAs('RECEPTIONIST')

    await register(VALID)

    expect(bill()).toMatchObject({ joined_date: TODAY, month_year: THIS_MONTH })
  })
})

describe('GET /api/patients/[id]/billing — registration fee amount', () => {
  it('adds up the registration-fee charges on each bill', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1', registration_fee_status: 'pending' })
    aCharge({ patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'reg', amount: 100 })
    aCharge({ patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: null, amount: 5000 })

    const { body } = await call(getBilling, 'GET', '/api/patients/p1/billing', { params: { id: 'p1' } })

    expect(body.billings[0]).toMatchObject({ registration_fee_status: 'pending', registration_fee_amount: 100 })
  })
})

describe('charge catalogue — the registration fee entry is admin-only (Q-40)', () => {
  const patch = (id: string, body: unknown) =>
    call(patchItem, 'PATCH', `/api/charge-items/${id}`, { body, params: { id } })
  const remove = (id: string) => call(deleteItem, 'DELETE', `/api/charge-items/${id}`, { params: { id } })

  it('refuses reception', async () => {
    await signInAs('RECEPTIONIST')
    feeItem()

    const edited = await patch('reg', { default_price: 1 })
    expect(edited.status).toBe(403)
    expect(edited.body.code).toBe('REGISTRATION_FEE_ADMIN_ONLY')
    expect((await remove('reg')).status).toBe(403)
    expect(db.find('charge_items', (r) => r.id === 'reg')!.default_price).toBe(100)
  })

  it('lets reception keep editing the rest of the catalogue (Q-01 = B)', async () => {
    await signInAs('RECEPTIONIST')
    aChargeItem({ id: 'room', name: 'Room', default_price: 2000 })

    expect((await patch('room', { default_price: 2500 })).status).toBe(200)
  })

  it('lets admin change it', async () => {
    await signInAs('ADMIN')
    feeItem()

    expect((await patch('reg', { default_price: 150 })).status).toBe(200)
    expect(db.find('charge_items', (r) => r.id === 'reg')!.default_price).toBe(150)
  })
})
