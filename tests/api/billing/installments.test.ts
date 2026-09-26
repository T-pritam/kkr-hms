/**
 * /api/patients/[id]/installments — patient payments against a billing record.
 */

import { describe, it, expect } from 'vitest'
import { GET as listInstallments, POST as createInstallment } from '@/app/api/patients/[id]/installments/route'
import {
  PATCH as editInstallment,
  DELETE as removeInstallment,
} from '@/app/api/patients/[id]/installments/[installmentId]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aChargeItem, aPatient, anInstallment, aTransaction, aUser } from '../../helpers/seed'
import {
  PATCH as editCharge,
  DELETE as removeCharge,
} from '@/app/api/patients/[id]/charges/[chargeId]/route'
import { TODAY } from '../../setup'

const list = (patientId: string, query = {}) =>
  call(listInstallments, 'GET', `/api/patients/${patientId}/installments`, { params: { id: patientId }, query })

const create = (patientId: string, body: unknown) =>
  call(createInstallment, 'POST', `/api/patients/${patientId}/installments`, { body, params: { id: patientId } })

const edit = (patientId: string, installmentId: string, body: unknown) =>
  call(editInstallment, 'PATCH', `/api/patients/${patientId}/installments/${installmentId}`, {
    body,
    params: { id: patientId, installmentId },
  })

const remove = (patientId: string, installmentId: string) =>
  call(removeInstallment, 'DELETE', `/api/patients/${patientId}/installments/${installmentId}`, {
    params: { id: patientId, installmentId },
  })

const paidAmount = (billingId = 'b1') =>
  Number(db.find('patient_billing', (r) => r.id === billingId)!.patient_paid_amount)

describe('installments — authentication', () => {
  it('rejects unauthenticated access to every verb', async () => {
    signOut()

    expect((await list('p1', { billing_id: 'b1' })).status).toBe(401)
    expect((await create('p1', {})).status).toBe(401)
    expect((await edit('p1', 'i1', {})).status).toBe(401)
    expect((await remove('p1', 'i1')).status).toBe(401)
  })
})

