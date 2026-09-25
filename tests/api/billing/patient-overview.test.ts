/**
 * GET /api/patients/[id]/overview — the patient Overview tab (PRD v2 CR-16).
 *
 * The money model, as the client revised it on 26 Sep (round 8):
 *   total bill = payments + registration + lab           x + y + z = A
 *   expenses   = doctor fees + referral commission + every medicine charge,
 *                all counted once priced, paid or not
 *   net        = total bill − expenses, admin only
 *
 * Lab is the hospital's income now — the lab is in-house — and is taken as a
 * payment. Medicine is always the hospital's expense; nothing is "not decided".
 */

import { describe, it, expect } from 'vitest'
import { GET as overview } from '@/app/api/patients/[id]/overview/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  aBilling,
  aCharge,
  aChargeItem,
  anInstallment,
  aPatient,
  aReferral,
  aSettlement,
  aDoctor,
} from '../../helpers/seed'
import { TODAY } from '../../setup'

const get = (patientId = 'p1', query = {}) =>
  call(overview, 'GET', `/api/patients/${patientId}/overview`, { params: { id: patientId }, query })

/** The worked example in PRD v2 CR-15. */
function aStay() {
  aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar', date_of_join: '2026-03-10', status: 'Active' })
  aBilling({ id: 'b1', patient_id: 'p1', joined_date: '2026-03-10', referral_commission_amount: 2000, referral_settled: false })

  aChargeItem({ id: 'room', name: 'Room', category: 'room' })
  aChargeItem({ id: 'proc', name: 'Procedure', category: 'procedure' })
  aChargeItem({ id: 'reg', name: 'Registration', category: 'registration', is_registration_fee: true, default_price: 300 })
  aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy' })
  aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })

  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'room', amount: 20000, qty: 1 })
  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'proc', amount: 9900, qty: 1 })
  // Registration and lab: each a payment with its mirrored charge line.
  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'reg', amount: 100, qty: 1, installment_id: 'i1' })
  aCharge({
    patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'lab', charge_type: 'Lab Test',
    amount: 3000, qty: 1, installment_id: 'i4',
  })
  // Medicine: the hospital's expense, always.
  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'med', charge_type: 'Medication', amount: 1000, qty: 1 })

  anInstallment({ id: 'i1', patient_billing_id: 'b1', installment_number: 1, amount: 100, kind: 'registration' })
  anInstallment({ id: 'i2', patient_billing_id: 'b1', installment_number: 2, amount: 10000, kind: 'advance' })
  anInstallment({ id: 'i3', patient_billing_id: 'b1', installment_number: 3, amount: 15000, kind: 'regular' })
  anInstallment({ id: 'i4', patient_billing_id: 'b1', installment_number: 4, amount: 3000, kind: 'lab' })
  anInstallment({ id: 'i5', patient_billing_id: 'b1', installment_number: 5, amount: 5000, kind: 'discharge', payment_date: TODAY })

  aDoctor({ id: 'd1', name: 'Dr Rao' })
  aSettlement({ patient_billing_id: 'b1', doctor_id: 'd1', total_amount: 6000, settled: false })
}

describe('patient overview — access', () => {
  it('needs a session', async () => {
    signOut()
    expect((await get()).status).toBe(401)
  })

  it('404s for an unknown patient, and for a patient with no bill', async () => {
    await signInAs('RECEPTIONIST')
    expect((await get('nobody')).status).toBe(404)

    aPatient({ id: 'p2' })
    expect((await get('p2')).status).toBe(404)
  })
})

