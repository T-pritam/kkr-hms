/**
 * GET /api/doctors/[id]/visits — one doctor's visits, and what was paid.
 *
 * The thing that makes this report non-obvious: **payment is per settlement,
 * not per visit**. A `doctor_visit_settlements` row covers every visit of one
 * doctor, for one purpose, in one billing cycle, and a visit points at it
 * through `patient_consultations.settlement_id`. So a visit's own fee is the
 * settlement's `amount_per_visit`, an unbilled visit has no fee at all, and
 * "paid on / by / how" is read off the settlement.
 */

import { describe, it, expect } from 'vitest'
import { GET as doctorVisits } from '@/app/api/doctors/[id]/visits/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import {
  aConsultation,
  aDoctor,
  aPatient,
  aSettlement,
  aUser,
  aVisitPurpose,
} from '../../helpers/seed'

const visits = (doctorId = 'd1', query = {}) =>
  call(doctorVisits, 'GET', `/api/doctors/${doctorId}/visits`, {
    params: { id: doctorId },
    query,
  })

/** Dr Rao: two consultations paid together, one round still unpaid, one unbilled. */
function aDoctorsMonth() {
  aDoctor({ id: 'd1', name: 'Dr Rao', specialist: 'Physician' })
  aUser({ id: 'u-admin', username: 'admin', role: 'ADMIN' })

  aPatient({ id: 'p1', patient_id: '12/26', name: 'Ramesh Kumar' })
  aPatient({ id: 'p2', patient_id: '13/26', name: 'Sita Devi' })

  const consult = aVisitPurpose({ id: 'vp1', code: 'consultation', name: 'Consultation' })
  const round = aVisitPurpose({ id: 'vp2', code: 'ward_round', name: 'Ward round' })

  // Paid: two visits under one settlement, ₹500 each.
  aSettlement({
    id: 's-paid',
    doctor_id: 'd1',
    visit_purpose_id: consult.id,
    visit_count: 2,
    amount_per_visit: 500,
    total_amount: 1000,
    settled: true,
    settlement_amount: 1000,
    settlement_date: '2026-03-20T06:00:00.000Z',
    settled_by: 'u-admin',
    payment_method: 'cash',
    transaction_reference: 'REF-1',
  })

  // Priced, not yet paid.
  aSettlement({
    id: 's-unpaid',
    doctor_id: 'd1',
    visit_purpose_id: round.id,
    visit_count: 1,
    amount_per_visit: 300,
    total_amount: 300,
    settled: false,
  })

  aConsultation({
    id: 'c1', doctor_id: 'd1', patient_id: 'p1', visit_purpose_id: consult.id,
    settlement_id: 's-paid', consultation_date: '2026-03-10T04:30:00.000Z',
  })
  aConsultation({
    id: 'c2', doctor_id: 'd1', patient_id: 'p2', visit_purpose_id: consult.id,
    settlement_id: 's-paid', consultation_date: '2026-03-12T04:30:00.000Z',
  })
  aConsultation({
    id: 'c3', doctor_id: 'd1', patient_id: 'p1', visit_purpose_id: round.id,
    settlement_id: 's-unpaid', consultation_date: '2026-03-14T04:30:00.000Z',
  })
  // Never synced into a settlement — no fee exists for it yet.
  aConsultation({
    id: 'c4', doctor_id: 'd1', patient_id: 'p2', visit_purpose_id: consult.id,
    settlement_id: null, consultation_date: '2026-03-15T04:30:00.000Z',
  })
}

describe("a doctor's visits — access", () => {
  it('needs a session', async () => {
    signOut()
    expect((await visits()).status).toBe(401)
  })

  // The people who price and pay a doctor's fee may read what he was paid.
  it.each(['ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const)('lets %s read it', async (role) => {
    await signInAs(role)
    aDoctorsMonth()
    expect((await visits()).status).toBe(200)
  })

  it.each(['NURSE', 'LAB_TECHNICIAN'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    expect((await visits()).status).toBe(403)
  })

  it('404s for a doctor who is not there', async () => {
    await signInAs('ADMIN')
    expect((await visits('nobody')).status).toBe(404)
  })
})