describe('GET /api/patients/[id]/installments', () => {
  it('requires billing_id', async () => {
    await signInAs('NURSE')

    const { status, body } = await list('p1')
    expect(status).toBe(400)
    expect(body.error).toBe('billing_id is required')
  })

  it('returns the billing record’s installments in payment order', async () => {
    await signInAs('NURSE')
    anInstallment({ id: 'i2', patient_billing_id: 'b1', installment_number: 2 })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', installment_number: 1 })

    const { status, body } = await list('p1', { billing_id: 'b1' })

    expect(status).toBe(200)
    expect(body.map((i: any) => i.id)).toEqual(['i1', 'i2'])
  })

  it('does not return another billing record’s installments', async () => {
    await signInAs('NURSE')
    anInstallment({ id: 'i1', patient_billing_id: 'b1' })
    anInstallment({ id: 'i2', patient_billing_id: 'b2' })

    expect((await list('p1', { billing_id: 'b1' })).body.map((i: any) => i.id)).toEqual(['i1'])
  })

  it('embeds the creating user', async () => {
    await signInAs('NURSE')
    aUser({ id: 'u1', username: 'reception' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', created_by: 'u1' })

    expect((await list('p1', { billing_id: 'b1' })).body[0].users).toEqual({ id: 'u1', username: 'reception' })
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('NURSE')
    db.failNext('patient_billing_installments')

    expect((await list('p1', { billing_id: 'b1' })).status).toBe(500)
  })

  /**
   * A payment locks when its own ledger entry is Closed (§3.2 row 9). Dates
   * stopped locking anything with day close (CR-08), so the list decorates each
   * payment with that one fact rather than making the client work it out.
   */
  it('flags each installment with whether its ledger entry is closed', async () => {
    await signInAs('NURSE')
    aTransaction({ id: 't1', source: 'patient', status: 'closed' })
    aTransaction({ id: 't2', source: 'patient', status: 'open' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', ledger_transaction_id: 't1' })
    anInstallment({ id: 'i2', patient_billing_id: 'b1', ledger_transaction_id: 't2' })
    anInstallment({ id: 'i3', patient_billing_id: 'b1', ledger_transaction_id: null })

    const { body } = await list('p1', { billing_id: 'b1' })

    expect(body.find((i: any) => i.id === 'i1').entry_closed).toBe(true)
    expect(body.find((i: any) => i.id === 'i2').entry_closed).toBe(false)
    expect(body.find((i: any) => i.id === 'i3').entry_closed).toBe(false)
  })
})

describe('POST /api/patients/[id]/installments', () => {
  it('records the payment against the billing record', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      payment_date: '2026-03-12',
      payment_method: 'upi',
      transaction_reference: 'UPI-123',
      remarks: 'First payment',
    })

    expect(status).toBe(200)
    expect(db.rows('patient_billing_installments')[0]).toMatchObject({
      patient_billing_id: 'b1',
      installment_number: 1,
      amount: 5000,
      payment_date: '2026-03-12',
      payment_method: 'upi',
      transaction_reference: 'UPI-123',
      remarks: 'First payment',
      created_by: 'u-recep',
    })
  })

  it('defaults the date to today and the method to cash', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', { patient_billing_id: 'b1', amount: 1000 })

    expect(db.rows('patient_billing_installments')[0]).toMatchObject({
      payment_date: TODAY,
      payment_method: 'cash',
    })
  })

  it('numbers installments sequentially', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', { patient_billing_id: 'b1', amount: 1000 })
    await create('p1', { patient_billing_id: 'b1', amount: 2000 })
    await create('p1', { patient_billing_id: 'b1', amount: 500 })

    expect(db.rows('patient_billing_installments').map((i) => i.installment_number)).toEqual([1, 2, 3])
  })

  it('numbers per billing record, not globally', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aBilling({ id: 'b2', patient_id: 'p1' })
    anInstallment({ patient_billing_id: 'b2', installment_number: 7 })

    await create('p1', { patient_billing_id: 'b1', amount: 1000 })

    expect(db.rows('patient_billing_installments').find((i) => i.patient_billing_id === 'b1')!.installment_number).toBe(1)
  })

  it('re-sums patient_paid_amount from scratch after each payment', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1', patient_paid_amount: 0 })

    await create('p1', { patient_billing_id: 'b1', amount: 3000 })
    expect(paidAmount()).toBe(3000)

    await create('p1', { patient_billing_id: 'b1', amount: 2000 })
    expect(paidAmount()).toBe(5000)
  })

  it('self-heals a patient_paid_amount that had drifted', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1', patient_paid_amount: 99999 })
    anInstallment({ patient_billing_id: 'b1', amount: 1000, installment_number: 1 })

    await create('p1', { patient_billing_id: 'b1', amount: 500 })

    expect(paidAmount()).toBe(1500)
  })

  it('returns 500 when the insert fails', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })
    db.failNext('patient_billing_installments') // the next-number lookup
    db.failNext('patient_billing_installments') // the insert itself

    expect((await create('p1', { patient_billing_id: 'b1', amount: 100 })).status).toBe(500)
  })

  /**
   * There is no balance to exceed. Charges are for internal knowledge and move
   * no money (CR-15; the client, Q-64: "charge has nothing to do with the
   * balance and patient payments"), and the total bill *is* the payments
   * received. So a payment larger than the charges is simply a payment — the
   * old expectation that it be refused (BUGS #19's second half) was retired
   * with the balance itself.
   */
  it('never caps a payment by the charges — they are internal (CR-15)', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1', total_charges: 1000, patient_paid_amount: 0 })

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 50000 })

    expect(status).toBe(200)
    expect(paidAmount()).toBe(50000)
  })

  /** Was BUGS.md #19 (the zero/negative half). Rejected before anything is written. */
  it('rejects a zero or negative payment and saves nothing', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    expect((await create('p1', { patient_billing_id: 'b1', amount: 0 })).status).toBe(400)
    expect((await create('p1', { patient_billing_id: 'b1', amount: -500 })).status).toBe(400)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  /** PRD v2 gap G-06: the bill used to come from the body, unchecked against the URL. */
  it("refuses a bill that belongs to a different patient", async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b-other', patient_id: 'p2' })

    const { status, body } = await create('p1', { patient_billing_id: 'b-other', amount: 1000 })

    expect(status).toBe(404)
    expect(body.error).toBe('That billing record does not belong to this patient')
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  it('requires patient_billing_id', async () => {
    await signInAs('RECEPTIONIST')

    expect((await create('p1', { amount: 1000 })).status).toBe(400)
  })

  /** PRD v2 gap G-08: any signed-in role, a lab technician included, could take money. */
  it('refuses roles that do not take payments', async () => {
    await signInAs('LAB_TECHNICIAN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    expect((await create('p1', { patient_billing_id: 'b1', amount: 1000 })).status).toBe(403)
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  it('rejects an unknown payment kind', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    expect((await create('p1', { patient_billing_id: 'b1', amount: 1000, kind: 'refund' })).status).toBe(400)
  })
})

describe('POST /api/patients/[id]/installments — ledger side effect', () => {
  it('writes a matching credit into the daily ledger when asked', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      payment_date: '2026-03-12',
      payment_method: 'upi',
      transaction_reference: 'UPI-123',
      remarks: 'First payment',
      create_ledger_entry: true,
    })

    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      transaction_date: '2026-03-12',
      transaction_type: 'credit',
      source: 'patient',
      amount: 5000,
      payment_mode: 'upi',
      reference_number: 'UPI-123',
      patient_id: 'p1',
      // Identifies the patient rather than the installment count — the
      // source/patient_id columns already say "patient, and an installment".
      description: '12/26 Ramesh Kumar (Regular)',
      status: 'open',
      created_by: 'u-recep',
    })
  })

  /**
   * The only way to later ask "has this payment been verified" is if the
   * installment remembers which ledger row it created.
   */
  it('links the installment to the ledger credit it just created', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      create_ledger_entry: true,
    })

    const installment = db.rows('patient_billing_installments')[0]
    const transaction = db.rows('daily_ledger_transactions')[0]
    expect(installment.ledger_transaction_id).toBe(transaction.id)
  })

  /**
   * PRD v2 CR-12 / gap G-07. The ledger credit used to be optional
   * (`create_ledger_entry`) although no screen ever offered the choice. A payment
   * and its credit are one record now, whatever the request says.
   */
  it('always writes and links the ledger credit, even if create_ledger_entry is false', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', { patient_billing_id: 'b1', amount: 5000, create_ledger_entry: false })

    const transaction = db.rows('daily_ledger_transactions')[0]
    expect(transaction).toMatchObject({ source: 'patient', amount: 5000 })
    expect(db.rows('patient_billing_installments')[0].ledger_transaction_id).toBe(transaction.id)
  })

  it('falls back to a generic description if the patient cannot be found', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'missing-patient' })

    await create('missing-patient', {
      patient_billing_id: 'b1',
      amount: 5000,
      create_ledger_entry: true,
    })

    expect(db.rows('daily_ledger_transactions')[0].description).toBe('Patient installment payment #1 (Regular)')
  })

  /**
   * PRD v2 gap G-04. If the ledger write fails after the installment is saved,
   * the installment is removed again — a payment is never counted in "Paid"
   * without its credit.
   */
  it('removes the installment again when the ledger write fails', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1', patient_paid_amount: 0 })
    db.failNext('daily_ledger_transactions')

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 5000 })

    expect(status).toBe(500)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(paidAmount()).toBe(0)
  })

  /**
   * Q-22: a payment may be dated any past day. Its credit lands Open and waits
   * for the admin's close, exactly like one recorded today.
   */
  it('accepts a backdated payment, and its credit waits to be closed', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      payment_date: '2026-03-12',
      create_ledger_entry: true,
    })

    expect(status).toBe(200)
    const credit = db.rows('daily_ledger_transactions').find((t) => t.source === 'patient')!
    expect(credit).toMatchObject({ transaction_date: '2026-03-12', status: 'open' })
    expect(db.count('patient_billing_installments')).toBe(1)
  })

  /**
   * Was BUGS.md #20 — this path skipped the UPI reference rule the ledger's own
   * POST enforces. Now checked before anything is written (G-04): the payment
   * used to be saved and counted first, then the ledger refused it.
   */
  it('should require a reference number for a UPI payment, and save nothing without one', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1', patient_paid_amount: 0 })

    const { status, body } = await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      payment_method: 'upi',
      create_ledger_entry: true,
    })

    expect(status).toBe(400)
    expect(body.fieldErrors.transaction_reference).toBeTruthy()
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(paidAmount()).toBe(0)
  })
})

