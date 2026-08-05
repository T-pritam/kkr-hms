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
import { aBilling, anInstallment, aTransaction, aClosure, aUser } from '../../helpers/seed'
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
    aBilling({ id: 'b1' })

    await create('p1', { patient_billing_id: 'b1', amount: 1000 })

    expect(db.rows('patient_billing_installments')[0]).toMatchObject({
      payment_date: TODAY,
      payment_method: 'cash',
    })
  })

  it('numbers installments sequentially', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1' })

    await create('p1', { patient_billing_id: 'b1', amount: 1000 })
    await create('p1', { patient_billing_id: 'b1', amount: 2000 })
    await create('p1', { patient_billing_id: 'b1', amount: 500 })

    expect(db.rows('patient_billing_installments').map((i) => i.installment_number)).toEqual([1, 2, 3])
  })

  it('numbers per billing record, not globally', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1' })
    aBilling({ id: 'b2' })
    anInstallment({ patient_billing_id: 'b2', installment_number: 7 })

    await create('p1', { patient_billing_id: 'b1', amount: 1000 })

    expect(db.rows('patient_billing_installments').find((i) => i.patient_billing_id === 'b1')!.installment_number).toBe(1)
  })

  it('re-sums patient_paid_amount from scratch after each payment', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_paid_amount: 0 })

    await create('p1', { patient_billing_id: 'b1', amount: 3000 })
    expect(paidAmount()).toBe(3000)

    await create('p1', { patient_billing_id: 'b1', amount: 2000 })
    expect(paidAmount()).toBe(5000)
  })

  it('self-heals a patient_paid_amount that had drifted', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_paid_amount: 99999 })
    anInstallment({ patient_billing_id: 'b1', amount: 1000, installment_number: 1 })

    await create('p1', { patient_billing_id: 'b1', amount: 500 })

    expect(paidAmount()).toBe(1500)
  })

  it('returns 500 when the insert fails', async () => {
    await signInAs('RECEPTIONIST')
    db.failNext('patient_billing_installments') // the next-number lookup
    db.failNext('patient_billing_installments') // the insert itself

    expect((await create('p1', { patient_billing_id: 'b1', amount: 100 })).status).toBe(500)
  })

  /** Overpayment is possible: nothing compares the payment against the outstanding balance. */
  it('accepts a payment larger than the outstanding balance', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', total_charges: 1000, patient_paid_amount: 0 })

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 50000 })

    expect(status).toBe(200)
    expect(paidAmount()).toBe(50000)
  })

  /** Known defect — see BUGS.md #19. */
  it.fails('should reject a payment that exceeds the outstanding balance', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', total_charges: 1000, patient_paid_amount: 0 })

    const { status } = await create('p1', { patient_billing_id: 'b1', amount: 50000 })
    expect(status).toBe(400)
  })

  /** Known defect — see BUGS.md #19. A zero or negative payment is accepted. */
  it.fails('should reject a zero or negative payment', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1' })

    expect((await create('p1', { patient_billing_id: 'b1', amount: 0 })).status).toBe(400)
    expect((await create('p1', { patient_billing_id: 'b1', amount: -500 })).status).toBe(400)
  })
})

describe('POST /api/patients/[id]/installments — ledger side effect', () => {
  it('writes a matching credit into the daily ledger when asked', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
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
      description: 'Patient installment payment #1',
      status: 'pending',
      created_by: 'u-recep',
    })
  })

  it('writes no ledger entry unless create_ledger_entry is set', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1' })

    await create('p1', { patient_billing_id: 'b1', amount: 5000 })

    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  /**
   * Was BUGS.md #20. This path now goes through lib/ledger, so it is subject to the same
   * closed-day rule as every other ledger write.
   */
  it('should refuse to write into a day that has already been closed', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aClosure({ closure_date: '2026-03-12' })

    const { status, body } = await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      payment_date: '2026-03-12',
      create_ledger_entry: true,
    })

    expect(status).toBe(409)
    expect(body.code).toBe('LEDGER_DAY_CLOSED')
    expect(db.rows('daily_ledger_transactions').filter((t) => t.source === 'patient')).toHaveLength(0)
    // Guarded before the installment is written, so nothing is left half-recorded.
    expect(db.count('patient_billing_installments')).toBe(0)
  })

  /** Was BUGS.md #20 — this path skipped the UPI reference rule the ledger's own POST enforces. */
  it('should require a reference number for a UPI payment', async () => {
    await signInAs('RECEPTIONIST')
    aBilling({ id: 'b1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      amount: 5000,
      payment_method: 'upi',
      create_ledger_entry: true,
    })

    expect(status).toBe(400)
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

  it('blanks the fields the caller omits', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', remarks: 'Original note', transaction_reference: 'REF-1' })

    await edit('p1', 'i1', { amount: 1000 })

    const stored = db.find('patient_billing_installments', (r) => r.id === 'i1')!
    expect(stored.remarks).toBeUndefined()
    expect(stored.transaction_reference).toBeUndefined()
  })

  /**
   * Known defect — see BUGS.md #21. The ledger credit written when the installment was
   * created is never revisited, so the ledger and the billing record now disagree, and
   * nothing links the two rows for a later repair.
   */
  it.fails('should keep the linked ledger entry in step with the edited amount', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, installment_number: 1 })
    aTransaction({ id: 't1', source: 'patient', amount: 1000, patient_id: 'p1' })

    await edit('p1', 'i1', { amount: 2500 })

    expect(Number(db.find('daily_ledger_transactions', (r) => r.id === 't1')!.amount)).toBe(2500)
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

  /** Known defect — see BUGS.md #21. Deleting the payment leaves the ledger credit behind. */
  it.fails('should remove the linked ledger entry too', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    anInstallment({ id: 'i1', patient_billing_id: 'b1', amount: 1000, installment_number: 1 })
    aTransaction({ id: 't1', source: 'patient', amount: 1000, patient_id: 'p1' })

    await remove('p1', 'i1')

    expect(db.count('daily_ledger_transactions')).toBe(0)
  })
})
