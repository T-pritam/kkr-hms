/**
 * Lab and medicine charges — included, or collected separately (PRD v2 CR-15),
 * and payment labels.
 *
 * The client's words (2026-09-22): "include means included in the payments so
 * not to collect this from the patient separately; exclude means collect and at
 * the same time that thing adds as a separate [payment] of the patient, and as
 * installments show in the ledger (with proper patient details and lab or
 * medicine as tag)". Excluded is the default, asked at the time of saving.
 */

import { describe, it, expect } from 'vitest'
import { POST as createCharge } from '@/app/api/patients/[id]/charges/route'
import { PATCH as editCharge, DELETE as removeCharge } from '@/app/api/patients/[id]/charges/[chargeId]/route'
import { POST as decide } from '@/app/api/patients/[id]/charges/[chargeId]/lab-medicine/route'
import { POST as createPayment } from '@/app/api/patients/[id]/installments/route'
import {
  PATCH as editPayment,
  DELETE as removePayment,
} from '@/app/api/patients/[id]/installments/[installmentId]/route'
import { POST as forwardSheet } from '@/app/api/charge-sheets/[id]/forward/route'
import { call } from '../../helpers/request'
import { signInAs } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  aBilling,
  aCharge,
  aChargeItem,
  aChargeSheet,
  aChargeSheetItem,
  anInstallment,
  aPatient,
  aTransaction,
} from '../../helpers/seed'
import { TODAY } from '../../setup'

const addCharge = (body: unknown) =>
  call(createCharge, 'POST', '/api/patients/p1/charges', { body, params: { id: 'p1' } })
const patchCharge = (chargeId: string, body: unknown) =>
  call(editCharge, 'PATCH', `/api/patients/p1/charges/${chargeId}`, { body, params: { id: 'p1', chargeId } })
const deleteCharge = (chargeId: string) =>
  call(removeCharge, 'DELETE', `/api/patients/p1/charges/${chargeId}`, { params: { id: 'p1', chargeId } })
const decideCharge = (chargeId: string, body: unknown) =>
  call(decide, 'POST', `/api/patients/p1/charges/${chargeId}/lab-medicine`, { body, params: { id: 'p1', chargeId } })
const addPayment = (body: unknown) =>
  call(createPayment, 'POST', '/api/patients/p1/installments', { body, params: { id: 'p1' } })
const patchPayment = (installmentId: string, body: unknown) =>
  call(editPayment, 'PATCH', `/api/patients/p1/installments/${installmentId}`, {
    body,
    params: { id: 'p1', installmentId },
  })
const deletePayment = (installmentId: string) =>
  call(removePayment, 'DELETE', `/api/patients/p1/installments/${installmentId}`, {
    params: { id: 'p1', installmentId },
  })

const charge = (id: string) => db.find('patient_charges', (r) => r.id === id)!
const onlyCharge = () => db.rows('patient_charges')[0]

function setup() {
  aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
  aBilling({ id: 'b1', patient_id: 'p1' })
  aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy', default_price: 0 })
  aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab', default_price: 0 })
  aChargeItem({ id: 'room', name: 'Room', category: 'room', default_price: 2000 })
}

const medicine = (extra = {}) => ({
  patient_billing_id: 'b1',
  charge_item_id: 'med',
  amount: 9000,
  charge_date: TODAY,
  ...extra,
})