/**
 * Client, 26 Sep: a payment, registration fee or lab test an admin takes on
 * the patient's page used to close its ledger row on the spot. Every row now
 * starts Open and waits for "Mark closed", whoever entered it.
 */
describe('POST /api/patients/[id]/installments — the ledger row starts Open', () => {
  it.each(['regular', 'lab', 'registration'] as const)('for an admin taking a %s payment', async (kind) => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
    aBilling({ id: 'b1', patient_id: 'p1', registration_fee_status: 'pending' })
    aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab' })
    aChargeItem({ id: 'reg', name: 'Registration', category: 'registration', is_registration_fee: true })

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 300, kind })

    expect(status).toBe(200)
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({ status: 'open', closed_at: null, closed_by: null })
  })
})

describe('POST /api/patients/[id]/installments — registration fee (PRD v2 CR-11)', () => {
  it('books kind registration under the registration ledger source and marks the fee collected', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
    aBilling({ id: 'b1', patient_id: 'p1', registration_fee_status: 'pending' })
    aChargeItem({ id: 'reg', name: 'Registration', category: 'registration', is_registration_fee: true, default_price: 300 })

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 100, kind: 'registration' })

    expect(status).toBe(200)
    // The third line (round 8): collected means it is in Charges too.
    expect(db.rows('patient_charges')).toEqual([
      expect.objectContaining({ charge_item_id: 'reg', charge_type: 'Registration', amount: 100, qty: 1 }),
    ])
    expect(db.rows('patient_billing_installments')[0]).toMatchObject({ kind: 'registration', amount: 100 })
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({
      source: 'registration',
      transaction_type: 'credit',
      amount: 100,
      patient_id: 'p1',
      created_by: 'u-recep',
    })
    expect(db.find('patient_billing', (r) => r.id === 'b1')!.registration_fee_status).toBe('collected')
  })

  it('refuses a second registration payment on the same bill', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })
    anInstallment({ patient_billing_id: 'b1', kind: 'registration', amount: 100 })

    const { status, body } = await create('p1', { patient_billing_id: 'b1', amount: 100, kind: 'registration' })

    expect(status).toBe(409)
    expect(body.code).toBe('REGISTRATION_ALREADY_PAID')
    expect(db.count('patient_billing_installments')).toBe(1)
  })

  it('defaults to an ordinary payment', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })

    await create('p1', { patient_billing_id: 'b1', amount: 100 })

    expect(db.rows('patient_billing_installments')[0].kind).toBe('regular')
  })
})