describe("a doctor's visits — what each row says", () => {
  it('gives every visit its patient, purpose and fee', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits()
    const byId = Object.fromEntries(body.data.map((r: any) => [r.id, r]))

    expect(body.doctor).toMatchObject({ id: 'd1', name: 'Dr Rao' })
    expect(body.data).toHaveLength(4)

    expect(byId.c1).toMatchObject({
      patient: { patient_id: '12/26', name: 'Ramesh Kumar' },
      purpose: { name: 'Consultation' },
      // Its share of the settlement, not the settlement's total.
      fee: 500,
      billed: true,
      paid: true,
    })
  })

  it('carries the payment detail from the settlement', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits()
    const paid = body.data.find((r: any) => r.id === 'c1')

    expect(paid.payment).toMatchObject({
      settled: true,
      settled_by: 'admin',
      payment_method: 'cash',
      transaction_reference: 'REF-1',
      settlement_total: 1000,
    })
    expect(paid.payment.settled_on).toBe('2026-03-20T06:00:00.000Z')
  })

  it('says an unbilled visit has no fee rather than pretending it is zero', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits()
    const unbilled = body.data.find((r: any) => r.id === 'c4')

    expect(unbilled).toMatchObject({ billed: false, paid: false, fee: null, payment: null })
  })

  it('shows a priced but unpaid visit as unpaid, with its fee', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits()
    const pending = body.data.find((r: any) => r.id === 'c3')

    expect(pending).toMatchObject({ billed: true, paid: false, fee: 300 })
  })

  it("leaves out another doctor's visits, and deleted ones", async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()
    aDoctor({ id: 'd2', name: 'Dr Other' })
    aConsultation({ id: 'other', doctor_id: 'd2', patient_id: 'p1' })
    aConsultation({ id: 'gone', doctor_id: 'd1', patient_id: 'p1', deleted_at: '2026-03-01T00:00:00.000Z' })

    const ids = (await visits()).body.data.map((r: any) => r.id)

    expect(ids).not.toContain('other')
    expect(ids).not.toContain('gone')
  })
})

describe("a doctor's visits — the totals", () => {
  it('adds up what was paid, what is owed, and what is not billed', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits()

    expect(body.summary).toMatchObject({
      visits: 4,
      fees_paid: 1000, // two visits at 500
      fees_pending: 300, // the ward round
      unbilled_visits: 1,
    })
  })

  it('subtotals by visit type', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits()
    const byPurpose = Object.fromEntries(body.by_purpose.map((r: any) => [r.purpose, r]))

    expect(byPurpose.Consultation).toMatchObject({ visits: 3, paid: 1000, unpaid: 0 })
    expect(byPurpose['Ward round']).toMatchObject({ visits: 1, paid: 0, unpaid: 300 })
  })
})

describe("a doctor's visits — filters", () => {
  it('filters by paid and unpaid', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const paid = await visits('d1', { settled: 'true' })
    const unpaid = await visits('d1', { settled: 'false' })

    expect(paid.body.data.map((r: any) => r.id).sort()).toEqual(['c1', 'c2'])
    expect(unpaid.body.data.map((r: any) => r.id).sort()).toEqual(['c3', 'c4'])
  })

  it('filters by visit type', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits('d1', { purpose_id: 'vp2' })
    expect(body.data.map((r: any) => r.id)).toEqual(['c3'])
  })

  /**
   * The trap this report had to avoid: `consultation_date` is an instant shown
   * as IST. A visit at 00:30 IST on the 15th is 19:00 UTC on the 14th, so
   * comparing the day against a bare UTC instant would file it under the 14th.
   */
  it('puts a late-evening visit on the right IST day', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr Rao' })
    aPatient({ id: 'p1' })
    // 23:45 IST on the 15th = 18:15 UTC on the 15th.
    aConsultation({ id: 'late', doctor_id: 'd1', patient_id: 'p1', consultation_date: '2026-03-15T18:15:00.000Z' })
    // 00:30 IST on the 16th = 19:00 UTC on the 15th.
    aConsultation({ id: 'past-midnight', doctor_id: 'd1', patient_id: 'p1', consultation_date: '2026-03-15T19:00:00.000Z' })

    const fifteenth = await visits('d1', { from: '2026-03-15', to: '2026-03-15' })
    const sixteenth = await visits('d1', { from: '2026-03-16', to: '2026-03-16' })

    expect(fifteenth.body.data.map((r: any) => r.id)).toEqual(['late'])
    expect(sixteenth.body.data.map((r: any) => r.id)).toEqual(['past-midnight'])
  })

  it('reports the range it was asked for', async () => {
    await signInAs('ADMIN')
    aDoctorsMonth()

    const { body } = await visits('d1', { from: '2026-03-01', to: '2026-03-31' })
    expect(body.summary).toMatchObject({ from: '2026-03-01', to: '2026-03-31' })
  })
})
