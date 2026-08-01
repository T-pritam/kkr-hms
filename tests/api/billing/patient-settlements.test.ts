/**
 * /api/patients/[id]/settlements and .../settlements/sync — doctor fees for one patient.
 *
 * Sync is the bridge between consultations and money: it counts each doctor's visits in a
 * billing cycle and creates or refreshes the settlement row that carries the fee.
 */

import { describe, it, expect } from 'vitest'
import {
  GET as listSettlements,
  POST as createSettlement,
  PATCH as settlePayment,
} from '@/app/api/patients/[id]/settlements/route'
import { POST as syncVisits } from '@/app/api/patients/[id]/settlements/sync/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aDoctor, aPatient, aConsultation, aSettlement } from '../../helpers/seed'
import { NOW } from '../../setup'

const list = (patientId: string, query = {}) =>
  call(listSettlements, 'GET', `/api/patients/${patientId}/settlements`, { params: { id: patientId }, query })

const create = (patientId: string, body: unknown) =>
  call(createSettlement, 'POST', `/api/patients/${patientId}/settlements`, { body, params: { id: patientId } })

const settle = (patientId: string, body: unknown) =>
  call(settlePayment, 'PATCH', `/api/patients/${patientId}/settlements`, { body, params: { id: patientId } })

const sync = (patientId: string, body: unknown) =>
  call(syncVisits, 'POST', `/api/patients/${patientId}/settlements/sync`, { body, params: { id: patientId } })

const settlementRow = (id: string) => db.find('doctor_visit_settlements', (r) => r.id === id)!

describe('patient settlements — authentication and roles', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list('p1', { billing_id: 'b1' })).status).toBe(401)
    expect((await create('p1', {})).status).toBe(401)
    expect((await settle('p1', {})).status).toBe(401)
    expect((await sync('p1', { billing_id: 'b1' })).status).toBe(401)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s on settle and sync', async (role) => {
    await signInAs(role)
    aSettlement({ id: 's1', settled: false })

    const settled = await settle('p1', { settlement_id: 's1' })
    expect(settled.status).toBe(403)
    expect(settled.body.error).toBe('Only admins can settle payments')

    const synced = await sync('p1', { billing_id: 'b1' })
    expect(synced.status).toBe(403)
    expect(synced.body.error).toBe('Only admins can sync doctor visits')

    expect(settlementRow('s1').settled).toBe(false)
  })
})

describe('GET /api/patients/[id]/settlements', () => {
  it('requires billing_id', async () => {
    await signInAs('ADMIN')

    const { status, body } = await list('p1')
    expect(status).toBe(400)
    expect(body.error).toBe('billing_id is required')
  })

  it('returns the billing cycle’s settlements with doctor and patient embedded', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Rao', specialist: 'Cardiology' })
    aPatient({ id: 'p1', patient_id: '1/25', name: 'Ramesh' })
    aSettlement({ id: 's1', patient_billing_id: 'b1', patient_id: 'p1', doctor_id: 'd1' })

    const { status, body } = await list('p1', { billing_id: 'b1' })

    expect(status).toBe(200)
    expect(body[0].doctor).toEqual({ id: 'd1', name: 'Dr. Rao', specialist: 'Cardiology' })
    expect(body[0].patient).toEqual({ id: 'p1', patient_id: '1/25', name: 'Ramesh' })
  })

  it('does not return another billing cycle’s settlements', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_billing_id: 'b1' })
    aSettlement({ id: 's2', patient_billing_id: 'b2' })

    expect((await list('p1', { billing_id: 'b1' })).body.map((s: any) => s.id)).toEqual(['s1'])
  })

  /**
   * Known defect — see BUGS.md #25. This listing does not filter out soft-deleted rows,
   * unlike sync and the billing recalculation, so a deleted settlement still appears in
   * the settlement table and the patient PDF while contributing nothing to the totals.
   */
  it.fails('should exclude soft-deleted settlements', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_billing_id: 'b1' })
    aSettlement({ id: 's2', patient_billing_id: 'b1', deleted_at: '2026-03-01T00:00:00.000Z' })

    expect((await list('p1', { billing_id: 'b1' })).body.map((s: any) => s.id)).toEqual(['s1'])
  })
})

