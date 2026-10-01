/**
 * /api/patients/[id]/receipts — the desk's "Cash Receipt" for a patient's
 * payments (client, 1 Oct). Reception and admin make one for a single payment
 * or for several; everything on it but the amount can be typed over, and what
 * was typed is kept.
 */

import { describe, it, expect } from 'vitest'
import { GET as listReceipts, POST as createReceipt } from '@/app/api/patients/[id]/receipts/route'
import { PUT as updateReceipt, DELETE as deleteReceipt } from '@/app/api/patients/[id]/receipts/[receiptId]/route'
import { DELETE as deletePayment } from '@/app/api/patients/[id]/installments/[installmentId]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aConsultation, aDoctor, aPatient, aUser, anInstallment } from '../../helpers/seed'

const list = (patient = 'p1') => call(listReceipts, 'GET', `/api/patients/${patient}/receipts`, { params: { id: patient } })
const create = (body: any, patient = 'p1') =>
  call(createReceipt, 'POST', `/api/patients/${patient}/receipts`, { params: { id: patient }, body })
const update = (receiptId: string, body: any, patient = 'p1') =>
  call(updateReceipt, 'PUT', `/api/patients/${patient}/receipts/${receiptId}`, { params: { id: patient, receiptId }, body })
const remove = (receiptId: string, patient = 'p1') =>
  call(deleteReceipt, 'DELETE', `/api/patients/${patient}/receipts/${receiptId}`, { params: { id: patient, receiptId } })

function world() {
  aUser({ id: 'u-desk', username: 'madhu', role: 'RECEPTIONIST' })
  aPatient({ id: 'p1', patient_id: '214/26', name: 'Chandan', gender: 'Male', phone: '7997116180', date_of_birth: null, age_years: 11, age_recorded_on: null })
  aPatient({ id: 'p2', patient_id: '215/26', name: 'Someone Else' })
  aBilling({ id: 'b1', patient_id: 'p1' })
  aBilling({ id: 'b2', patient_id: 'p2' })
  aDoctor({ id: 'd1', name: 'Dr Ramesh Naidu', department: 'General Medicine' })
  aConsultation({ patient_id: 'p1', doctor_id: 'd1' })
  anInstallment({ id: 'i1', patient_billing_id: 'b1', installment_number: 1, amount: 8000, payment_date: '2026-07-13', payment_method: 'upi', kind: 'advance', created_by: 'u-desk' })
  anInstallment({ id: 'i2', patient_billing_id: 'b1', installment_number: 2, amount: 2500, payment_date: '2026-07-15', payment_method: 'cash', kind: 'regular', created_by: 'u-desk' })
  anInstallment({ id: 'other', patient_billing_id: 'b2', installment_number: 1, amount: 999 })
}

const typed = (lines: any[], extra: any = {}) => ({
  receipt_no: '287(A)', heading: 'Cash Receipt', patient_name: 'Mr. Chandan', age_sex: '11yrs/Male', mobile: '7997116180',
  address: 'Chalam Naidu Valasa', ip_no: '214/26', doctors: ['Dr Ramesh Naidu'], department: 'General Medicine',
  created_by_label: 'Madhu.P', lines, ...extra,
})
const row = (id: string, extra: any = {}) => ({
  installment_id: id, line_date: '2026-07-13', payment_mode: 'Phone pay', transaction_type: 'transfer', remarks: 'advance', ...extra,
})

