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
import {
  aBilling,
  aDoctor,
  aPatient,
  aConsultation,
  aSettlement,
  aVisitPurpose,
} from '../../helpers/seed'
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
   * BUGS.md #25, resolved — this listing now applies the same `deleted_at is null`
   * filter as sync and the billing roll-up, so a deleted settlement no longer shows
   * in the table and the patient PDF while contributing nothing to the totals.
   */
  it('excludes soft-deleted settlements', async () => {
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
    expect(body).toMatchObject({ success: true, total_settlements: 0, created: [], updated: [] })
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
    expect(body).toMatchObject({ success: true, total_settlements: 2 })
    expect(body.created).toHaveLength(2)

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

    expect(body.total_settlements).toBe(0)
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
    expect(body.total_settlements).toBe(0)
    expect(db.count('doctor_visit_settlements')).toBe(0)
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
   * BUGS.md #28, resolved — and resolved more thoroughly than the original fix.
   * The earlier version left a settled row alone but then had nowhere to put
   * visits recorded afterwards: they were reported as "skipped" and never
   * billed. Now a settled row is simply not a candidate — new visits of the same
   * doctor+purpose start a fresh unsettled row of their own.
   */
  it('leaves a settled settlement untouched and opens a new one for visits recorded afterwards', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b1', visit_count: 1, settled: true })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    const { body } = await sync('p1', { billing_id: 'b1' })

    // The settled row's own count is exactly what it was paid against.
    expect(settlementRow('s1').visit_count).toBe(1)
    expect(settlementRow('s1').settled).toBe(true)

    // The two new visits are not lost: they got a new, unsettled row.
    expect(body.created).toHaveLength(1)
    const rows = db.rows('doctor_visit_settlements')
    expect(rows).toHaveLength(2)
    const fresh = rows.find((r) => r.id !== 's1')!
    expect(fresh).toMatchObject({ settled: false, visit_count: 2 })

    // Which is why it's representable at all: a settled row and a fresh pending
    // row can coexist for the very same (cycle, doctor, purpose).
    expect(fresh.doctor_id).toBe('d1')
  })

  it('billing a second pair after the first is settled attaches only the new visits, not the old ones', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })

    // First pair: sync, then settle.
    aConsultation({ id: 'c1', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ id: 'c2', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    await sync('p1', { billing_id: 'b1' })
    const firstRow = db.rows('doctor_visit_settlements')[0]
    db.patchRow('doctor_visit_settlements', (r) => r.id === firstRow.id, { settled: true })

    // Second pair, recorded afterwards.
    aConsultation({ id: 'c3', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ id: 'c4', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    await sync('p1', { billing_id: 'b1' })

    expect(db.count('doctor_visit_settlements')).toBe(2)
    expect(db.find('doctor_visit_settlements', (r) => r.id === firstRow.id)!.visit_count).toBe(2)

    const second = db.rows('doctor_visit_settlements').find((r) => r.id !== firstRow.id)!
    expect(second.visit_count).toBe(2)

    // The link, not a recount, is what keeps the two batches apart.
    expect(['c1', 'c2'].every((id) => db.find('patient_consultations', (r) => r.id === id)!.settlement_id === firstRow.id)).toBe(true)
    expect(['c3', 'c4'].every((id) => db.find('patient_consultations', (r) => r.id === id)!.settlement_id === second.id)).toBe(true)
  })

  it('attaches a newly recorded visit to the existing pending row rather than creating a duplicate', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ id: 'c1', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    await sync('p1', { billing_id: 'b1' })

    aConsultation({ id: 'c2', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    const { body } = await sync('p1', { billing_id: 'b1' })

    expect(body.created).toHaveLength(0)
    expect(db.count('doctor_visit_settlements')).toBe(1)
    expect(db.rows('doctor_visit_settlements')[0].visit_count).toBe(2)
  })

  it('shrinks a pending row when one of its linked visits is soft-deleted', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    aConsultation({ id: 'c1', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    aConsultation({ id: 'c2', patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })
    await sync('p1', { billing_id: 'b1' })

    db.patchRow('patient_consultations', (r) => r.id === 'c2', { deleted_at: '2026-03-20T00:00:00.000Z' })
    await sync('p1', { billing_id: 'b1' })

    expect(db.rows('doctor_visit_settlements')[0].visit_count).toBe(1)
  })

  /** BUGS.md #29, resolved — the lookup is scoped to the billing cycle. */
  it('opens a separate settlement for a new billing cycle', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b-old', patient_id: 'p1' })
    aBilling({ id: 'b-new', patient_id: 'p1' })
    aSettlement({ id: 's-old', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b-old', visit_count: 2 })
    aConsultation({ patient_id: 'p1', billing_id: 'b-new', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b-new' })

    expect(db.count('doctor_visit_settlements')).toBe(2)
    // The earlier admission's agreed fee is untouched.
    expect(settlementRow('s-old').visit_count).toBe(2)
  })

  /** BUGS.md #30, resolved — a settlement whose visits are all gone is zeroed. */
  it('clears the visit count for a doctor with no remaining consultations', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd-gone', patient_billing_id: 'b1', visit_count: 3, amount_per_visit: 500 })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1' })

    await sync('p1', { billing_id: 'b1' })

    expect(settlementRow('s1')).toMatchObject({ visit_count: 0, total_amount: 0 })
  })

  it('leaves a settled settlement alone even when its visits are all gone', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd-gone', patient_billing_id: 'b1', visit_count: 3, settled: true })

    await sync('p1', { billing_id: 'b1' })

    expect(settlementRow('s1').visit_count).toBe(3)
  })
})

/**
 * The reason settlements gained a purpose. Two consultations and one operation by
 * the same doctor are three visits at two different rates, and the old grouping
 * collapsed them into one row that was wrong whichever rate was chosen.
 */
describe('POST /api/patients/[id]/settlements/sync — per purpose', () => {
  const seedPurposes = () => {
    aVisitPurpose({ id: 'vp-cons', code: 'consultation', name: 'Consultation' })
    aVisitPurpose({ id: 'vp-op', code: 'operation', name: 'Operation / Surgery' })
  }

  it('splits one doctor’s visits into a settlement per purpose', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    seedPurposes()

    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-cons', price_per_visit: 300 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-cons', price_per_visit: 300 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-op', price_per_visit: 5000 })

    const { body } = await sync('p1', { billing_id: 'b1' })

    expect(body.total_settlements).toBe(2)

    const rows = db.rows('doctor_visit_settlements')
    expect(rows).toHaveLength(2)

    const consultations = rows.find((s) => s.visit_purpose_id === 'vp-cons')!
    const operation = rows.find((s) => s.visit_purpose_id === 'vp-op')!

    expect(consultations).toMatchObject({ visit_count: 2, amount_per_visit: 300, total_amount: 600 })
    expect(operation).toMatchObject({ visit_count: 1, amount_per_visit: 5000, total_amount: 5000 })
  })

  it('seeds the rate from the fees agreed on the visits, not zero', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    seedPurposes()
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-op', price_per_visit: 5000 })

    await sync('p1', { billing_id: 'b1' })

    expect(Number(db.rows('doctor_visit_settlements')[0].amount_per_visit)).toBe(5000)
  })

  /** BUGS.md #26 — the column the billing roll-up sums must never go stale. */
  it('keeps total_amount in step with the count on every path', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1', base_charge: 0 })
    aDoctor({ id: 'd1' })
    seedPurposes()
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b1', visit_purpose_id: 'vp-cons', visit_count: 1, amount_per_visit: 300 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-cons' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-cons' })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-cons' })

    await sync('p1', { billing_id: 'b1' })

    expect(settlementRow('s1')).toMatchObject({ visit_count: 3, total_amount: 900 })
    // ...and the bill moved with it.
    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.total_doctor_fees)).toBe(900)
  })

  it('is idempotent across purposes', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    seedPurposes()
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-cons', price_per_visit: 300 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-op', price_per_visit: 5000 })

    await sync('p1', { billing_id: 'b1' })
    await sync('p1', { billing_id: 'b1' })

    expect(db.count('doctor_visit_settlements')).toBe(2)
  })

  it('keeps an agreed rate that differs from the visits’ own', async () => {
    await signInAs('ADMIN')
    aBilling({ id: 'b1', patient_id: 'p1' })
    aDoctor({ id: 'd1' })
    seedPurposes()
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', patient_billing_id: 'b1', visit_purpose_id: 'vp-op', amount_per_visit: 4500 })
    aConsultation({ patient_id: 'p1', billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp-op', price_per_visit: 5000 })

    await sync('p1', { billing_id: 'b1' })

    // Negotiated down to 4500 and already recorded — sync must not undo that.
    expect(Number(settlementRow('s1').amount_per_visit)).toBe(4500)
  })
})
