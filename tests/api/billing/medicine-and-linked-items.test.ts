/**
 * Round 8 (client, 26 Sep): medicine is always an expense, and lab tests and
 * the registration fee reach Charges only with their payment.
 *
 *   medicine      saved like any charge, no question asked; the desk is told
 *                 "Added as an expense only."
 *   lab / reg     refused in the Charges form — they are added on the Payments
 *                 tab, which writes the charge line with the payment
 *                 (tests/api/billing/installments.test.ts covers that half)
 *   forwarding    a quote's lab lines are not forwarded; medicine lines are
 */

import { describe, it, expect } from 'vitest'
import { POST as createCharge } from '@/app/api/patients/[id]/charges/route'
import { PATCH as editCharge, DELETE as removeCharge } from '@/app/api/patients/[id]/charges/[chargeId]/route'
import { POST as createPayment } from '@/app/api/patients/[id]/installments/route'
import { PATCH as editPayment } from '@/app/api/patients/[id]/installments/[installmentId]/route'
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
const addPayment = (body: unknown) =>
  call(createPayment, 'POST', '/api/patients/p1/installments', { body, params: { id: 'p1' } })
const patchPayment = (installmentId: string, body: unknown) =>
  call(editPayment, 'PATCH', `/api/patients/p1/installments/${installmentId}`, {
    body,
    params: { id: 'p1', installmentId },
  })
const charge = (id: string) => db.find('patient_charges', (r) => r.id === id)!

function setup() {
  aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
  aBilling({ id: 'b1', patient_id: 'p1' })
  aChargeItem({ id: 'med', name: 'Medication', category: 'pharmacy', default_price: 0 })
  aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab', default_price: 0 })
  aChargeItem({ id: 'reg', name: 'Registration', category: 'registration', is_registration_fee: true, default_price: 300 })
  aChargeItem({ id: 'room', name: 'Room', category: 'room', default_price: 2000 })
}

describe('a medicine charge', () => {
  it('is saved with no question, and the desk is told it is an expense only', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    setup()

    const { status, body } = await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'med',
      amount: 9000,
      charge_date: TODAY,
    })

    expect(status).toBe(201)
    expect(body.message).toBe('Added as an expense only.')
    expect(body.medicine_expense).toBe(true)
    expect(db.rows('patient_charges')).toEqual([
      expect.objectContaining({ charge_item_id: 'med', amount: 9000 }),
    ])
    // An expense, not a payment: nothing reaches Payments or the Ledger.
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('ignores the old save-time answer if an older screen still sends one', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status } = await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'med',
      amount: 900,
      charge_date: TODAY,
      lab_medicine: { choice: 'direct' },
    })

    expect(status).toBe(201)
    expect(db.count('patient_charges')).toBe(1)
  })

  it('is an ordinary charge afterwards: corrected and deleted like any other', async () => {
    await signInAs('ADMIN')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med', amount: 9000, qty: 1 })

    expect((await patchCharge('c1', { amount: 8000 })).status).toBe(200)
    expect(Number(charge('c1').amount)).toBe(8000)
    expect((await deleteCharge('c1')).status).toBe(200)
    expect(db.count('patient_charges')).toBe(0)
  })

  it('says nothing special for other charges', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { body } = await addCharge({ patient_billing_id: 'b1', charge_item_id: 'room', amount: 2000, charge_date: TODAY })

    expect(body.message).toBe('Charge added')
    expect(body.medicine_expense).toBeUndefined()
  })
})

describe('lab tests and the registration fee are not added in Charges', () => {
  it.each([
    ['a lab test', 'lab'],
    ['the registration fee', 'reg'],
  ])('refuses %s, pointing the desk at the Payments tab', async (_label, itemId) => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status, body } = await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: itemId,
      amount: 300,
      charge_date: TODAY,
    })

    expect(status).toBe(400)
    expect(body.code).toBe('LINKED_CHARGE_ITEM')
    expect(body.error).toMatch(/Payments tab/)
    expect(db.count('patient_charges')).toBe(0)
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

  it('accepts Lab (round 8), and still refuses Medicine and anything unknown', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    expect((await addPayment({ patient_billing_id: 'b1', amount: 100, kind: 'lab' })).status).toBe(200)
    expect((await addPayment({ patient_billing_id: 'b1', amount: 100, kind: 'medicine' })).status).toBe(400)
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

  it('never turns a desk payment into Lab or Registration, or back', async () => {
    await signInAs('ADMIN')
    setup()
    anInstallment({ id: 'i1', patient_billing_id: 'b1', kind: 'regular' })
    anInstallment({ id: 'i2', patient_billing_id: 'b1', kind: 'registration', installment_number: 2 })

    expect((await patchPayment('i1', { kind: 'lab' })).status).toBe(400)
    expect((await patchPayment('i2', { kind: 'regular' })).status).toBe(400)
  })
})

describe('forwarding a quote', () => {
  it('forwards medicine and other lines, and leaves lab lines for the Payments tab', async () => {
    await signInAs('ADMIN')
    setup()
    aChargeSheet({ id: 's1', patient_id: 'p1' })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'med', charge_name: 'Medication', unit_price: 900 })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'room', charge_name: 'Room', unit_price: 2000 })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'lab', charge_name: 'Lab Test', unit_price: 400 })

    const { status, body } = await call(forwardSheet, 'POST', '/api/charge-sheets/s1/forward', { params: { id: 's1' } })

    expect(status).toBe(200)
    expect(body.lab_lines_skipped).toBe(1)
    expect(body.message).toMatch(/1 lab line/)
    expect(db.rows('patient_charges').map((r) => r.charge_item_id).sort()).toEqual(['med', 'room'])
    expect(db.count('patient_billing_installments')).toBe(0)
  })
})
