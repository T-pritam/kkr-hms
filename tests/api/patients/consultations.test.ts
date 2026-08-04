/**
 * /api/patients/[id]/consultations — doctor visits.
 *
 * Consultations carry no money of their own; the doctor's fee lives in
 * doctor_visit_settlements, derived later by the sync endpoint (see Section 3).
 */

import { describe, it, expect } from 'vitest'
import { GET as listConsultations, POST as createConsultation } from '@/app/api/patients/[id]/consultations/route'
import {
  PATCH as editConsultation,
  DELETE as removeConsultation,
} from '@/app/api/patients/[id]/consultations/[consultationId]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aPatient, aDoctor, aConsultation, aSettlement, aUser } from '../../helpers/seed'
import { NOW } from '../../setup'

const list = (patientId: string) =>
  call(listConsultations, 'GET', `/api/patients/${patientId}/consultations`, { params: { id: patientId } })

const create = (patientId: string, body: unknown) =>
  call(createConsultation, 'POST', `/api/patients/${patientId}/consultations`, { body, params: { id: patientId } })

const edit = (patientId: string, consultationId: string, body: unknown) =>
  call(editConsultation, 'PATCH', `/api/patients/${patientId}/consultations/${consultationId}`, {
    body,
    params: { id: patientId, consultationId },
  })

const remove = (patientId: string, consultationId: string) =>
  call(removeConsultation, 'DELETE', `/api/patients/${patientId}/consultations/${consultationId}`, {
    params: { id: patientId, consultationId },
  })

describe('consultations — authentication', () => {
  it('rejects unauthenticated reads and writes', async () => {
    signOut()

    expect((await list('p1')).status).toBe(401)
    expect((await create('p1', { notes: 'x' })).status).toBe(401)
    expect((await edit('p1', 'c1', {})).status).toBe(401)
    expect((await remove('p1', 'c1')).status).toBe(401)
  })
})

describe('GET /api/patients/[id]/consultations', () => {
  it('returns the patient’s consultations, newest first', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1' })
    aConsultation({ id: 'c1', patient_id: 'p1', consultation_date: '2026-03-01T10:00:00.000Z' })
    aConsultation({ id: 'c2', patient_id: 'p1', consultation_date: '2026-03-10T10:00:00.000Z' })

    const { status, body } = await list('p1')

    expect(status).toBe(200)
    expect(body.map((c: any) => c.id)).toEqual(['c2', 'c1'])
  })

  it('excludes soft-deleted consultations', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1' })
    aConsultation({ id: 'c1', patient_id: 'p1' })
    aConsultation({ id: 'c2', patient_id: 'p1', deleted_at: '2026-03-02T00:00:00.000Z' })

    const { body } = await list('p1')
    expect(body.map((c: any) => c.id)).toEqual(['c1'])
  })

  it('does not leak another patient’s consultations', async () => {
    await signInAs('NURSE')
    aConsultation({ id: 'c1', patient_id: 'p1' })
    aConsultation({ id: 'c2', patient_id: 'p2' })

    const { body } = await list('p1')
    expect(body.map((c: any) => c.id)).toEqual(['c1'])
  })

  it('embeds the doctor and the creating user', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1', name: 'Dr. Rao', specialist: 'Cardiology' })
    aUser({ id: 'u1', username: 'nurse1', email: 'nurse1@hms.test' })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1', created_by: 'u1' })

    const { body } = await list('p1')

    expect(body[0].doctor).toEqual({ id: 'd1', name: 'Dr. Rao', specialist: 'Cardiology' })
    expect(body[0].created_by_user).toEqual({ id: 'u1', username: 'nurse1', email: 'nurse1@hms.test' })
  })

  it('returns a null doctor for a consultation with no doctor assigned', async () => {
    await signInAs('NURSE')
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: null })

    const { body } = await list('p1')
    expect(body[0].doctor).toBeNull()
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('NURSE')
    db.failNext('patient_consultations')

    expect((await list('p1')).status).toBe(500)
  })
})

