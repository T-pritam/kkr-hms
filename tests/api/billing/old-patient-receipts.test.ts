/**
 * /api/receipts — the Receipts page (client, 3 Oct): every receipt, and an old
 * patient's (someone not in the app), typed in full and print only.
 */

import { describe, it, expect } from 'vitest'
import { GET as listAll, POST as createOld } from '@/app/api/receipts/route'
import { PUT as updateOld, DELETE as deleteAny } from '@/app/api/receipts/[id]/route'
import { GET as listForPatient, POST as createForPatient } from '@/app/api/patients/[id]/receipts/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aDoctor, aPatient, aUser, anInstallment } from '../../helpers/seed'

const list = (query: Record<string, string> = {}) => call(listAll, 'GET', '/api/receipts', { query })
const create = (body: any) => call(createOld, 'POST', '/api/receipts', { body })
const update = (id: string, body: any) => call(updateOld, 'PUT', `/api/receipts/${id}`, { params: { id }, body })
const remove = (id: string) => call(deleteAny, 'DELETE', `/api/receipts/${id}`, { params: { id } })

function world() {
  aUser({ id: 'u-desk', username: 'madhu', role: 'RECEPTIONIST' })
  aDoctor({ id: 'd1', name: 'Dr Ramesh Naidu', designation: 'Senior Consultant', department: 'General Medicine' })
  aPatient({ id: 'p1', patient_id: '6/26', name: 'Ravi' })
  aBilling({ id: 'b1', patient_id: 'p1' })
  anInstallment({ id: 'i1', patient_billing_id: 'b1', installment_number: 1, amount: 2500, kind: 'regular' })
}

const old = (extra: any = {}) => ({
  receipt_no: '287(A)', heading: 'Cash Receipt', patient_name: 'Mr. Chandan Nikshith Sai', age_sex: '11yrs/Male',
  mobile: '7997116180', address: 'Chalam Naidu Valasa', ip_no: '214/26',
  doctors: [{ name: 'Dr Ramesh Naidu', designation: 'Senior Consultant' }, { name: 'Dr Krishna Chaitanya', designation: '' }],
  department: 'General Medicine', created_by_label: 'Madhu.P',
  lines: [
    { line_date: '2026-07-13', payment_mode: 'Phone pay', transaction_type: 'transfer', remarks: 'advance', amount: 8000 },
    { line_date: '2026-07-20', payment_mode: 'Cash', transaction_type: 'cash', remarks: 'discharge', amount: '1500.50' },
  ],
  ...extra,
})

