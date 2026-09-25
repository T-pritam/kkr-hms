/**
 * Lab and medicine charges — included, or paid straight to the lab (PRD v2
 * CR-15), and payment labels.
 *
 * The client reversed both halves of this on 2026-09-24. It used to be three
 * answers and a payment: *excluded* meant collecting the money at the desk as
 * its own installment tagged Lab or Medicine, and *included* meant the hospital
 * kept it as income. It is now two answers and no payment at all:
 *
 *   included → the charge is saved and the amount is the **hospital's expense**,
 *              because the patient's payments covered it and the lab bills us
 *   direct   → **nothing is recorded**, not even the charge: the patient paid
 *              the lab themselves and that money never came near the hospital
 *
 * So the tests below are mostly about what is *not* written.
 */

import { describe, it, expect } from 'vitest'
import { POST as createCharge } from '@/app/api/patients/[id]/charges/route'
import { PATCH as editCharge, DELETE as removeCharge } from '@/app/api/patients/[id]/charges/[chargeId]/route'
import { POST as decide } from '@/app/api/patients/[id]/charges/[chargeId]/lab-medicine/route'
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
const decideCharge = (chargeId: string, body: unknown) =>
  call(decide, 'POST', `/api/patients/p1/charges/${chargeId}/lab-medicine`, { body, params: { id: 'p1', chargeId } })
const addPayment = (body: unknown) =>
  call(createPayment, 'POST', '/api/patients/p1/installments', { body, params: { id: 'p1' } })
const patchPayment = (installmentId: string, body: unknown) =>
  call(editPayment, 'PATCH', `/api/patients/p1/installments/${installmentId}`, {
    body,
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
  it("included: the charge is saved, and it is the hospital's expense", async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    setup()

    const { status, body } = await addCharge(medicine({ lab_medicine: { choice: 'included' } }))

    expect(status).toBe(201)
    expect(body.lab_medicine).toMatchObject({ kind: 'medicine', status: 'included' })
    expect(onlyCharge()).toMatchObject({ lab_medicine_status: 'included', amount: 9000 })

    // No payment and no ledger row: the patient paid us nothing extra for it.
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('paid directly to the lab: nothing at all is recorded', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status, body } = await addCharge(medicine({ lab_medicine: { choice: 'direct' } }))

    expect(status).toBe(200)
    expect(body.recorded).toBe(false)
    expect(body.lab_medicine).toMatchObject({ kind: 'medicine', status: 'direct' })

    // The point of the reversal: no charge, no payment, no ledger entry.
    expect(db.count('patient_charges')).toBe(0)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('records nothing for a whole date range answered "paid directly"', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status } = await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'med',
      amount: 500,
      billing_mode: 'per_day',
      from_date: '2026-03-01',
      to_date: '2026-03-05',
      lab_medicine: { choice: 'direct' },
    })

    expect(status).toBe(200)
    expect(db.count('patient_charges')).toBe(0)
  })

  it('a lab charge answers the same question', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'lab',
      amount: 3000,
      charge_date: TODAY,
      lab_medicine: { choice: 'included' },
    })

    expect(onlyCharge()).toMatchObject({ lab_medicine_status: 'included', charge_item_id: 'lab' })
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  it('with no answer it is saved, but not decided — so it is nobody\u2019s expense yet', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    await addCharge(medicine())

    expect(onlyCharge()).toMatchObject({ lab_medicine_status: null, amount: 9000 })
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  it('refuses an answer that is neither', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status, body } = await addCharge(medicine({ lab_medicine: { choice: 'collect' } }))

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty('lab_medicine.choice')
    expect(db.count('patient_charges')).toBe(0)
  })

  it('asks nothing of other charges', async () => {
    await signInAs('RECEPTIONIST')
    setup()

    const { status } = await addCharge({
      patient_billing_id: 'b1',
      charge_item_id: 'room',
      amount: 2000,
      charge_date: TODAY,
      // Even answered "direct", a room charge is saved: the question is not its.
      lab_medicine: { choice: 'direct' },
    })

    expect(status).toBe(201)
    expect(onlyCharge().lab_medicine_status).toBeNull()
    expect(db.count('patient_billing_installments')).toBe(0)
  })
})

