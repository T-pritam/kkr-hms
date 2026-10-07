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
  it('dates a back-dated receipt\'s doctor visit on the OPD day', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    doctors()

    const { status } = await create(opd({ transaction_date: '2026-03-13', doctors: [{ doctor_id: 'd1', fee: 300 }] }))

    expect(status).toBe(201)
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({ transaction_date: '2026-03-13', status: 'open' })
    const visit = db.rows('patient_consultations')[0]
    // 16:00 IST on the 13th, the time it was entered (the test clock is 10:30 UTC)
    expect(new Date(visit.consultation_date).toISOString()).toBe('2026-03-13T10:30:00.000Z')
  })

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

describe('OPD receipt — changing its date while Open (Oct 2026)', () => {
  it('moves the receipt and its doctor visits to the new day, keeping the time', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    doctors()
    const { body } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 300 }] }))

    const { status } = await update(body.data.id, {
      transaction_date: '2026-03-10',
      doctors: [{ doctor_id: 'd1', fee: 300 }],
      medicine_expense: null,
    })

    expect(status).toBe(200)
    expect(db.rows('daily_ledger_transactions')[0]).toMatchObject({ transaction_date: '2026-03-10', status: 'open' })
    expect(new Date(db.rows('patient_consultations')[0].consultation_date).toISOString()).toBe('2026-03-10T10:30:00.000Z')
  })

  it('moves the visits even when a paid fee has fixed the doctors', async () => {
    await signInAs('ADMIN')
    doctors()
    const { body } = await create(opd({ doctors: [{ doctor_id: 'd1', fee: 300 }] }))
    db.patchRow('doctor_visit_settlements', () => true, { settled: true })

    const { status } = await update(body.data.id, { transaction_date: '2026-03-11', doctors: [{ doctor_id: 'd1', fee: 300 }] })

    expect(status).toBe(200)
    expect(db.rows('daily_ledger_transactions')[0].transaction_date).toBe('2026-03-11')
    expect(new Date(db.rows('patient_consultations')[0].consultation_date).toISOString()).toBe('2026-03-11T10:30:00.000Z')
  })

  it('refuses a future date, and an invalid one', async () => {
    await signInAs('RECEPTIONIST')
    const { body } = await create(opd())

    const future = await update(body.data.id, { transaction_date: '2026-03-16' })
    const invalid = await update(body.data.id, { transaction_date: '2026-02-30' })

    expect(future.status).toBe(400)
    expect(future.body.error).toBe("The date can't be in the future")
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toBe('Enter a valid date')
    expect(db.rows('daily_ledger_transactions')[0].transaction_date).toBe(TODAY)
  })

  it('refuses any change once the entry is closed, admin included', async () => {
    await signInAs('ADMIN')
    const { body } = await create(opd())
    db.patchRow('daily_ledger_transactions', () => true, { status: 'closed' })

    const { status } = await update(body.data.id, { transaction_date: '2026-03-10' })

    expect(status).toBeGreaterThanOrEqual(400)
    expect(db.rows('daily_ledger_transactions')[0].transaction_date).toBe(TODAY)
  })
})