describe('/api/receipts', () => {
  it('is for reception and admin only', async () => {
    signOut()
    expect((await list()).status).toBe(401)
    for (const role of ['LAB_TECHNICIAN', 'DOCTOR', 'NURSE'] as const) {
      await signInAs(role)
      world()
      expect((await list()).status).toBe(403)
      expect((await create(old())).status).toBe(403)
      db.reset()
    }
  })

  it('saves an old patient\'s receipt as typed, with its own amounts', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()

    const saved = await create(old())
    expect(saved.status).toBe(201)

    const { status, body } = await list()
    expect(status).toBe(200)
    expect(body.me).toBe('madhu')
    expect(body.doctor_options).toEqual([expect.objectContaining({ name: 'Dr Ramesh Naidu', designation: 'Senior Consultant' })])
    expect(body.receipts).toHaveLength(1)
    expect(body.receipts[0]).toMatchObject({
      id: saved.body.id, subject_type: 'old', patient: null, receipt_no: '287(A)', patient_name: 'Mr. Chandan Nikshith Sai',
      ip_no: '214/26', department: 'General Medicine', created_by_label: 'Madhu.P', saved_by: 'madhu', total: 9500.5,
      doctors: [{ name: 'Dr Ramesh Naidu', designation: 'Senior Consultant' }, { name: 'Dr Krishna Chaitanya', designation: '' }],
      lines: [
        expect.objectContaining({ installment_id: null, line_date: '2026-07-13', payment_mode: 'Phone pay', amount: 8000 }),
        expect.objectContaining({ remarks: 'discharge', amount: 1500.5 }),
      ],
    })
    const stored = db.rows('payment_receipts')[0]
    expect(stored).toMatchObject({ subject_type: 'old', patient_id: null, patient_billing_id: null })
  })

  it('is print only: no payment, ledger entry or bill is written', async () => {
    await signInAs('ADMIN')
    world()
    const before = {
      ledger: db.count('daily_ledger_transactions'),
      payments: db.count('patient_billing_installments'),
      bills: db.rows('patient_billing').map(b => ({ ...b })),
    }

    await create(old())
    const { body } = await list()
    await update(body.receipts[0].id, old({ receipt_no: '287(B)' }))

    expect(db.count('daily_ledger_transactions')).toBe(before.ledger)
    expect(db.count('patient_billing_installments')).toBe(before.payments)
    expect(db.rows('patient_billing')).toEqual(before.bills)
  })

  it('needs a receipt number, a name, and every row with an amount above zero', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()

    expect(await create(old({ receipt_no: ' ' }))).toMatchObject({ status: 400, body: { fieldErrors: { receipt_no: expect.any(String) } } })
    expect(await create(old({ patient_name: '' }))).toMatchObject({ status: 400, body: { fieldErrors: { patient_name: expect.any(String) } } })
    expect(await create(old({ lines: [] }))).toMatchObject({ status: 400, body: { error: expect.stringMatching(/at least one row/) } })
    expect(await create(old({ lines: [{ amount: '' }] }))).toMatchObject({ status: 400, body: { error: expect.stringMatching(/Row 1 needs an amount/) } })
    expect(await create(old({ lines: [{ amount: 100 }, { amount: 0 }] }))).toMatchObject({ status: 400, body: { error: expect.stringMatching(/Row 2/) } })
    expect((await create(old({ lines: [{ amount: -5 }] }))).status).toBe(400)
    expect((await create(old({ lines: [{ amount: 100, line_date: '13.07.26' }] }))).status).toBe(400)
    expect(db.count('payment_receipts')).toBe(0)

    // the rest is optional
    const bare = await create({ receipt_no: '1', patient_name: 'Sita', lines: [{ amount: 300 }] })
    expect(bare.status).toBe(201)
    expect(db.rows('payment_receipts')[0]).toMatchObject({ heading: 'Cash Receipt', ip_no: '', address: '', doctors: [] })
  })

  it('saves edits: the details, and rows added, changed and removed', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    aUser({ id: 'u-admin', username: 'subham', role: 'ADMIN' })
    const { body: saved } = await create(old())

    await signInAs('ADMIN', { userId: 'u-admin' })
    const changed = await update(saved.id, old({
      patient_name: 'Master Chandan', doctors: [],
      lines: [{ line_date: '2026-07-14', payment_mode: 'UPI', transaction_type: 'transfer', remarks: 'advance', amount: 9000 }],
    }))
    expect(changed.status).toBe(200)

    const { body } = await list()
    expect(body.receipts[0]).toMatchObject({
      patient_name: 'Master Chandan', doctors: [], total: 9000, saved_by: 'subham',
      lines: [expect.objectContaining({ line_date: '2026-07-14', amount: 9000 })],
    })
    expect(db.count('payment_receipt_lines')).toBe(1)
  })

  it('lists registered patients\' receipts too, their amounts live from the payments', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    await create(old())
    const patientReceipt = await call(createForPatient, 'POST', '/api/patients/p1/receipts', {
      params: { id: 'p1' },
      body: { receipt_no: 'R-6', patient_name: 'Mr. Ravi', lines: [{ installment_id: 'i1' }] },
    })
    expect(patientReceipt.status).toBe(201)
    db.patchRow('patient_billing_installments', (i) => i.id === 'i1', { amount: 2600 })

    const { body } = await list()
    const byNo = Object.fromEntries(body.receipts.map((r: any) => [r.receipt_no, r]))
    expect(byNo['R-6']).toMatchObject({
      subject_type: 'patient', patient: { id: 'p1', patient_id: '6/26', name: 'Ravi' }, total: 2600,
      lines: [expect.objectContaining({ installment_id: 'i1', installment_number: 1, amount: 2600 })],
    })
    expect(byNo['287(A)']).toMatchObject({ subject_type: 'old', total: 9500.5 })

    // the kind filter
    expect((await list({ kind: 'old' })).body.receipts.map((r: any) => r.receipt_no)).toEqual(['287(A)'])
    expect((await list({ kind: 'patient' })).body.receipts.map((r: any) => r.receipt_no)).toEqual(['R-6'])

    // the patient's own Payments tab never shows an old patient's receipt
    const tab = await call(listForPatient, 'GET', '/api/patients/p1/receipts', { params: { id: 'p1' } })
    expect(tab.body.receipts.map((r: any) => r.receipt_no)).toEqual(['R-6'])
  })

  it('finds a receipt by its number, the name on it, or the IP no', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    await create(old())
    await create(old({ receipt_no: '300', patient_name: 'Ms. Lakshmi', ip_no: '99/25' }))

    const found = async (search: string) => (await list({ search })).body.receipts.map((r: any) => r.receipt_no)
    expect(await found('287')).toEqual(['287(A)'])
    expect(await found('lakshmi')).toEqual(['300'])
    expect(await found('99/25')).toEqual(['300'])
    expect(await found('nobody')).toEqual([])
  })

  it('edits only old patients\' receipts here; deletes either kind', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    world()
    const { body: patientReceipt } = await call(createForPatient, 'POST', '/api/patients/p1/receipts', {
      params: { id: 'p1' },
      body: { receipt_no: 'R-6', patient_name: 'Mr. Ravi', lines: [{ installment_id: 'i1' }] },
    })

    expect((await update(patientReceipt.id, old())).status).toBe(409)
    expect((await update('missing', old())).status).toBe(404)

    const { body: oldReceipt } = await create(old())
    expect((await remove(oldReceipt.id)).status).toBe(200)
    expect((await remove(patientReceipt.id)).status).toBe(200)
    expect(db.count('payment_receipts')).toBe(0)
    expect(db.count('payment_receipt_lines')).toBe(0)
    // the registered patient's payment is untouched
    expect(db.count('patient_billing_installments')).toBe(1)
  })

  it('saves nothing when the rows cannot be written', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    db.failNext('payment_receipt_lines')

    expect((await create(old())).status).toBe(500)
    expect(db.count('payment_receipts')).toBe(0)
  })
})