describe('adding a lab / medicine charge — the save-time choice', () => {
  it('collects it separately: a Medicine payment, in the ledger with the patient', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    setup()

    const { status, body } = await addCharge(
      medicine({ lab_medicine: { choice: 'collect', payment_method: 'cash' } }),
    )

    expect(status).toBe(201)
    expect(body.lab_medicine).toMatchObject({ kind: 'medicine', status: 'collected', installment_number: 1 })

    const payment = db.rows('patient_billing_installments')[0]
    expect(payment).toMatchObject({
      patient_billing_id: 'b1',
      kind: 'medicine',
      amount: 9000,
      payment_method: 'cash',
      payment_date: TODAY,
      remarks: 'Medicine — Medication (collected separately)',
      created_by: 'u-recep',
    })
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      transaction_type: 'credit',
      source: 'patient',
      amount: 9000,
      patient_id: 'p1',
      description: '12/26 Ramesh Kumar (Medicine)',
    })
    expect(onlyCharge()).toMatchObject({ lab_medicine_status: 'collected', collected_installment_id: payment.id })
    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.patient_paid_amount)).toBe(9000)
  })

  it('tags a lab charge Lab', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'lab',
      amount: 3000,
      charge_date: TODAY,
      lab_medicine: { choice: 'collect', payment_method: 'upi', transaction_reference: 'UPI-5' },
    })

    expect(db.rows('patient_billing_installments')[0]).toMatchObject({ kind: 'lab', payment_method: 'upi' })
    expect(db.rows('daily_ledger_transactions')[0].description).toBe('12/26 Ramesh Kumar (Lab)')
  })

  it('included: nothing is collected — the regular payments cover it', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status, body } = await addCharge(medicine({ lab_medicine: { choice: 'included' } }))

    expect(status).toBe(201)
    expect(body.lab_medicine).toMatchObject({ status: 'included' })
    expect(onlyCharge().lab_medicine_status).toBe('included')
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('with no answer, it stays excluded and waits to be collected', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addCharge(medicine())

    expect(onlyCharge().lab_medicine_status).toBe('to_collect')
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  it('refuses UPI without a reference, and saves nothing', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status, body } = await addCharge(
      medicine({ lab_medicine: { choice: 'collect', payment_method: 'upi' } }),
    )

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty('lab_medicine.transaction_reference')
    expect(db.count('patient_charges')).toBe(0)
  })

  it('removes the charge again if the payment is refused', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    db.failNext('daily_ledger_transactions')

    const { status } = await addCharge(medicine({ lab_medicine: { choice: 'collect', payment_method: 'cash' } }))

    expect(status).toBe(500)
    expect(db.count('patient_charges')).toBe(0)
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  it('asks nothing of other charges', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'room',
      amount: 2000,
      charge_date: TODAY,
      lab_medicine: { choice: 'collect', payment_method: 'cash' },
    })

    expect(onlyCharge().lab_medicine_status).toBeNull()
    expect(db.count('patient_billing_installments')).toBe(0)
  })
})

describe('deciding later — …/charges/[chargeId]/lab-medicine', () => {
  it('collects a charge left to collect', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med', charge_type: 'Medication', amount: 1200, lab_medicine_status: 'to_collect' })

    const { status, body } = await decideCharge('c1', { action: 'collect', payment_method: 'cash' })

    expect(status).toBe(200)
    expect(body.status).toBe('collected')
    expect(db.rows('patient_billing_installments')[0]).toMatchObject({ kind: 'medicine', amount: 1200 })
    expect(charge('c1').lab_medicine_status).toBe('collected')
  })

  it('marks one included, and back to be collected', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'lab', lab_medicine_status: 'to_collect' })

    expect((await decideCharge('c1', { action: 'include' })).status).toBe(200)
    expect(charge('c1').lab_medicine_status).toBe('included')

    expect((await decideCharge('c1', { action: 'to_collect' })).status).toBe(200)
    expect(charge('c1').lab_medicine_status).toBe('to_collect')
  })

  it('refuses to change a collected charge', async () => {
    await signInAs('ADMIN')
    setup()
    anInstallment({ id: 'i1', patient_billing_id: 'b1', kind: 'medicine' })
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med', lab_medicine_status: 'collected', collected_installment_id: 'i1' })

    const { status, body } = await decideCharge('c1', { action: 'include' })

    expect(status).toBe(409)
    expect(body.code).toBe('LAB_MEDICINE_COLLECTED')
  })

  it('refuses a charge that is not lab or medicine', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'room' })

    expect((await decideCharge('c1', { action: 'collect', payment_method: 'cash' })).status).toBe(400)
  })

  it('refuses roles that do not take payments', async () => {
    await signInAs('LAB_TECHNICIAN')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med', lab_medicine_status: 'to_collect' })

    expect((await decideCharge('c1', { action: 'collect', payment_method: 'cash' })).status).toBe(403)
  })
})

