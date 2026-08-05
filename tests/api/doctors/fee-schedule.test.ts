/**
 * /api/visit-purposes and /api/doctors/[id]/fee-schedule — what a visit is for,
 * and what the doctor is paid for it.
 *
 * The distinction these have to hold onto is between "no agreed rate" and "free".
 * A blank fee means the visit form should ask; a fee of 0 means this doctor does
 * that kind of visit for nothing. `Number('')` is 0, so conflating them is the
 * easy mistake, and it would silently start paying people zero.
 */

import { describe, it, expect } from 'vitest'
import { GET as listPurposes, POST as createPurpose } from '@/app/api/visit-purposes/route'
import { PATCH as updatePurpose } from '@/app/api/visit-purposes/[id]/route'
import {
  GET as readSchedule,
  PUT as saveSchedule,
} from '@/app/api/doctors/[id]/fee-schedule/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aDoctor, aDoctorFee, aVisitPurpose } from '../../helpers/seed'

const purposes = (query = {}) => call(listPurposes, 'GET', '/api/visit-purposes', { query })
const addPurpose = (body: unknown) => call(createPurpose, 'POST', '/api/visit-purposes', { body })
const editPurpose = (id: string, body: unknown) =>
  call(updatePurpose, 'PATCH', `/api/visit-purposes/${id}`, { body, params: { id } })

const schedule = (id: string) =>
  call(readSchedule, 'GET', `/api/doctors/${id}/fee-schedule`, { params: { id } })
const setSchedule = (id: string, body: unknown) =>
  call(saveSchedule, 'PUT', `/api/doctors/${id}/fee-schedule`, { body, params: { id } })

describe('/api/visit-purposes', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await purposes()).status).toBe(401)
    expect((await addPurpose({ name: 'X' })).status).toBe(401)
  })

  it('lets everyone read the list — the visit form needs it', async () => {
    await signInAs('NURSE')
    aVisitPurpose({ name: 'Consultation' })

    expect((await purposes()).status).toBe(200)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
    'refuses to let %s add a purpose',
    async (role) => {
      await signInAs(role)
      expect((await addPurpose({ name: 'Operation' })).status).toBe(403)
    },
  )

  it('hides retired purposes unless asked for them', async () => {
    await signInAs('ADMIN')
    aVisitPurpose({ name: 'Live', code: 'live' })
    aVisitPurpose({ name: 'Retired', code: 'retired', is_active: false })

    expect((await purposes()).body.visitPurposes).toHaveLength(1)
    expect((await purposes({ active: 'false' })).body.visitPurposes).toHaveLength(2)
  })

  it('derives a stable code from the name', async () => {
    await signInAs('ADMIN')

    const { status, body } = await addPurpose({ name: 'Operation / Surgery' })

    expect(status).toBe(201)
    expect(body.visitPurpose.code).toBe('operation_surgery')
  })

  it('requires a name and rejects one with nothing to slug', async () => {
    await signInAs('ADMIN')

    expect((await addPurpose({})).status).toBe(400)
    expect((await addPurpose({ name: '///' })).status).toBe(400)
  })

  it('rejects a negative default fee', async () => {
    await signInAs('ADMIN')

    expect((await addPurpose({ name: 'Operation', default_fee: -1 })).status).toBe(400)
  })

  it('refuses a duplicate code', async () => {
    await signInAs('ADMIN')
    aVisitPurpose({ code: 'operation', name: 'Operation' })

    expect((await addPurpose({ name: 'Operation' })).status).toBe(409)
  })

  it('renames and retires without touching the code', async () => {
    await signInAs('ADMIN')
    const purpose = aVisitPurpose({ code: 'operation', name: 'Operation' })

    await editPurpose(purpose.id, { name: 'Operation / Surgery', is_active: false })

    expect(db.find('visit_purposes', (r) => r.id === purpose.id)).toMatchObject({
      // The code is what lib/billing/fees.ts and the backfills look up by, so it
      // is deliberately not editable.
      code: 'operation',
      name: 'Operation / Surgery',
      is_active: false,
    })
  })

  it('404s for a purpose that does not exist', async () => {
    await signInAs('ADMIN')

    expect((await editPurpose('missing', { name: 'X' })).status).toBe(404)
  })
})