describe('POST /api/patients/[id]/consultations — validation', () => {
  it('requires a doctor', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1' })

    const { status, body } = await create('p1', {})
    expect(status).toBe(400)
    expect(body.error).toBe('Select the doctor for this consultation')
  })

  /**
   * The old rule let this through. A doctor-less consultation is skipped by the
   * settlement sync, which groups by doctor_id, so the visit was recorded and could
   * never be billed to anyone.
   */
  it('rejects notes with no doctor', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })

    const { status } = await create('p1', { notes: 'Follow-up call' })
    expect(status).toBe(400)
    expect(db.count('patient_consultations')).toBe(0)
  })

  it('accepts a doctor with no notes', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })

    const { status } = await create('p1', { doctor_id: 'd1' })
    expect(status).toBe(200)
  })

  it('rejects a consultation dated before the patient joined', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-03-10' })
    aDoctor({ id: 'd1' })

    const { status, body } = await create('p1', {
      doctor_id: 'd1',
      notes: 'Backdated',
      consultation_date: '2026-03-01T10:00:00.000Z',
    })

    expect(status).toBe(400)
    expect(body.error).toBe('Consultation date cannot be before patient join date')
    expect(db.count('patient_consultations')).toBe(0)
  })

  it('accepts a consultation on the join date itself', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-03-10' })
    aDoctor({ id: 'd1' })

    const { status } = await create('p1', {
      doctor_id: 'd1',
      notes: 'Admission',
      consultation_date: '2026-03-10T10:00:00.000Z',
    })
    expect(status).toBe(200)
  })

  /**
   * The join-date check compares IST calendar days. 20:30 UTC on the 9th is 02:00 IST on
   * the 10th — the admission day — so an early-morning visit must be accepted. Comparing
   * instants rejected it, and nothing in the form could work around that.
   */
  it('accepts an early-morning IST visit on the join date', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-03-10' })
    aDoctor({ id: 'd1' })

    const { status } = await create('p1', {
      doctor_id: 'd1',
      consultation_date: '2026-03-09T20:30:00.000Z',
    })
    expect(status).toBe(200)
  })

  it('skips the join-date check for a patient with no join date', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: null })
    aDoctor({ id: 'd1' })

    const { status } = await create('p1', {
      doctor_id: 'd1',
      notes: 'x',
      consultation_date: '2020-01-01T00:00:00.000Z',
    })
    expect(status).toBe(200)
  })
})

describe('POST /api/patients/[id]/consultations — stored record', () => {
  it('records the consultation against the patient and the creating user', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })

    const { status, body } = await create('p1', {
      doctor_id: 'd1',
      notes: 'Chest pain',
      billing_id: 'b1',
      consultation_date: '2026-03-12T09:00:00.000Z',
    })

    expect(status).toBe(200)
    expect(body.id).toEqual(expect.any(String))

    expect(db.rows('patient_consultations')[0]).toMatchObject({
      patient_id: 'p1',
      doctor_id: 'd1',
      notes: 'Chest pain',
      billing_id: 'b1',
      created_by: 'u-nurse',
      visit_number: 1,
    })
  })

  it('defaults the consultation date to now', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })

    await create('p1', { doctor_id: 'd1', notes: 'Walk-in' })
    expect(db.rows('patient_consultations')[0].consultation_date).toBe(NOW.toISOString())
  })

  it('normalises the consultation date to UTC', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })

    // What the UI sends: a wall-clock time with an explicit IST offset. This is exactly
    // the string toISTInstant() produces, and the assertion below is the contract it has
    // to keep meeting.
    await create('p1', {
      doctor_id: 'd1',
      notes: 'Evening round',
      consultation_date: '2026-03-12T18:30:00+05:30',
    })

    expect(db.rows('patient_consultations')[0].consultation_date).toBe('2026-03-12T13:00:00.000Z')
  })

  it('numbers visits per doctor', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })
    aDoctor({ id: 'd2' })

    await create('p1', { doctor_id: 'd1', notes: 'first' })
    await create('p1', { doctor_id: 'd1', notes: 'second' })
    await create('p1', { doctor_id: 'd2', notes: 'other doctor' })

    const visits = db.rows('patient_consultations')
    expect(visits.find((c) => c.notes === 'first')!.visit_number).toBe(1)
    expect(visits.find((c) => c.notes === 'second')!.visit_number).toBe(2)
    expect(visits.find((c) => c.notes === 'other doctor')!.visit_number).toBe(1)
  })

  it('does not count soft-deleted visits towards the visit number', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p1', doctor_id: 'd1', deleted_at: '2026-03-01T00:00:00.000Z' })

    await create('p1', { doctor_id: 'd1', notes: 'fresh' })

    expect(db.rows('patient_consultations').find((c) => c.notes === 'fresh')!.visit_number).toBe(1)
  })

  it('does not count another patient’s visits to the same doctor', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aDoctor({ id: 'd1' })
    aConsultation({ patient_id: 'p2', doctor_id: 'd1' })

    await create('p1', { doctor_id: 'd1', notes: 'first for p1' })

    expect(db.rows('patient_consultations').find((c) => c.notes === 'first for p1')!.visit_number).toBe(1)
  })
})