describe('a collected charge and its payment stay together', () => {
  function collected() {
    setup()
    aTransaction({ id: 't1', source: 'patient', amount: 9000, patient_id: 'p1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', kind: 'medicine', amount: 9000, ledger_transaction_id: 't1' })
    aCharge({
      id: 'c1',
      patient_id: 'p1',
      patient_billing_id: 'b1',
      charge_item_id: 'med',
      amount: 9000,
      qty: 1,
      lab_medicine_status: 'collected',
      collected_installment_id: 'i1',
    })
  }

  it("won't change the charge's amount", async () => {
    await signInAs('ADMIN')
    collected()

    const { status, body } = await patchCharge('c1', { amount: 8000 })

    expect(status).toBe(409)
    expect(body.code).toBe('LAB_MEDICINE_COLLECTED')
    expect(charge('c1').amount).toBe(9000)
  })

  it('still lets the description be corrected', async () => {
    await signInAs('ADMIN')
    collected()

    expect((await patchCharge('c1', { description: 'Discharge medicines' })).status).toBe(200)
  })

  it("won't delete the charge while its payment exists", async () => {
    await signInAs('ADMIN')
    collected()

    expect((await deleteCharge('c1')).status).toBe(409)
    expect(db.count('patient_charges')).toBe(1)
  })

  it("won't change the payment's amount — it comes from the charge", async () => {
    await signInAs('ADMIN')
    collected()

    const { status, body } = await patchPayment('i1', { amount: 100 })

    expect(status).toBe(400)
    expect(body.code).toBe('LAB_MEDICINE_AMOUNT_FIXED')
  })

  it('deleting the payment puts the charge back to "to collect"', async () => {
    await signInAs('ADMIN')
    collected()

    expect((await deletePayment('i1')).status).toBe(200)

    expect(charge('c1')).toMatchObject({ lab_medicine_status: 'to_collect', collected_installment_id: null })
    expect(db.count('daily_ledger_transactions')).toBe(0)
    // …after which the charge can be corrected or removed.
    expect((await deleteCharge('c1')).status).toBe(200)
  })
})

describe('payment labels', () => {
  it('records the label the desk picks', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addPayment({ patient_billing_id: 'b1', amount: 10000, kind: 'advance' })

    expect(db.rows('patient_billing_installments')[0].kind).toBe('advance')
    expect(db.rows('daily_ledger_transactions')[0].description).toBe('12/26 Ramesh Kumar (Advance)')
  })

  it('defaults to Regular, and reads the old "payment" as Regular', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addPayment({ patient_billing_id: 'b1', amount: 100 })
    await addPayment({ patient_billing_id: 'b1', amount: 100, kind: 'payment' })

    expect(db.rows('patient_billing_installments').map((r) => r.kind)).toEqual(['regular', 'regular'])
  })

  it('refuses Lab and Medicine by hand — they come from a charge', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    expect((await addPayment({ patient_billing_id: 'b1', amount: 100, kind: 'medicine' })).status).toBe(400)
    expect((await addPayment({ patient_billing_id: 'b1', amount: 100, kind: 'lab' })).status).toBe(400)
    expect((await addPayment({ patient_billing_id: 'b1', amount: 100, kind: 'bogus' })).status).toBe(400)
  })

  it('relabels a desk payment, and the ledger follows', async () => {
    await signInAs('ADMIN')
    setup()
    aTransaction({ id: 't1', source: 'patient', patient_id: 'p1', description: '12/26 Ramesh Kumar (Regular)' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', kind: 'regular', ledger_transaction_id: 't1' })

    expect((await patchPayment('i1', { kind: 'discharge' })).status).toBe(200)

    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.kind).toBe('discharge')
    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.description).toBe('12/26 Ramesh Kumar (Discharge)')
  })

  it('keeps an app-set label', async () => {
    await signInAs('ADMIN')
    setup()
    anInstallment({ id: 'i1', patient_billing_id: 'b1', kind: 'registration' })

    expect((await patchPayment('i1', { kind: 'regular' })).status).toBe(400)
  })
})

describe('forwarding a quote', () => {
  it('brings lab and medicine lines in as "to collect"', async () => {
    await signInAs('ADMIN')
    setup()
    aChargeSheet({ id: 's1', patient_id: 'p1' })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'med', charge_name: 'Medication', unit_price: 900 })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'room', charge_name: 'Room', unit_price: 2000 })

    const { status } = await call(forwardSheet, 'POST', '/api/charge-sheets/s1/forward', { params: { id: 's1' } })

    expect(status).toBe(200)
    const rows = db.rows('patient_charges')
    expect(rows.find((r) => r.charge_item_id === 'med')!.lab_medicine_status).toBe('to_collect')
    expect(rows.find((r) => r.charge_item_id === 'room')!.lab_medicine_status).toBeNull()
    expect(db.count('patient_billing_installments')).toBe(0)
  })
})
