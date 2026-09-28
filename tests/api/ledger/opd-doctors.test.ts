/**
 * OPD receipts with the doctors who saw the walk-in and a medicine amount
 * (client, 28 Sep). Each doctor becomes a visit and a priced, unpaid fee on the
 * doctor's page; medicine is the hospital's expense in Finances ▸ Medicine.
 */

import { describe, it, expect } from 'vitest'
import { POST as createTransaction } from '@/app/api/ledger/transactions/route'
import {
  GET as readTransaction,
  PUT as updateTransaction,
  DELETE as removeTransaction,
} from '@/app/api/ledger/transactions/[id]/route'
import { GET as medicineList } from '@/app/api/finances/medicine/route'
import { call } from '../../helpers/request'
import { signInAs } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aDoctor, aVisitPurpose } from '../../helpers/seed'
import { THIS_MONTH, TODAY } from '../../setup'

const create = (body: unknown) => call(createTransaction, 'POST', '/api/ledger/transactions', { body })
const read = (id: string) => call(readTransaction, 'GET', `/api/ledger/transactions/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateTransaction, 'PUT', `/api/ledger/transactions/${id}`, { body, params: { id } })
const remove = (id: string) => call(removeTransaction, 'DELETE', `/api/ledger/transactions/${id}`, { params: { id } })

const opd = (extra = {}) => ({
  transaction_date: TODAY,
  transaction_type: 'credit',
  source: 'opd',
  amount: 1500,
  payment_mode: 'cash',
  description: 'OPD K Sandhya',
  ...extra,
})

function doctors() {
  aVisitPurpose({ id: 'vp-c', code: 'consultation', name: 'Consultation' })
  aDoctor({ id: 'd1', name: 'Dr Rao' })
  aDoctor({ id: 'd2', name: 'Dr Patel' })
}

describe('OPD receipt — doctors and medicine', () => {
  it('writes one receipt, a visit and a priced unpaid fee per doctor, and the medicine', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    doctors()

    const { status, body } = await create(
      opd({ doctors: [{ doctor_id: 'd1', fee: 300 }, { doctor_id: 'd2', fee: 200 }], medicine_expense: 400 }),
    )

    expect(status).toBe(201)
    const receipt = body.data
    expect(db.rows('daily_ledger_transactions')).toEqual([
      expect.objectContaining({ id: receipt.id, amount: 1500, source: 'opd', medicine_expense: 400 }),
    ])
    expect(db.rows('doctor_visit_settlements').map((f) => [f.doctor_id, f.total_amount, f.visit_count, f.settled, f.patient_billing_id]))
      .toEqual([
        ['d1', 300, 1, false, null],
        ['d2', 200, 1, false, null],
      ])
    const visits = db.rows('patient_consultations')
    expect(visits).toHaveLength(2)
    expect(visits.every((v) => v.opd_ledger_transaction_id === receipt.id && v.patient_id === null && v.settlement_id)).toBe(true)
  })

  it('writes nothing when a doctor has no fee', async () => {
    await signInAs('RECEPTIONIST')
    doctors()

    const { status } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 0 }] }))

    expect(status).toBe(400)
    expect(db.count('daily_ledger_transactions')).toBe(0)
    expect(db.count('doctor_visit_settlements')).toBe(0)
  })

  it('removes the receipt again when the doctors cannot be recorded', async () => {
    await signInAs('RECEPTIONIST')
    aDoctor({ id: 'd1' }) // no "Consultation" purpose to record the visit under

    const { status } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 300 }] }))

    expect(status).toBe(400)
    expect(db.count('daily_ledger_transactions')).toBe(0)
    expect(db.count('patient_consultations')).toBe(0)
  })

  it('stays a plain receipt when no doctor or medicine is given', async () => {
    await signInAs('RECEPTIONIST')

    expect((await create(opd())).status).toBe(201)
    expect(db.count('doctor_visit_settlements')).toBe(0)
  })

  it('counts OPD medicine in Finances ▸ Medicine, named after the walk-in', async () => {
    await signInAs('ADMIN')
    doctors()
    await create(opd({ medicine_expense: 400 }))

    const { body } = await call(medicineList, 'GET', '/api/finances/medicine', { query: { month: THIS_MONTH } })

    expect(body.total).toBe(400)
    expect(body.rows).toEqual([
      expect.objectContaining({ amount: 400, opd: true, patient: expect.objectContaining({ name: 'K Sandhya' }) }),
    ])
  })

  it('reads back the doctors and medicine for the edit form', async () => {
    await signInAs('RECEPTIONIST')
    doctors()
    const { body } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 300 }], medicine_expense: 250 }))

    const read1 = await read(body.data.id)

    expect(read1.body.data).toMatchObject({
      medicine_expense: 250,
      doctors: [expect.objectContaining({ doctor_id: 'd1', doctor_name: 'Dr Rao', fee: 300, paid: false })],
    })
  })

  it('rewrites the doctors on edit while no fee is paid', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    doctors()
    const { body } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 300 }] }))

    const { status } = await update(body.data.id, { doctors: [{ doctor_id: 'd2', fee: 450 }], medicine_expense: null })

    expect(status).toBe(200)
    expect(db.rows('doctor_visit_settlements').map((f) => [f.doctor_id, f.total_amount])).toEqual([['d2', 450]])
    expect(db.rows('patient_consultations').map((v) => v.doctor_id)).toEqual(['d2'])
  })

  it('locks the doctors, and deleting, once a fee is paid', async () => {
    await signInAs('ADMIN')
    doctors()
    const { body } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 300 }] }))
    db.patchRow('doctor_visit_settlements', () => true, { settled: true })

    const changed = await update(body.data.id, { doctors: [{ doctor_id: 'd2', fee: 300 }] })
    const same = await update(body.data.id, { doctors: [{ doctor_id: 'd1', fee: 300 }], medicine_expense: 100 })
    const deleted = await remove(body.data.id)

    expect(changed.status).toBe(409)
    expect(changed.body.code).toBe('OPD_FEE_PAID')
    expect(same.status).toBe(200)
    expect(db.rows('daily_ledger_transactions')[0].medicine_expense).toBe(100)
    expect(deleted.status).toBe(409)
    expect(db.count('daily_ledger_transactions')).toBe(1)
  })
})
