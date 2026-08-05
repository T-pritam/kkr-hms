/**
 * /api/doctor-settlements/* — the doctor fee lifecycle after sync has counted the visits:
 *   price it (PUT [settlementId]) → settle it (POST /settle) → optionally merge → delete.
 */

import { describe, it, expect } from 'vitest'
import { PUT as priceSettlement, DELETE as deleteSettlement } from '@/app/api/doctor-settlements/[settlementId]/route'
import { POST as settleSettlement } from '@/app/api/doctor-settlements/settle/route'
import { POST as mergeSettlements } from '@/app/api/doctor-settlements/merge/route'
import { POST as createManual } from '@/app/api/doctor-settlements/create-manual/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aSettlement, aDoctor, aPatient, aBilling, aConsultation, aVisitPurpose } from '../../helpers/seed'
import { NOW } from '../../setup'

const price = (id: string, body: unknown) =>
  call(priceSettlement, 'PUT', `/api/doctor-settlements/${id}`, { body, params: { settlementId: id } })

const remove = (id: string, body: unknown = {}) =>
  call(deleteSettlement, 'DELETE', `/api/doctor-settlements/${id}`, { body, params: { settlementId: id } })

const settle = (body: unknown) => call(settleSettlement, 'POST', '/api/doctor-settlements/settle', { body })
const merge = (body: unknown) => call(mergeSettlements, 'POST', '/api/doctor-settlements/merge', { body })
const manual = (body: unknown) => call(createManual, 'POST', '/api/doctor-settlements/create-manual', { body })

const row = (id: string) => db.find('doctor_visit_settlements', (r) => r.id === id)!

describe('doctor settlements — access control', () => {
  it('rejects unauthenticated callers', async () => {
    signOut()

    expect((await price('s1', {})).status).toBe(401)
    expect((await settle({ settlement_id: 's1', settlement_amount: 1 })).status).toBe(401)
    expect((await merge({ settlement_ids: ['s1', 's2'] })).status).toBe(401)
    expect((await remove('s1'))?.status).toBe(401)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s on every verb', async (role) => {
    await signInAs(role)
    aSettlement({ id: 's1' })

    expect((await price('s1', { amount_per_visit: 1 })).body.error).toBe('Only admins can update settlements')
    expect((await merge({ settlement_ids: ['s1', 's2'] })).body.error).toBe('Only admins can merge settlements')
    expect((await remove('s1')).status).toBe(403)
    expect((await settle({ settlement_id: 's1', settlement_amount: 1 })).status).toBe(403)
  })
})