describe('PATCH /api/patients/[id]/installments/[installmentId]', () => {
  it('returns 404 for an unknown installment', async () => {
    await signInAs('ADMIN')

    const { status, body } = await edit('p1', 'missing', { amount: 100 })
    expect(status).toBe(404)
    expect(body.error).toBe('Installment not found')
  })

  it('lets the creator edit their own installment', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aBilling({ id: 'b1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', created_by: 'u-recep', amount: 1000 })

    const { status } = await edit('p1', 'i1', { amount: 2500, payment_date: TODAY, payment_method: 'cash' })

    expect(status).toBe(200)
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.amount).toBe(2500)
  })

  it('refuses when the caller is neither creator nor admin', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', created_by: 'someone-else', amount: 1000 })

    const { status, body } = await edit('p1', 'i1', { amount: 999999 })

    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.amount).toBe(1000)
  })

  it('re-sums patient_paid_amount after the edit', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_paid_amount: 1000 })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000 })

    await edit('p1', 'i1', { amount: 2500 })

    expect(paidAmount()).toBe(2500)
  })

  /**
   * A partial edit. The old test here asserted the opposite ("blanks the fields
   * the caller omits"), which was only ever true of the in-memory fake — real
   * PostgREST drops undefined keys and leaves them as they were.
   */
  it('keeps the fields the caller omits', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', remarks: 'Original note', transaction_reference: 'REF-1' })

    await edit('p1', 'i1', { amount: 1000 })

    const stored = db.find('patient_billing_installments', (r) => r.id === 'i1')!
    expect(stored.remarks).toBe('Original note')
    expect(stored.transaction_reference).toBe('REF-1')
  })

  it('rejects an edit to a zero amount', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000 })

    expect((await edit('p1', 'i1', { amount: 0 })).status).toBe(400)
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.amount).toBe(1000)
  })

  /**
   * A payment on a day an admin has already closed is reconciled — editing it
   * here would silently disagree with that closure, the same rule creating a
   * new entry on a closed day already enforces.
   */
  /** A closed entry is reopened by an admin before its payment can move. */
  it('refuses to edit a payment whose ledger entry is closed', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    aTransaction({ id: 't1', source: 'patient', status: 'closed' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, ledger_transaction_id: 't1' })

    const { status, body } = await edit('p1', 'i1', { amount: 2500 })

    expect(status).toBe(409)
    expect(body.code).toBe('ENTRY_LOCKED')
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.amount).toBe(1000)
  })

  // Q-22: backdating is fine now — the entry simply stays Open.
  it('lets a payment be moved to an earlier date', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, payment_date: TODAY })

    const { status } = await edit('p1', 'i1', { amount: 1000, payment_date: '2026-03-12' })

    expect(status).toBe(200)
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.payment_date).toBe('2026-03-12')
  })

  it('still lets a payment on an open entry be edited', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    aTransaction({ id: 't1', source: 'patient', status: 'open' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, ledger_transaction_id: 't1' })

    const { status } = await edit('p1', 'i1', { amount: 2500 })

    expect(status).toBe(200)
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.amount).toBe(2500)
  })

  /** Was BUGS.md #21. The payment and its credit move together (PRD v2 CR-12). */
  it('keeps the linked ledger entry in step with the edit', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aTransaction({ id: 't1', source: 'patient', amount: 1000, patient_id: 'p1', transaction_date: TODAY })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, installment_number: 1, ledger_transaction_id: 't1' })

    await edit('p1', 'i1', {
      amount: 2500,
      payment_method: 'upi',
      transaction_reference: 'UPI-9',
      payment_date: '2026-03-14',
      remarks: 'corrected',
    })

    expect(db.find('daily_ledger_transactions', (r) => r.id === 't1')).toMatchObject({
      amount: 2500,
      payment_mode: 'upi',
      reference_number: 'UPI-9',
      transaction_date: '2026-03-14',
      notes: 'corrected',
    })
  })

  /** A payment written before credits were mandatory gets one the first time it is edited. */
  it('creates the missing ledger entry for a payment that never had one', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, installment_number: 1, ledger_transaction_id: null })

    await edit('p1', 'i1', { amount: 1200 })

    const transaction = db.rows('daily_ledger_transactions')[0]
    expect(transaction).toMatchObject({ source: 'patient', amount: 1200, patient_id: 'p1', description: '12/26 Ramesh Kumar (Regular)' })
    expect(db.find('patient_billing_installments', (r) => r.id === 'i1')!.ledger_transaction_id).toBe(transaction.id)
  })
})