describe('/api/doctors/[id]/fee-schedule', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await schedule('d1')).status).toBe(401)
    expect((await setSchedule('d1', { schedule: [] })).status).toBe(401)
  })

  /** A doctor must not be able to set their own rate. */
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
    'refuses to let %s change a rate card',
    async (role) => {
      await signInAs(role)
      const doctor = aDoctor({ id: 'd1' })

      expect((await setSchedule(doctor.id, { schedule: [] })).status).toBe(403)
    },
  )

  it('404s for a doctor that does not exist', async () => {
    await signInAs('ADMIN')

    expect((await schedule('missing')).status).toBe(404)
    expect((await setSchedule('missing', { schedule: [] })).status).toBe(404)
  })

  it('returns every active purpose, priced or not', async () => {
    await signInAs('ADMIN')
    const doctor = aDoctor({ id: 'd1' })
    const consultation = aVisitPurpose({ id: 'vp1', code: 'consultation', name: 'Consultation' })
    aVisitPurpose({ id: 'vp2', code: 'operation', name: 'Operation' })
    aDoctorFee({ doctor_id: doctor.id, visit_purpose_id: consultation.id, fee: 300 })

    const { status, body } = await schedule(doctor.id)

    expect(status).toBe(200)
    expect(body.schedule).toHaveLength(2)

    expect(body.schedule.find((r: any) => r.visit_purpose_id === 'vp1')).toMatchObject({ fee: 300 })
    // Null, not 0 — the form has to be able to show "no agreed rate".
    expect(body.schedule.find((r: any) => r.visit_purpose_id === 'vp2').fee).toBeNull()
  })

  it('saves a rate card in one request', async () => {
    await signInAs('ADMIN')
    const doctor = aDoctor({ id: 'd1' })
    aVisitPurpose({ id: 'vp1', code: 'consultation' })
    aVisitPurpose({ id: 'vp2', code: 'operation' })

    const { status } = await setSchedule(doctor.id, {
      schedule: [
        { visit_purpose_id: 'vp1', fee: 300 },
        { visit_purpose_id: 'vp2', fee: 5000 },
      ],
    })

    expect(status).toBe(200)
    expect(db.rows('doctor_fee_schedule')).toHaveLength(2)
  })

  it('updates an existing rate rather than adding a second one', async () => {
    await signInAs('ADMIN')
    const doctor = aDoctor({ id: 'd1' })
    aVisitPurpose({ id: 'vp1', code: 'consultation' })
    aDoctorFee({ doctor_id: doctor.id, visit_purpose_id: 'vp1', fee: 300 })

    await setSchedule(doctor.id, { schedule: [{ visit_purpose_id: 'vp1', fee: 450 }] })

    expect(db.rows('doctor_fee_schedule')).toHaveLength(1)
    expect(Number(db.rows('doctor_fee_schedule')[0].fee)).toBe(450)
  })

  /** The distinction this whole file exists to protect. */
  it('keeps a fee of zero as a real rate', async () => {
    await signInAs('ADMIN')
    const doctor = aDoctor({ id: 'd1' })
    aVisitPurpose({ id: 'vp1', code: 'ward_round' })

    await setSchedule(doctor.id, { schedule: [{ visit_purpose_id: 'vp1', fee: 0 }] })

    expect(db.rows('doctor_fee_schedule')).toHaveLength(1)
    expect(Number(db.rows('doctor_fee_schedule')[0].fee)).toBe(0)
  })

  it('clears the row when the fee is blanked', async () => {
    await signInAs('ADMIN')
    const doctor = aDoctor({ id: 'd1' })
    aVisitPurpose({ id: 'vp1', code: 'consultation' })
    aDoctorFee({ doctor_id: doctor.id, visit_purpose_id: 'vp1', fee: 300 })

    await setSchedule(doctor.id, { schedule: [{ visit_purpose_id: 'vp1', fee: null }] })

    expect(db.rows('doctor_fee_schedule')).toHaveLength(0)
  })

  it('rejects a negative fee and writes nothing', async () => {
    await signInAs('ADMIN')
    const doctor = aDoctor({ id: 'd1' })
    aVisitPurpose({ id: 'vp1', code: 'consultation' })

    const { status } = await setSchedule(doctor.id, {
      schedule: [{ visit_purpose_id: 'vp1', fee: -100 }],
    })

    expect(status).toBe(400)
    expect(db.rows('doctor_fee_schedule')).toHaveLength(0)
  })

  it('requires a schedule array', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })

    expect((await setSchedule('d1', {})).status).toBe(400)
  })
})