describe('PATCH /api/patients/[id]/consultations/[consultationId]', () => {
  it('returns 404 for an unknown consultation', async () => {
    await signInAs('ADMIN', { seedUser: true })

    const { status, body } = await edit('p1', 'missing', { notes: 'x' })
    expect(status).toBe(404)
    expect(body.error).toBe('Consultation not found')
  })

  it('returns 404 when the consultation belongs to another patient', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p2' })

    expect((await edit('p1', 'c1', { notes: 'x' })).status).toBe(404)
  })

  it('lets the creator edit their own consultation', async () => {
    await signInAs('NURSE', { userId: 'u-nurse', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', created_by: 'u-nurse', notes: 'old' })

    const { status } = await edit('p1', 'c1', { notes: 'updated' })

    expect(status).toBe(200)
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.notes).toBe('updated')
  })

  it('lets an admin edit someone else’s consultation', async () => {
    await signInAs('ADMIN', { userId: 'u-admin', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', created_by: 'someone-else' })

    expect((await edit('p1', 'c1', { notes: 'admin edit' })).status).toBe(200)
  })

  it('refuses when the caller is neither the creator nor an admin', async () => {
    await signInAs('NURSE', { userId: 'u-nurse', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', created_by: 'someone-else', notes: 'original' })

    const { status, body } = await edit('p1', 'c1', { notes: 'hijack' })

    expect(status).toBe(403)
    expect(body.error).toBe('You do not have permission to edit this consultation')
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.notes).toBe('original')
  })

  it('stamps updated_by and updated_at', async () => {
    await signInAs('ADMIN', { userId: 'u-admin', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1' })

    await edit('p1', 'c1', { notes: 'x' })

    expect(db.find('patient_consultations', (r) => r.id === 'c1')).toMatchObject({
      updated_by: 'u-admin',
      updated_at: NOW.toISOString(),
    })
  })

  it('leaves omitted fields untouched', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1', notes: 'keep', billing_id: 'b1' })

    await edit('p1', 'c1', { notes: 'changed' })

    expect(db.find('patient_consultations', (r) => r.id === 'c1')).toMatchObject({
      doctor_id: 'd1',
      billing_id: 'b1',
      notes: 'changed',
    })
  })

  it('normalises an edited date to UTC', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1' })

    await edit('p1', 'c1', { consultation_date: '2026-03-12T18:30:00+05:30' })

    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.consultation_date).toBe('2026-03-12T13:00:00.000Z')
  })

  /**
   * Known defect — see BUGS.md #14. The create endpoint refuses a consultation dated
   * before the patient joined; the edit endpoint applies no such check, so the same
   * invalid state can be reached in two steps.
   */
  it.fails('should reject an edit that moves the date before the join date', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aPatient({ id: 'p1', date_of_join: '2026-03-10' })
    aConsultation({ id: 'c1', patient_id: 'p1' })

    const { status } = await edit('p1', 'c1', { consultation_date: '2020-01-01T00:00:00.000Z' })
    expect(status).toBe(400)
  })
})

describe('DELETE /api/patients/[id]/consultations/[consultationId]', () => {
  it('returns 404 for an unknown consultation', async () => {
    await signInAs('ADMIN', { seedUser: true })

    const { status, body } = await remove('p1', 'missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Consultation not found')
  })

  it('soft-deletes rather than removing the row', async () => {
    await signInAs('ADMIN', { userId: 'u-admin', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1' })

    const { status, body } = await remove('p1', 'c1')

    expect(status).toBe(200)
    expect(body).toEqual({ success: true, message: 'Consultation deleted successfully' })

    const stored = db.find('patient_consultations', (r) => r.id === 'c1')!
    expect(stored).toBeDefined()
    expect(stored.deleted_at).toBe(NOW.toISOString())
  })

  it('refuses when the caller is neither the creator nor an admin', async () => {
    await signInAs('NURSE', { userId: 'u-nurse', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', created_by: 'someone-else' })

    const { status, body } = await remove('p1', 'c1')

    expect(status).toBe(403)
    expect(body.error).toBe('You do not have permission to delete this consultation')
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.deleted_at).toBeNull()
  })

  it('lets the creator delete their own consultation', async () => {
    await signInAs('NURSE', { userId: 'u-nurse', seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', created_by: 'u-nurse' })

    expect((await remove('p1', 'c1')).status).toBe(200)
  })

  it('blocks deletion when the doctor’s fees for this patient are settled', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aDoctor({ id: 'd1' })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', settled: true })

    const { status, body } = await remove('p1', 'c1')

    expect(status).toBe(409)
    expect(body).toMatchObject({
      error: 'Cannot delete consultation with settled fees',
      settlementFound: true,
    })
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.deleted_at).toBeNull()
  })

  it('allows deletion when the settlement is unsettled', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', settled: false })

    expect((await remove('p1', 'c1')).status).toBe(200)
  })

  it('ignores a settled settlement that was itself soft-deleted', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', settled: true, deleted_at: '2026-03-01T00:00:00.000Z' })

    expect((await remove('p1', 'c1')).status).toBe(200)
  })

  it('ignores a settled settlement for a different doctor', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: 'd1' })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd2', settled: true })

    expect((await remove('p1', 'c1')).status).toBe(200)
  })

  it('skips the settlement check entirely when the consultation has no doctor', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', patient_id: 'p1', doctor_id: null })
    aSettlement({ id: 's1', patient_id: 'p1', doctor_id: 'd1', settled: true })

    expect((await remove('p1', 'c1')).status).toBe(200)
  })

  /**
   * Known defect — see BUGS.md #15. The settled-fee guard matches on doctor + patient,
   * not on this consultation's own billing cycle. One settled settlement therefore blocks
   * deleting *every* consultation that patient ever had with that doctor, including
   * later, unsettled ones.
   */
  it.fails('should only block the consultations covered by the settled settlement', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aSettlement({ id: 's1', patient_id: 'p1', patient_billing_id: 'b-old', doctor_id: 'd1', settled: true })
    aConsultation({ id: 'c-new', patient_id: 'p1', doctor_id: 'd1', billing_id: 'b-new' })

    const { status } = await remove('p1', 'c-new')
    expect(status).toBe(200)
  })
})