describe('DELETE /api/patients/[id]/installments/[installmentId]', () => {
  it('returns 404 for an unknown installment', async () => {
    await signInAs('ADMIN')

    const { status, body } = await remove('p1', 'missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Installment not found')
  })

  it('deletes and re-sums the paid amount', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_paid_amount: 3000 })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000 })
    anInstallment({ id: 'i2', patient_billing_id: 'b1', amount: 2000 })

    const { status, body } = await remove('p1', 'i1')

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(db.count('patient_billing_installments')).toBe(1)
    expect(paidAmount()).toBe(2000)
  })

  it('drops the paid amount to zero when the last installment goes', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_paid_amount: 1000 })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000 })

    await remove('p1', 'i1')
    expect(paidAmount()).toBe(0)
  })

  it('refuses when the caller is neither creator nor admin', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', created_by: 'someone-else' })

    expect((await remove('p1', 'i1')).status).toBe(403)
    expect(db.count('patient_billing_installments')).toBe(1)
  })

  it('refuses to delete a payment whose ledger entry is closed', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    aTransaction({ id: 't1', source: 'patient', status: 'closed' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, ledger_transaction_id: 't1' })

    const { status, body } = await remove('p1', 'i1')

    expect(status).toBe(409)
    expect(body.code).toBe('ENTRY_LOCKED')
    expect(db.count('patient_billing_installments')).toBe(1)
  })

  /** Was BUGS.md #21. Deleting the payment deletes its credit (PRD v2 CR-12). */
  it('removes the linked ledger entry too', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aTransaction({ id: 't1', source: 'patient', amount: 1000, patient_id: 'p1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, installment_number: 1, ledger_transaction_id: 't1' })

    await remove('p1', 'i1')

    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('puts the registration fee back to not collected when its payment is deleted', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1', registration_fee_status: 'collected' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 100, kind: 'registration' })

    await remove('p1', 'i1')

    expect(db.find('patient_billing', (r) => r.id === 'b1')!.registration_fee_status).toBe('pending')
  })
})

/**
 * Lab tests and the registration fee (round 8): one payment, three lines —
 * Charges (for reference), Payments, Ledger — kept in step by the payment.
 */