describe('PUT /api/doctor-settlements/[settlementId] — pricing', () => {
  it('returns 404 for an unknown settlement', async () => {
    await signInAs('ADMIN')

    const { status, body } = await price('missing', { amount_per_visit: 1500 })
    expect(status).toBe(404)
    expect(body.error).toBe('Settlement not found')
  })

  it('sets a per-visit rate', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aSettlement({ id: 's1', visit_count: 3, amount_per_visit: 0 })

    const { status } = await price('s1', { pricing_mode: 'per_visit', amount_per_visit: 1500, visit_count: 3 })

    expect(status).toBe(200)
    expect(row('s1')).toMatchObject({ amount_per_visit: 1500, visit_count: 3, updated_by: 'u-admin' })
  })

  it('derives the per-visit rate from a total', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 3 })

    await price('s1', { pricing_mode: 'total', total_amount: 4500, visit_count: 3 })

    expect(Number(row('s1').amount_per_visit)).toBe(1500)
  })

  it('rejects a total with a non-numeric value', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 3 })

    const { status, body } = await price('s1', { pricing_mode: 'total', total_amount: 'abc', visit_count: 3 })
    expect(status).toBe(400)
    expect(body.error).toBe('The amount must be a number, zero or more')
  })

  it('rejects a total spread over zero visits', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 0 })

    const { status, body } = await price('s1', { pricing_mode: 'total', total_amount: 4500, visit_count: 0 })
    expect(status).toBe(400)
    expect(body.error).toBe('This settlement has no visits to price a total against. Set a per-visit rate instead.')
  })

  it('rejects a request that would change nothing', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1' })

    const { status, body } = await price('s1', {})
    expect(status).toBe(400)
    expect(body.error).toBe('No data provided to update')
  })

  it('unsettles a paid settlement when its pricing is edited', async () => {
    await signInAs('ADMIN')
    aSettlement({
      id: 's1',
      visit_count: 3,
      amount_per_visit: 1500,
      settled: true,
      settlement_date: '2026-03-01T00:00:00.000Z',
      settlement_amount: 4500,
    })

    const { status, body } = await price('s1', { pricing_mode: 'per_visit', amount_per_visit: 2000 })

    expect(status).toBe(200)
    expect(body.message).toBe(
      'Settled settlement was unsettled and pricing updated. Call with settled: true to resettle.'
    )
    expect(row('s1')).toMatchObject({ settled: false, settlement_date: null, settlement_amount: null })
    expect(Number(row('s1').amount_per_visit)).toBe(2000)
  })

  it('marks a settlement settled, computing the amount from the rate', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 3, amount_per_visit: 0, settled: false })

    await price('s1', { pricing_mode: 'per_visit', amount_per_visit: 1500, settled: true })

    expect(row('s1')).toMatchObject({ settled: true, settlement_amount: 4500 })
    expect(row('s1').settlement_date).toBe(NOW.toISOString())
  })

  it('clears the payment details when unsettled', async () => {
    await signInAs('ADMIN')
    aSettlement({
      id: 's1',
      settled: true,
      settlement_amount: 4500,
      payment_method: 'cash',
      transaction_reference: 'REF-1',
      settlement_date: '2026-03-01T00:00:00.000Z',
    })

    await price('s1', { settled: false })

    expect(row('s1')).toMatchObject({
      settled: false,
      settlement_date: null,
      settlement_amount: null,
      payment_method: null,
      transaction_reference: null,
    })
  })

  it('records the payment method, reference and notes', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 1 })

    await price('s1', {
      settled: true,
      settlement_amount: 2000,
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-7',
      settlement_notes: 'Paid with March batch',
    })

    expect(row('s1')).toMatchObject({
      payment_method: 'bank_transfer',
      transaction_reference: 'NEFT-7',
      settlement_notes: 'Paid with March batch',
    })
  })

  /**
   * BUGS.md #26, resolved — the pricing endpoint now recomputes total_amount
   * whenever amount_per_visit/visit_count change, so it can't go stale against
   * the rate just set (which is also the column the billing roll-up sums).
   */
  it('should keep total_amount in step with the rate it just set', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 3, amount_per_visit: 1000, total_amount: 3000 })

    await price('s1', { pricing_mode: 'per_visit', amount_per_visit: 2000 })

    expect(Number(row('s1').total_amount)).toBe(6000)
  })
})

/**
 * A purpose-linked settlement (one sync created) has its count derived from the
 * visits actually billed under it — see 20260809000002_settlement_visit_linking.sql.
 * A manual/merged row (visit_purpose_id null) was never part of that tracking and
 * keeps the old freely-typed count.
 */
describe('PUT /api/doctor-settlements/[settlementId] — visit_count is a fact, not an input', () => {
  it('rejects a submitted visit_count for a purpose-linked settlement', async () => {
    await signInAs('ADMIN')
    const purpose = aVisitPurpose({ code: 'consultation' })
    aSettlement({ id: 's1', visit_purpose_id: purpose.id, visit_count: 2 })

    const { status, body } = await price('s1', { visit_count: 5 })

    expect(status).toBe(400)
    expect(body.error).toMatch(/cannot be edited directly/)
    expect(row('s1').visit_count).toBe(2)
  })

  it('still allows amount_per_visit and total_amount on a purpose-linked row', async () => {
    await signInAs('ADMIN')
    const purpose = aVisitPurpose({ code: 'consultation' })
    aSettlement({ id: 's1', visit_purpose_id: purpose.id, visit_count: 2, amount_per_visit: 0 })

    const { status } = await price('s1', { amount_per_visit: 300 })

    expect(status).toBe(200)
    expect(row('s1')).toMatchObject({ amount_per_visit: 300, visit_count: 2, total_amount: 600 })
  })

  it('allows a freely-typed visit_count on a manual row (no visit_purpose_id)', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_purpose_id: null, visit_count: 2, amount_per_visit: 500 })

    const { status } = await price('s1', { pricing_mode: 'per_visit', visit_count: 4, amount_per_visit: 500 })

    expect(status).toBe(200)
    expect(row('s1')).toMatchObject({ visit_count: 4, total_amount: 2000 })
  })
})