describe('deciding later — …/charges/[chargeId]/lab-medicine', () => {
  it('marks one included, and back to not decided', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'lab' })

    expect((await decideCharge('c1', { action: 'include' })).status).toBe(200)
    expect(charge('c1').lab_medicine_status).toBe('included')

    expect((await decideCharge('c1', { action: 'clear' })).status).toBe(200)
    expect(charge('c1').lab_medicine_status).toBeNull()
  })

  /**
   * The client's wording: admin and reception can change this at any time. There
   * is no own-row rule and no discharge lock, because it is a running correction
   * to what the hospital owes and whoever notices it is rarely whoever typed it.
   */
  it('lets reception change a charge an admin entered', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    setup()
    aCharge({
      id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med',
      created_by: 'u-admin', lab_medicine_status: 'included',
    })

    expect((await decideCharge('c1', { action: 'clear' })).status).toBe(200)
    expect(charge('c1').lab_medicine_status).toBeNull()
  })

  it('refuses a charge that is not lab or medicine', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'room' })

    expect((await decideCharge('c1', { action: 'include' })).status).toBe(400)
  })

  it('refuses an action it does not know', async () => {
    await signInAs('RECEPTIONIST')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med' })

    expect((await decideCharge('c1', { action: 'collect', payment_method: 'cash' })).status).toBe(400)
  })

  it('refuses roles that do not take payments', async () => {
    await signInAs('LAB_TECHNICIAN')
    setup()
    aCharge({ id: 'c1', patient_id: 'p1', patient_billing_id: 'b1', charge_item_id: 'med' })

    expect((await decideCharge('c1', { action: 'include' })).status).toBe(403)
  })
})

describe('an included charge is an ordinary charge', () => {
  function included() {
    setup()
    aCharge({
      id: 'c1',
      patient_id: 'p1',
      patient_billing_id: 'b1',
      charge_item_id: 'med',
      amount: 9000,
      qty: 1,
      lab_medicine_status: 'included',
    })
  }

  // Nothing was collected for it, so nothing disagrees when it changes. The
  // guards that refused this (LAB_MEDICINE_COLLECTED, LAB_MEDICINE_AMOUNT_FIXED)
  // existed only to protect a payment that no longer exists.
  it('can have its amount corrected', async () => {
    await signInAs('ADMIN')
    included()

    expect((await patchCharge('c1', { amount: 8000 })).status).toBe(200)
    expect(Number(charge('c1').amount)).toBe(8000)
    expect(charge('c1').lab_medicine_status).toBe('included')
  })

  it('can be deleted', async () => {
    await signInAs('ADMIN')
    included()

    expect((await deleteCharge('c1')).status).toBe(200)
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

  // The Lab and Medicine labels are gone with the payments they described.
  it('refuses a label it does not know, Lab and Medicine among them', async () => {
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
  /**
   * A forwarded charge arrives *not decided*. The sheet was a quote, so nobody
   * has yet said whether the hospital carries it — and defaulting it to
   * Included would silently book an expense that nobody agreed to.
   */
  it('brings lab and medicine lines in undecided', async () => {
    await signInAs('ADMIN')
    setup()
    aChargeSheet({ id: 's1', patient_id: 'p1' })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'med', charge_name: 'Medication', unit_price: 900 })
    aChargeSheetItem({ charge_sheet_id: 's1', charge_item_id: 'room', charge_name: 'Room', unit_price: 2000 })

    const { status } = await call(forwardSheet, 'POST', '/api/charge-sheets/s1/forward', { params: { id: 's1' } })

    expect(status).toBe(200)
    const rows = db.rows('patient_charges')
    expect(rows.find((r) => r.charge_item_id === 'med')!.lab_medicine_status).toBeNull()
    expect(rows.find((r) => r.charge_item_id === 'room')!.lab_medicine_status).toBeNull()
    expect(db.count('patient_billing_installments')).toBe(0)
  })
})
