/**
 * GET /api/patients/[id]/overview — the patient Overview tab (PRD v2 CR-16).
 *
 * The money model, as the client revised it on 2026-09-24:
 *   total bill      = every payment on the stay
 *   hospital income = the total bill — nothing is "passed on" any more, because
 *                     an amount the patient paid the lab directly is not
 *                     recorded at all (Q-82, reversed)
 *   expenses        = doctor fees + referral commission + **included lab and
 *                     medicine**, all counted once priced, paid or not (Q-83,
 *                     reversed: an included amount used to be income)
 *   net             = hospital income − expenses, admin only
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
  aChargeItem({ id: 'reg', name: 'Registration', category: 'registration', is_registration_fee: true, default_price: 100 })
  aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy' })
  aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })

  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'room', amount: 20000, qty: 1 })
  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'proc', amount: 9900, qty: 1 })
  aCharge({ patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'reg', amount: 100, qty: 1 })
  // The ₹9,000 of medicine in the PRD's example is now paid straight to the
  // pharmacy, so there is no charge and no payment for it at all.
  aCharge({
    patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'lab', charge_type: 'Lab Test',
    amount: 3000, qty: 1, lab_medicine_status: 'included',
  })

  anInstallment({ id: 'i1', patient_billing_id: 'b1', installment_number: 1, amount: 100, kind: 'registration' })
  anInstallment({ id: 'i2', patient_billing_id: 'b1', installment_number: 2, amount: 10000, kind: 'advance' })
  anInstallment({ id: 'i3', patient_billing_id: 'b1', installment_number: 3, amount: 15000, kind: 'regular' })
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
    expect(body.money.total_bill).toBe(30100)
    expect(body.money.by_label).toMatchObject({
      registration: 100,
      advance: 10000,
      regular: 15000,
      discharge: 5000,
      misc: 0,
    })
    // Every payment is the hospital's now: there is nothing to pass on.
    expect(body.money.passed_on).toBeUndefined()
    expect(body.money.hospital_income).toBe(30100)
  })

  it('counts doctor fees and the commission as expenses once priced, paid or not', async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    expect(body.money.expenses.doctor_fees).toEqual({ total: 6000, paid: 0, pending: 6000 })
    expect(body.money.expenses.referral_commission).toEqual({ amount: 2000, paid: 0, pending: 2000 })
    // 6,000 + 2,000 + the 3,000 lab charge marked Included.
    expect(body.money.expenses.total).toBe(11000)
  })

  /**
   * The reversal, stated as a number. An Included lab amount used to be counted
   * as income and left out of expenses; it is now the hospital's to pay, because
   * the patient's payments covered it and the lab bills us. The worked example's
   * net moves from ₹22,100 to ₹19,100.
   */
  it("counts an included lab/medicine amount as the hospital's expense", async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    expect(body.lab_medicine.included).toBe(3000)
    expect(body.money.expenses.lab_medicine).toBe(3000)
    expect(body.money.expenses.total).toBe(11000)
    expect(body.money.net).toBe(19100) // 30,100 − 11,000
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
    expect(body.money.total_bill).toBe(30100)
    expect(body.money.expenses.total).toBe(11000)
  })
})

describe('patient overview — the rest of the stay', () => {
  // Two states left: the hospital carries it, or nobody has said yet. An
  // undecided charge is deliberately no expense — it is shown so a person
  // resolves it, not so the total quietly grows.
  it('splits lab and medicine into what the hospital carries and what is undecided', async () => {
    await signInAs('ADMIN')
    aStay()
    aCharge({
      patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'lab', charge_type: 'Lab Test',
      amount: 500, qty: 1, lab_medicine_status: null,
    })
    aCharge({
      patient_billing_id: 'b1', patient_id: 'p1', charge_item_id: 'med', charge_type: 'Medication',
      amount: 250, qty: 1, lab_medicine_status: null,
    })

    const { body } = await get()

    expect(body.lab_medicine).toMatchObject({ included: 3000, undecided: 750 })
    expect(body.money.expenses.lab_medicine).toBe(3000)
    expect(body.lab_medicine.rows).toHaveLength(3)
    expect(body.lab_medicine.rows.every((r: any) => ['lab', 'medicine'].includes(r.kind))).toBe(true)
  })

  it('totals the services used by category, charges being internal', async () => {
    await signInAs('ADMIN')
    aStay()

    const { body } = await get()

    expect(body.services_used.total).toBe(33000)
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

    expect(body.activity).toMatchObject({ charges: 4, payments: 4, visits: 0, lab_orders: 0, pharmacy_bills: 0 })
    expect(body.activity.last_payment_date).toBe(TODAY)
  })
})