/**
 * Reopening a settled row conflicts with the database the moment a newer
 * pending row already exists for the same (cycle, doctor, purpose) — the
 * partial unique index (20260809000002) only allows one live *unsettled* row
 * per key. The route has to turn that 23505 into something a human can act on.
 */
describe('PUT /api/doctor-settlements/[settlementId] — reopening a settled row', () => {
  it('returns 409 when a newer pending row already exists for the same key', async () => {
    await signInAs('ADMIN')
    const purpose = aVisitPurpose({ code: 'consultation' })
    aSettlement({
      id: 's-old',
      patient_billing_id: 'b1',
      doctor_id: 'd1',
      visit_purpose_id: purpose.id,
      settled: true,
      visit_count: 1,
    })
    aSettlement({
      id: 's-new',
      patient_billing_id: 'b1',
      doctor_id: 'd1',
      visit_purpose_id: purpose.id,
      settled: false,
      visit_count: 2,
    })

    const { status, body } = await price('s-old', { amount_per_visit: 999 })

    expect(status).toBe(409)
    expect(body.error).toMatch(/newer pending settlement/)
    // The attempt must not have left the old row half-unsettled or repriced.
    expect(row('s-old')).toMatchObject({ settled: true, amount_per_visit: 0 })
  })

  it('unsettles cleanly when nothing conflicts', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', settled: true, amount_per_visit: 500, visit_count: 2 })

    const { status } = await price('s1', { amount_per_visit: 700 })

    expect(status).toBe(200)
    expect(row('s1')).toMatchObject({ settled: false, amount_per_visit: 700 })
  })
})

describe('POST /api/doctor-settlements/settle — single', () => {
  it('requires an id and an amount', async () => {
    await signInAs('ADMIN')

    expect((await settle({})).body.error).toBe('Either settlement_id or settlement_ids must be provided')
    expect((await settle({ settlement_id: 's1' })).body.error).toBe(
      'settlement_id and settlement_amount are required'
    )
  })

  it('rejects a non-positive amount', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 1 })

    const { status, body } = await settle({ settlement_id: 's1', settlement_amount: -100 })
    expect(status).toBe(400)
    expect(body.error).toBe('settlement_amount must be greater than 0')
  })

  it('returns 404 for an unknown settlement', async () => {
    await signInAs('ADMIN')

    const { status, body } = await settle({ settlement_id: 'missing', settlement_amount: 1000 })
    expect(status).toBe(404)
    expect(body.error).toBe('Settlement not found')
  })

  it('settles and back-computes the per-visit rate', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aSettlement({ id: 's1', visit_count: 3, amount_per_visit: 0, settled: false })

    const { status, body } = await settle({
      settlement_id: 's1',
      settlement_amount: 4500,
      payment_method: 'cash',
      settlement_notes: 'March batch',
    })

    expect(status).toBe(200)
    expect(body.message).toBe('Doctor visit fees settled successfully')

    expect(row('s1')).toMatchObject({
      settled: true,
      settlement_amount: 4500,
      amount_per_visit: 1500,
      payment_method: 'cash',
      settlement_notes: 'March batch',
      settlement_type: 'regular',
      updated_by: 'u-admin',
      settlement_date: NOW.toISOString(),
    })
  })

  /**
   * Known defect — see BUGS.md #43. Sync creates settlements with visit_count 0, and this
   * endpoint divides the amount by that count, writing Infinity into amount_per_visit.
   */
  it.fails('should refuse to settle a settlement with no visits', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 0 })

    const { status } = await settle({ settlement_id: 's1', settlement_amount: 4500 })

    expect(status).toBe(400)
    expect(Number.isFinite(Number(row('s1').amount_per_visit))).toBe(true)
  })
})