describe('POST /api/patients/[id]/settlements', () => {
  it('creates a settlement for a doctor', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      doctor_id: 'd1',
      visit_count: 3,
      amount_per_visit: 1500,
    })

    expect(status).toBe(200)
    expect(db.rows('doctor_visit_settlements')[0]).toMatchObject({
      patient_billing_id: 'b1',
      patient_id: 'p1',
      doctor_id: 'd1',
      visit_count: 3,
      amount_per_visit: 1500,
      created_by: 'u-admin',
    })
  })

  it('defaults the counts to zero', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })

    await create('p1', { patient_billing_id: 'b1', doctor_id: 'd1' })

    expect(db.rows('doctor_visit_settlements')[0]).toMatchObject({ visit_count: 0, amount_per_visit: 0 })
  })

  /**
   * Known defect — see BUGS.md #26. total_amount is a plain column in the live schema —
   * no generated expression, no trigger — and this route never sets it. The row is left
   * with a null fee even though visits and a per-visit rate were supplied, and the
   * billing roll-up sums exactly that column.
   */
  it.fails('should record total_amount as visits × rate', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })

    await create('p1', { patient_billing_id: 'b1', doctor_id: 'd1', visit_count: 3, amount_per_visit: 1500 })

    expect(Number(db.rows('doctor_visit_settlements')[0].total_amount)).toBe(4500)
  })
})

describe('PATCH /api/patients/[id]/settlements — mark settled', () => {
  it('marks the settlement paid with the supplied details', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aSettlement({ id: 's1', settled: false })

    const { status } = await settle('p1', {
      settlement_id: 's1',
      settlement_amount: 4500,
      settlement_notes: 'Paid by bank transfer',
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-1',
      settlement_date: '2026-03-12T00:00:00.000Z',
    })

    expect(status).toBe(200)
    expect(settlementRow('s1')).toMatchObject({
      settled: true,
      settlement_amount: 4500,
      settlement_notes: 'Paid by bank transfer',
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-1',
      settlement_date: '2026-03-12T00:00:00.000Z',
      updated_by: 'u-admin',
    })
  })

  it('defaults the settlement date to now', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: false })

    await settle('p1', { settlement_id: 's1', settlement_amount: 1000 })

    expect(settlementRow('s1').settlement_date).toBe(NOW.toISOString())
  })

  it('returns 500 for an unknown settlement id', async () => {
    await signInAs('ADMIN')

    expect((await settle('p1', { settlement_id: 'missing' })).status).toBe(500)
  })

  /** Known defect — see BUGS.md #27. Nothing checks that the settlement belongs to this patient. */
  it.fails('should refuse to settle another patient’s settlement', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's-other', patient_id: 'p2', settled: false })

    await settle('p1', { settlement_id: 's-other', settlement_amount: 1000 })

    expect(settlementRow('s-other').settled).toBe(false)
  })

  /** Known defect — see BUGS.md #27. A settlement can be marked paid for any amount, including none. */
  it.fails('should require a settlement amount', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: false, total_amount: 4500 })

    const { status } = await settle('p1', { settlement_id: 's1' })
    expect(status).toBe(400)
  })
})