describe('/api/patients/[id]/receipts', () => {
  it('is for reception and admin only, reading included', async () => {
    signOut()
    expect((await list()).status).toBe(401)

    for (const role of ['LAB_TECHNICIAN', 'DOCTOR', 'NURSE'] as const) {
      await signInAs(role)
      world()
      expect((await list()).status).toBe(403)
      expect((await create(typed([row('i1')]))).status).toBe(403)
      db.reset()
    }

    await signInAs('ADMIN')
    world()
    expect((await list()).status).toBe(200)
  })

  it('offers a new receipt filled in from the record, the visits and the payments', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.me).toBe('madhu')
    expect(body.defaults).toMatchObject({
      heading: 'Cash Receipt', patient_name: 'Mr. Chandan', age_sex: '11yrs/Male', mobile: '7997116180',
      address: '', ip_no: '214/26', doctors: ['Dr Ramesh Naidu'], department: 'General Medicine',
    })
    // only this patient's payments, oldest first, each with its starting row
    expect(body.payments).toEqual([
      expect.objectContaining({
        id: 'i1', installment_number: 1, amount: 8000, recorded_by: 'madhu',
        line: { installment_id: 'i1', line_date: '2026-07-13', payment_mode: 'UPI', transaction_type: 'transfer', remarks: 'Advance' },
      }),
      expect.objectContaining({ id: 'i2', amount: 2500, line: expect.objectContaining({ payment_mode: 'Cash', transaction_type: 'cash', remarks: 'Regular' }) }),
    ])
    expect(body.receipts).toEqual([])
  })

  it('saves a receipt and reopens it exactly as typed', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()

    const saved = await create(typed([row('i1')]))
    expect(saved.status).toBe(201)

    const { body } = await list()
    expect(body.receipts).toHaveLength(1)
    expect(body.receipts[0]).toMatchObject({
      id: saved.body.id, receipt_no: '287(A)', patient_name: 'Mr. Chandan', address: 'Chalam Naidu Valasa',
      doctors: ['Dr Ramesh Naidu'], department: 'General Medicine', created_by_label: 'Madhu.P',
      total: 8000, saved_by: 'madhu',
      lines: [{ installment_id: 'i1', installment_number: 1, line_date: '2026-07-13', payment_mode: 'Phone pay', transaction_type: 'transfer', remarks: 'advance', amount: 8000 }],
    })
    // the patient's own record is not changed by what was typed on the receipt
    expect(db.find('patients', (p) => p.id === 'p1')?.address).toBeNull()
  })

  it('never stores the amount: a corrected payment corrects its receipt', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    await create(typed([row('i1', { amount: 1 })], { amount: 1, total: 1 }))

    expect(Object.keys(db.rows('payment_receipt_lines')[0])).not.toContain('amount')

    db.patchRow('patient_billing_installments', (i) => i.id === 'i1', { amount: 9000 })
    const { body } = await list()
    expect(body.receipts[0].lines[0].amount).toBe(9000)
    expect(body.receipts[0].total).toBe(9000)
  })

  it('puts several payments on one receipt, in the order given', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    world()

    await create(typed([row('i1'), row('i2', { line_date: '2026-07-15', payment_mode: 'Cash', transaction_type: 'cash', remarks: 'regular' })]))

    const { body } = await list()
    expect(body.receipts[0].lines.map((l: any) => [l.installment_id, l.amount])).toEqual([['i1', 8000], ['i2', 2500]])
    expect(body.receipts[0].total).toBe(10500)
  })

  it('refuses a receipt without a number, without a payment, or with someone else\'s payment', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()

    expect(await create(typed([row('i1')], { receipt_no: '' }))).toMatchObject({ status: 400, body: { fieldErrors: { receipt_no: expect.any(String) } } })
    expect((await create(typed([]))).status).toBe(400)
    expect((await create(typed([row('other')]))).status).toBe(400)
    expect((await create(typed([row('i1'), row('i1')]))).status).toBe(400)
    expect(db.rows('payment_receipts')).toHaveLength(0)
  })

  it('saves nothing when the rows cannot be written', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    db.failNext('payment_receipt_lines')

    expect((await create(typed([row('i1')]))).status).toBe(500)
    expect(db.rows('payment_receipts')).toHaveLength(0)
  })

  it('saves the edits made later, and the payments ticked or unticked', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    aUser({ id: 'u-admin', username: 'subham', role: 'ADMIN' })
    const { body: saved } = await create(typed([row('i1')]))

    await signInAs('ADMIN', { userId: 'u-admin' })
    const changed = await update(saved.id, typed([row('i2', { remarks: 'balance' })], { receipt_no: '287(B)', doctors: ['Dr Krishna Chaitanya'], department: '' }))
    expect(changed.status).toBe(200)

    const { body } = await list()
    expect(body.receipts).toHaveLength(1)
    expect(body.receipts[0]).toMatchObject({
      receipt_no: '287(B)', doctors: ['Dr Krishna Chaitanya'], department: '', saved_by: 'subham',
      lines: [expect.objectContaining({ installment_id: 'i2', remarks: 'balance', amount: 2500 })],
    })
    expect(db.rows('payment_receipt_lines')).toHaveLength(1)
  })

  it('does not reach another patient\'s receipt', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    const { body: saved } = await create(typed([row('i1')]))

    expect((await update(saved.id, typed([row('other')]), 'p2')).status).toBe(404)
    expect((await remove(saved.id, 'p2')).status).toBe(404)
    expect(db.rows('payment_receipts')).toHaveLength(1)
  })

  it('deletes a receipt and leaves its payments alone', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    const { body: saved } = await create(typed([row('i1'), row('i2')]))

    expect((await remove(saved.id)).status).toBe(200)

    expect(db.rows('payment_receipts')).toHaveLength(0)
    expect(db.rows('payment_receipt_lines')).toHaveLength(0)
    expect(db.rows('patient_billing_installments').filter((i) => i.patient_billing_id === 'b1')).toHaveLength(2)
  })

  it('drops a deleted payment from its receipts, and a receipt left empty', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    world()
    await create(typed([row('i1')], { receipt_no: 'single' }))
    await create(typed([row('i1'), row('i2')], { receipt_no: 'both' }))

    const gone = await call(deletePayment, 'DELETE', '/api/patients/p1/installments/i1', { params: { id: 'p1', installmentId: 'i1' } })
    expect(gone.status).toBe(200)

    const { body } = await list()
    expect(body.receipts.map((r: any) => [r.receipt_no, r.lines.map((l: any) => l.installment_id), r.total])).toEqual([
      ['both', ['i2'], 2500],
    ])
    expect(db.rows('payment_receipts').map((r) => r.receipt_no)).toEqual(['both'])
  })
})