describe('POST /api/doctor-settlements/settle — bulk', () => {
  it('requires an amount for each settlement', async () => {
    await signInAs('ADMIN')

    const { body } = await settle({ settlement_ids: ['s1'] })
    expect(body.error).toBe('settlement_amount_each is required')
  })

  it('rejects an empty list', async () => {
    await signInAs('ADMIN')

    const { body } = await settle({ settlement_ids: [], settlement_amount_each: 100 })
    expect(body.error).toBe('Either settlement_id or settlement_ids must be provided')
  })

  it('rejects a non-positive amount', async () => {
    await signInAs('ADMIN')

    const { body } = await settle({ settlement_ids: ['s1'], settlement_amount_each: 0 })
    expect(body.error).toBe('settlement_amount_each is required')
  })

  it('returns 404 when none of the ids exist', async () => {
    await signInAs('ADMIN')

    const { status, body } = await settle({ settlement_ids: ['nope'], settlement_amount_each: 100 })
    expect(status).toBe(404)
    expect(body.error).toBe('Settlements not found')
  })

  it('settles each one for the same amount', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', visit_count: 2, settled: false })
    aSettlement({ id: 's2', visit_count: 4, settled: false })

    const { status } = await settle({ settlement_ids: ['s1', 's2'], settlement_amount_each: 4000 })

    expect(status).toBe(200)
    expect(row('s1')).toMatchObject({ settled: true, settlement_amount: 4000, amount_per_visit: 2000 })
    expect(row('s2')).toMatchObject({ settled: true, settlement_amount: 4000, amount_per_visit: 1000 })
  })
})

describe('POST /api/doctor-settlements/merge', () => {
  it('needs at least two ids', async () => {
    await signInAs('ADMIN')

    expect((await merge({ settlement_ids: 'not-an-array' })).status).toBe(400)
    expect((await merge({ settlement_ids: ['s1'] })).body.error).toBe(
      'Must provide at least 2 settlement IDs to merge'
    )
  })

  it('returns 404 when the settlements cannot be found', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_id: 'p1' })

    const { status, body } = await merge({ settlement_ids: ['s1', 'missing'] })
    expect(status).toBe(404)
    expect(body.error).toBe('Could not find all settlements to merge')
  })

  it('refuses to merge across patients', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_id: 'p1' })
    aSettlement({ id: 's2', patient_id: 'p2' })

    const { status, body } = await merge({ settlement_ids: ['s1', 's2'] })
    expect(status).toBe(400)
    expect(body.error).toBe('Cannot merge settlements from different patients')
  })

  it('combines visits and amounts into one settlement and retires the originals', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aDoctor({ id: 'd1' })
    aPatient({ id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', visit_count: 2, total_amount: 3000, patient_billing_id: 'b1' })
    aSettlement({ id: 's2', patient_id: 'p1', doctor_id: 'd1', visit_count: 1, total_amount: 1500, patient_billing_id: 'b1' })

    const { status, body } = await merge({ settlement_ids: ['s1', 's2'] })

    expect(status).toBe(200)
    expect(body.message).toBe('Successfully merged 2 settlements')

    const merged = row(body.merged_settlement_id)
    expect(merged).toMatchObject({
      patient_id: 'p1',
      doctor_id: 'd1',
      visit_count: 3,
      total_amount: 4500,
      amount_per_visit: 1500,
      settlement_notes: 'Merged from 2 settlements',
      created_by: 'u-admin',
    })

    expect(row('s1').deleted_at).toBe(NOW.toISOString())
    expect(row('s2').deleted_at).toBe(NOW.toISOString())
  })

  /**
   * Every visit billed under one of the merged-away rows must follow to the new
   * one — otherwise it's left pointing at a row about to be soft-deleted,
   * invisible to the next sync and to the DELETE route's own release step.
   */
  it('re-links visits from the merged-away settlements onto the new one', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })
    aPatient({ id: 'p1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', visit_count: 2, total_amount: 3000 })
    aSettlement({ id: 's2', patient_id: 'p1', doctor_id: 'd1', visit_count: 1, total_amount: 1500 })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1', settlement_id: 's1' })
    aConsultation({ id: 'c2', patient_id: 'p1', doctor_id: 'd1', settlement_id: 's1' })
    aConsultation({ id: 'c3', patient_id: 'p1', doctor_id: 'd1', settlement_id: 's2' })

    const { body } = await merge({ settlement_ids: ['s1', 's2'] })

    for (const id of ['c1', 'c2', 'c3']) {
      expect(db.find('patient_consultations', (r) => r.id === id)!.settlement_id).toBe(
        body.merged_settlement_id
      )
    }
  })

  it('honours explicit overrides for the merged row', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_id: 'p1', visit_count: 2, total_amount: 3000 })
    aSettlement({ id: 's2', patient_id: 'p1', visit_count: 1, total_amount: 1500 })

    const { body } = await merge({
      settlement_ids: ['s1', 's2'],
      merged_settlement: { visit_count: 3, amount_per_visit: 2000, total_amount: 6000, notes: 'Negotiated' },
    })

    expect(row(body.merged_settlement_id)).toMatchObject({
      visit_count: 3,
      amount_per_visit: 2000,
      total_amount: 6000,
      settlement_notes: 'Negotiated',
    })
  })

  /**
   * Known defect — see BUGS.md #44. Merging rows that all have zero visits — the normal
   * state straight after sync — divides by zero and stores NaN as the rate.
   */
  it.fails('should not produce a NaN rate when every merged settlement has zero visits', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_id: 'p1', visit_count: 0, total_amount: 0 })
    aSettlement({ id: 's2', patient_id: 'p1', visit_count: 0, total_amount: 0 })

    const { body } = await merge({ settlement_ids: ['s1', 's2'] })

    expect(Number.isNaN(Number(row(body.merged_settlement_id).amount_per_visit))).toBe(false)
  })

  /**
   * Known defect — see BUGS.md #45. Merge validates that all rows share a patient but
   * never that they share a doctor, so two doctors' visits silently collapse onto the
   * first doctor and the second doctor's fee disappears.
   */
  it.fails('should refuse to merge settlements for different doctors', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', visit_count: 2, total_amount: 3000 })
    aSettlement({ id: 's2', patient_id: 'p1', doctor_id: 'd2', visit_count: 1, total_amount: 1500 })

    const { status } = await merge({ settlement_ids: ['s1', 's2'] })
    expect(status).toBe(400)
  })
})