describe('POST /api/patients/[id]/settlements/sync', () => {
  it('requires billing_id', async () => {
    await signInAs('ADMIN')

    const { status, body } = await sync('p1', {})
    expect(status).toBe(400)
    expect(body.error).toBe('billing_id is required')
  })

  it('reports there is nothing to sync when the cycle has no consultations', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status, body } = await sync('p1', { billing_id: 'b1' })

    expect(status).toBe(200)
    expect(body).toEqual({ success: true, message: 'No consultations to sync', settlements: [] })
    expect(db.count('doctor_visit_settlements')).toBe(0)
  })

  it('creates one settlement per doctor, carrying the visit count', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aDoctor({ id: 'd2' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd2' })

    const { status, body } = await sync('p1', { billing_id: 'b1' })

    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, total_doctors: 2 })
    expect(body.created).toHaveLength(2)
    expect(body.message).toBe('Doctor visits synced successfully. Created: 2, Updated: 0')

    const rows = db.rows('doctor_visit_settlements')
    expect(rows.find((s) => s.doctor_id === 'd1')).toMatchObject({
      visit_count: 2,
      amount_per_visit: 0,
      settlement_type: 'regular',
      patient_billing_id: 'b1',
      created_by: 'u-admin',
    })
    expect(rows.find((s) => s.doctor_id === 'd2')!.visit_count).toBe(1)
  })

  it('refreshes the visit count on an existing settlement instead of duplicating it', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b1', visit_count: 1, amount_per_visit: 1500 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    const { body } = await sync('p1', { billing_id: 'b1' })

    expect(body.updated).toHaveLength(1)
    expect(db.count('doctor_visit_settlements')).toBe(1)
    expect(settlementRow('s1').visit_count).toBe(3)
  })

  it('preserves the agreed rate when refreshing a settlement', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b1', amount_per_visit: 1500 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b1' })

    expect(Number(settlementRow('s1').amount_per_visit)).toBe(1500)
  })

  it('ignores consultations with no doctor', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: null })

    const { body } = await sync('p1', { billing_id: 'b1' })

    expect(body.total_doctors).toBe(0)
    expect(db.count('doctor_visit_settlements')).toBe(0)
  })

  it('ignores soft-deleted consultations', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', deleted_at: '2026-03-01T00:00:00.000Z' })

    await sync('p1', { billing_id: 'b1' })

    expect(db.rows('doctor_visit_settlements')[0].visit_count).toBe(1)
  })

  it('ignores consultations booked to a different billing cycle', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b2', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b1' })

    expect(db.rows('doctor_visit_settlements')[0].visit_count).toBe(1)
  })

  it('ignores another patient’s consultations', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p2', billing_id: 'b1', doctor_id: 'd1' })

    const { body } = await sync('p1', { billing_id: 'b1' })
    expect(body.message).toBe('No consultations to sync')
  })

  it('is idempotent — running it twice leaves one settlement with the same count', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b1' })
    await sync('p1', { billing_id: 'b1' })

    expect(db.count('doctor_visit_settlements')).toBe(1)
    expect(db.rows('doctor_visit_settlements')[0].visit_count).toBe(2)
  })

  it('returns 500 when the settlement write fails', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    db.failNext('doctor_visit_settlements') // the existing-settlement lookup
    db.failNext('doctor_visit_settlements') // the insert

    expect((await sync('p1', { billing_id: 'b1' })).status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #28. Sync raises the visit count on a settlement that has
   * already been paid, silently reopening a closed amount without unsettling it — unlike
   * the pricing endpoint, which explicitly unsettles first.
   */
  it.fails('should not change the visit count of an already settled settlement', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b1', visit_count: 1, settled: true })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b1' })

    expect(settlementRow('s1').visit_count).toBe(1)
  })

  /**
   * Known defect — see BUGS.md #29. The existing-settlement lookup matches on patient and
   * doctor only, ignoring the billing cycle, so a second admission reuses and repoints the
   * first cycle's settlement rather than opening a new one.
   */
  it.fails('should open a separate settlement for a new billing cycle', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b-old', patient_id: 'p1' })
    aBilling({ id: 'b-new', patient_id: 'p1' })
    aSettlement({ id: 's-old', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b-old', visit_count: 2 })
    aConsultation({ patient_id: 'p1', billing_id: 'b-new', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b-new' })

    expect(db.count('doctor_visit_settlements')).toBe(2)
    expect(settlementRow('s-old').visit_count).toBe(2)
  })

  /**
   * Known defect — see BUGS.md #30. A doctor whose only consultation was deleted keeps the
   * old settlement and its visit count; sync never zeroes or removes a stale row.
   */
  it.fails('should clear the visit count for a doctor with no remaining consultations', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd-gone', patient_billing_id: 'b1', visit_count: 3 })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b1' })

    expect(settlementRow('s1').visit_count).toBe(0)
  })
})