describe('lab and registration payments write their Charges line (round 8)', () => {
  const labItem = () =>
    aChargeItem({ id: 'lab', name: 'Lab Test', category: 'lab', default_price: 0 })

  const setUp = async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    labItem()
  }

  it('writes the payment, its own Lab ledger row and a Charges line together', async () => {
    await setUp()

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      amount: 450,
      kind: 'lab',
      remarks: 'CBC, blood sugar',
    })

    expect(status).toBe(200)
    const payment = db.rows('patient_billing_installments')[0]
    expect(payment).toMatchObject({ kind: 'lab', amount: 450 })
    expect(db.rows('daily_ledger_transactions')).toEqual([
      expect.objectContaining({ source: 'lab', transaction_type: 'credit', amount: 450, patient_id: 'p1' }),
    ])
    expect(db.rows('daily_ledger_transactions')[0].description).toContain('(Lab)')
    expect(db.rows('patient_charges')).toEqual([
      expect.objectContaining({
        charge_item_id: 'lab',
        charge_type: 'Lab Test',
        description: 'CBC, blood sugar',
        amount: 450,
        installment_id: payment.id,
      }),
    ])
    expect(paidAmount()).toBe(450)
  })

  it('writes nothing at all when there is no lab entry in the catalogue', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await create('p1', { patient_billing_id: 'b1', amount: 450, kind: 'lab' })

    expect(status).toBe(400)
    expect(body.error).toMatch(/lab entry/i)
    expect(db.count('patient_billing_installments')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
    expect(db.count('patient_charges')).toBe(0)
  })

  it('moves the Charges line with the payment when the payment is edited', async () => {
    await setUp()
    await create('p1', { patient_billing_id: 'b1', amount: 450, kind: 'lab', remarks: 'CBC' })
    const payment = db.rows('patient_billing_installments')[0]

    const { status } = await edit('p1', payment.id, {
      amount: 600,
      payment_date: TODAY,
      payment_method: 'cash',
      remarks: 'CBC, LFT',
    })

    expect(status).toBe(200)
    expect(db.rows('patient_charges')[0]).toMatchObject({ amount: 600, description: 'CBC, LFT' })
  })

  it('removes the Charges line when the payment is deleted', async () => {
    await setUp()
    await create('p1', { patient_billing_id: 'b1', amount: 450, kind: 'lab' })
    const payment = db.rows('patient_billing_installments')[0]

    const { status } = await remove('p1', payment.id)

    expect(status).toBe(200)
    expect(db.count('patient_charges')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('puts an uncollected registration fee back when its payment is deleted, line and all', async () => {
    await setUp()
    aChargeItem({ id: 'reg', name: 'Registration', category: 'registration', is_registration_fee: true })
    db.find('patient_billing', (r) => r.id === 'b1')!.registration_fee_status = 'pending'
    await create('p1', { patient_billing_id: 'b1', amount: 300, kind: 'registration' })
    const payment = db.rows('patient_billing_installments')[0]

    await remove('p1', payment.id)

    expect(db.count('patient_charges')).toBe(0)
    expect(db.find('patient_billing', (r) => r.id === 'b1')!.registration_fee_status).toBe('pending')
  })

  it('keeps the line read-only in Charges: changed through its payment', async () => {
    await setUp()
    await create('p1', { patient_billing_id: 'b1', amount: 450, kind: 'lab' })
    const line = db.rows('patient_charges')[0]

    const patched = await call(editCharge, 'PATCH', `/api/patients/p1/charges/${line.id}`, {
      body: { amount: 1 },
      params: { id: 'p1', chargeId: line.id },
    })
    const deleted = await call(removeCharge, 'DELETE', `/api/patients/p1/charges/${line.id}`, {
      params: { id: 'p1', chargeId: line.id },
    })

    expect(patched.status).toBe(409)
    expect(patched.body.code).toBe('CHARGE_IS_PAYMENT_LINE')
    expect(deleted.status).toBe(409)
    expect(db.rows('patient_charges')[0].amount).toBe(450)
  })

  it('does not let a lab payment be relabelled, so its line cannot be left behind', async () => {
    await setUp()
    await create('p1', { patient_billing_id: 'b1', amount: 450, kind: 'lab' })
    const payment = db.rows('patient_billing_installments')[0]

    const { status } = await edit('p1', payment.id, {
      amount: 450,
      payment_date: TODAY,
      payment_method: 'cash',
      kind: 'regular',
    })

    expect(status).toBe(400)
    expect(db.rows('patient_billing_installments')[0].kind).toBe('lab')
  })
})