describe('DELETE /api/doctor-settlements/[settlementId]', () => {
  it('soft-deletes by default', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1' })

    const { status } = await remove('s1', {})

    expect(status).toBe(200)
    expect(row('s1').deleted_at).toBe(NOW.toISOString())
  })

  /**
   * Otherwise a visit billed under a deleted settlement is stuck: sync only ever
   * regathers visits with `settlement_id IS NULL`, so it would never be
   * reconsidered by anything again.
   */
  it('releases the visits it billed back into the unbilled pool', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1' })
    aConsultation({ id: 'c1', settlement_id: 's1' })
    aConsultation({ id: 'c2', settlement_id: 's1' })

    await remove('s1', {})

    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.settlement_id).toBeNull()
    expect(db.find('patient_consultations', (r) => r.id === 'c2')!.settlement_id).toBeNull()
  })

  it('releases linked visits on a hard delete too', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1' })
    aConsultation({ id: 'c1', settlement_id: 's1' })

    await remove('s1', { soft_delete: false })

    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.settlement_id).toBeNull()
  })

  it('hard-deletes when explicitly asked', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1' })

    await remove('s1', { soft_delete: false })

    expect(db.count('doctor_visit_settlements')).toBe(0)
  })

  /**
   * Known defect — see BUGS.md #46. The handler parses a JSON body unconditionally, so a
   * DELETE sent without one — the ordinary way to send a DELETE — throws and returns 500.
   */
  it.fails('should accept a DELETE with no request body', async () => {
    await signInAs('ADMIN')
    aSettlement({ id: 's1' })

    const { status } = await call(deleteSettlement, 'DELETE', '/api/doctor-settlements/s1', {
      params: { settlementId: 's1' },
    })

    expect(status).toBe(200)
  })
})

describe('POST /api/doctor-settlements/create-manual', () => {
  it('creates a settlement with an explicit total', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aPatient({ id: 'p1' })
    aDoctor({ id: 'd1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await manual({
      patient_id: 'p1',
      doctor_id: 'd1',
      patient_billing_id: 'b1',
      visit_count: 3,
      amount_per_visit: 1500,
    })

    expect(status).toBe(201)
    const created = db.rows('doctor_visit_settlements')[0]
    expect(created).toMatchObject({ patient_id: 'p1', doctor_id: 'd1', visit_count: 3, amount_per_visit: 1500 })
    expect(Number(created.total_amount)).toBe(4500)
  })
})