describe('patient overview — money', () => {
  it('adds up the total bill, and every payment is the hospital\u2019s income', async () => {
    await signInAs('ADMIN')
    aStay()

    const { status, body } = await get()

    expect(status).toBe(200)
    expect(body.money.total_bill).toBe(33100)
    expect(body.money.by_label).toMatchObject({
      registration: 100,
      advance: 10000,
      regular: 15000,
      discharge: 5000,
      misc: 0,
      lab: 3000,
    })
    // Every payment is the hospital's: there is nothing to pass on.
    expect(body.money.passed_on).toBeUndefined()
    expect(body.money.hospital_income).toBe(33100)
  })

  // The client's own reading (round 8): x + y + z = A.
  it('splits the total into payments + registration + lab', async () => {
    await signInAs('RECEPTIONIST')
    aStay()

    const { body } = await get()

    expect(body.money.breakdown).toEqual({ payments: 30000, registration: 100, lab: 3000, total: 33100 })
  })

  it('counts doctor fees and the commission as expenses once priced, paid or not', async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    expect(body.money.expenses.doctor_fees).toEqual({ total: 6000, paid: 0, pending: 6000 })
    expect(body.money.expenses.referral_commission).toEqual({ amount: 2000, paid: 0, pending: 2000 })
    // 6,000 + 2,000 + the 1,000 of medicine.
    expect(body.money.expenses.total).toBe(9000)
  })

  /**
   * Round 8, stated as a number: medicine is an expense, lab is income. The
   * lab test adds to the total bill and never to expenses.
   */
  it('counts medicine as an expense and lab as income', async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    expect(body.money.expenses.medicine).toBe(1000)
    expect(body.money.expenses).not.toHaveProperty('lab_medicine')
    expect(body).not.toHaveProperty('lab_medicine')
    expect(body.money.expenses.total).toBe(9000)
    expect(body.money.net).toBe(24100) // 33,100 − 9,000
  })

  it('splits a settled doctor fee into paid', async () => {
    await signInAs('ADMIN')
    aStay()
    aSettlement({ patient_billing_id: 'b1', doctor_id: 'd1', total_amount: 1000, settlement_amount: 1000, settled: true })

    const { body } = await get()

    expect(body.money.expenses.doctor_fees).toEqual({ total: 7000, paid: 1000, pending: 6000 })
  })

  it('hides Net from reception, and shows the rest', async () => {
    await signInAs('RECEPTIONIST')
    aStay()

    const { body } = await get()

    expect(body.money.net).toBeNull()
    expect(body.money.total_bill).toBe(33100)
    expect(body.money.expenses.total).toBe(9000)
  })
})

describe('patient overview — the rest of the stay', () => {
  // No "not decided" any more: every medicine charge counts, whatever the old
  // status column says.
  it('counts every medicine charge, with or without the old status', async () => {
    await signInAs('ADMIN')
    aStay()
    aCharge({
      patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'med', charge_type: 'Medication',
      amount: 250, qty: 2, lab_medicine_status: null,
    })

    const { body } = await get()

    expect(body.money.expenses.medicine).toBe(1500)
  })

  it('totals the services used by category, charges being internal', async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    // 20,000 + 9,900 + 100 + 3,000 + 1,000: charges are for reference only.
    expect(body.services_used.total).toBe(34000)
    expect(body.services_used.by_category.find((c: any) => c.category === 'room')).toMatchObject({ total: 20000, count: 1 })
    expect(body.services_used.by_category.find((c: any) => c.category === 'registration')).toMatchObject({ total: 100 })
  })

  it('describes the stay, the referral and the registration fee', async () => {
    await signInAs('RECEPTIONIST')
    aStay()
    aReferral({ id: 'r1', name: 'Suresh', phone: '9999999999' })
    db.patchRow('patients', (r) => r.id === 'p1', { referred_by: 'r1' })
    db.patchRow('patient_billing', (r) => r.id === 'b1', { registration_fee_status: 'collected' })

    const { body } = await get()

    expect(body.stay).toMatchObject({
      billing_id: 'b1',
      joined_date: '2026-03-10',
      discharged_on: null,
    })
    expect(body.stay.days).toBe(5) // 10 → 15 March, the frozen test clock
    expect(body.stay.patient).toMatchObject({ patient_id: '12/26', name: 'Ramesh Kumar' })
    expect(body.stay.referral).toEqual({ name: 'Suresh', phone: '9999999999' })
    expect(body.stay.registration_fee).toEqual({ status: 'collected', amount: 100 })
  })

  it('counts the activity on the stay', async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    expect(body.activity).toMatchObject({ charges: 5, payments: 5, visits: 0, lab_orders: 0, pharmacy_bills: 0 })
    expect(body.activity.last_payment_date).toBe(TODAY)
  })
})
