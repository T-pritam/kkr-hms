/**
 * /api/doctors/* and /api/referrals — the two reference registries.
 *
 * The doctors half was rewritten with the registry rebuild. Two behaviours it
 * previously documented as defects are now the point of the tests: PUT and
 * DELETE had no role check at all, and DELETE was a hard delete with no
 * dependency check while consultations, fee settlements, lab orders and signed
 * discharge summaries all referenced the row (BUGS.md #47/#48).
 */

import { describe, it, expect } from 'vitest'
import { GET as listDoctors, POST as createDoctor } from '@/app/api/doctors/route'
import { GET as allDoctors } from '@/app/api/doctors/all/route'
import { GET as getDoctor, PUT as updateDoctor, DELETE as deleteDoctor } from '@/app/api/doctors/[id]/route'
import {
  POST as deactivateDoctor,
  DELETE as reactivateDoctor,
} from '@/app/api/doctors/[id]/deactivate/route'
import { GET as listReferrals, POST as createReferral } from '@/app/api/referrals/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aDoctor, aReferral, aSettlement, aConsultation } from '../../helpers/seed'

const list = (query = {}) => call(listDoctors, 'GET', '/api/doctors', { query })
const create = (body: unknown) => call(createDoctor, 'POST', '/api/doctors', { body })
const all = (query = {}) => call(allDoctors, 'GET', '/api/doctors/all', { query })
const read = (id: string) => call(getDoctor, 'GET', `/api/doctors/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateDoctor, 'PUT', `/api/doctors/${id}`, { body, params: { id } })
const remove = (id: string) => call(deleteDoctor, 'DELETE', `/api/doctors/${id}`, { params: { id } })
const deactivate = (id: string) =>
  call(deactivateDoctor, 'POST', `/api/doctors/${id}/deactivate`, { params: { id } })
const reactivate = (id: string) =>
  call(reactivateDoctor, 'DELETE', `/api/doctors/${id}/deactivate`, { params: { id } })

describe('/api/doctors — authorisation', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({ name: 'Dr. X' })).status).toBe(401)
    expect((await all()).status).toBe(401)
    expect((await read('d1')).status).toBe(401)
    expect((await update('d1', { name: 'X' })).status).toBe(401)
    expect((await remove('d1')).status).toBe(401)
    expect((await deactivate('d1')).status).toBe(401)
  })

  /** The list feeds every picker in the app, so everyone can read it. */
  it.each(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'lets %s read the registry',
    async (role) => {
      await signInAs(role)
      expect((await list()).status).toBe(200)
      expect((await all()).status).toBe(200)
    },
  )

  it.each(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
    'lets %s add and edit a doctor',
    async (role) => {
      await signInAs(role)
      aDoctor({ id: 'd1' })

      expect((await create({ name: 'Dr. New' })).status).toBe(201)
      expect((await update('d1', { name: 'Dr. Edited' })).status).toBe(200)
      expect((await deactivate('d1')).status).toBe(200)
    },
  )

  /** Running the lab does not include rewriting the consultant list. */
  it('forbids LAB_TECHNICIAN from writing', async () => {
    await signInAs('LAB_TECHNICIAN')
    aDoctor({ id: 'd1' })

    expect((await create({ name: 'Dr. New' })).status).toBe(403)
    expect((await update('d1', { name: 'Dr. Edited' })).status).toBe(403)
    expect((await deactivate('d1')).status).toBe(403)
  })

  /** Destroying the row outright is admin-only — BUGS.md #47. */
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'refuses %s a hard delete',
    async (role) => {
      await signInAs(role)
      aDoctor({ id: 'd1' })

      expect((await remove('d1')).status).toBe(403)
      expect(db.count('doctors')).toBe(1)
    },
  )
})

describe('GET /api/doctors', () => {
  it('lists doctors by name with pagination metadata', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Zara' })
    aDoctor({ id: 'd2', name: 'Dr. Amit' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 10, totalPages: 1 })
    expect(body.doctors.map((d: any) => d.id)).toEqual(['d2', 'd1'])
  })

  it('searches by name, specialist, department, qualification, email and mobile', async () => {
    await signInAs('ADMIN')
    aDoctor({
      id: 'd1',
      name: 'Dr. Ramesh',
      specialist: 'Cardiology',
      department: 'Cardiology',
      qualification: 'MBBS, MD',
      email: 'ramesh@hms.test',
      mobile: '9990001111',
    })
    aDoctor({
      id: 'd2',
      name: 'Dr. Suresh',
      specialist: 'Orthopaedics',
      department: 'Orthopaedics',
      qualification: 'MBBS, MS (Ortho)',
      email: 'suresh@hms.test',
      mobile: '8880002222',
    })

    expect((await list({ search: 'ramesh' })).body.doctors.map((d: any) => d.id)).toEqual(['d1'])
    expect((await list({ search: 'ortho' })).body.doctors.map((d: any) => d.id)).toEqual(['d2'])
    expect((await list({ search: '9990' })).body.doctors.map((d: any) => d.id)).toEqual(['d1'])
    expect((await list({ search: 'MD' })).body.doctors.map((d: any) => d.id)).toEqual(['d1'])
  })

  it('filters by department', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', department: 'Cardiology' })
    aDoctor({ id: 'd2', department: 'Paediatrics' })

    expect((await list({ department: 'Paediatrics' })).body.doctors.map((d: any) => d.id)).toEqual(['d2'])
  })

  it('ignores a department that is not on the list', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', department: 'Cardiology' })

    expect((await list({ department: 'Astrology' })).body.doctors).toHaveLength(1)
  })

  /** The screen shows everyone by default; the filter is opt-in. */
  it('filters by active status only when asked', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Active', is_active: true })
    aDoctor({ id: 'd2', name: 'Dr. Retired', is_active: false })

    expect((await list()).body.doctors).toHaveLength(2)
    expect((await list({ active: 'true' })).body.doctors.map((d: any) => d.id)).toEqual(['d1'])
    expect((await list({ active: 'false' })).body.doctors.map((d: any) => d.id)).toEqual(['d2'])
  })

  it('paginates', async () => {
    await signInAs('ADMIN')
    for (let i = 1; i <= 5; i++) aDoctor({ id: `d${i}`, name: `Dr. ${i}` })

    const { body } = await list({ page: 2, pageSize: 2 })
    expect(body.doctors.map((d: any) => d.id)).toEqual(['d3', 'd4'])
    expect(body.totalPages).toBe(3)
  })

  it('caps pageSize', async () => {
    await signInAs('ADMIN')
    expect((await list({ pageSize: 100000 })).body.pageSize).toBe(100)
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('ADMIN')
    db.failNext('doctors')

    expect((await list()).status).toBe(500)
  })
})

describe('POST /api/doctors', () => {
  it('requires a name', async () => {
    await signInAs('ADMIN')

    const { status, body } = await create({ specialist: 'Cardiology' })
    expect(status).toBe(400)
    expect(body.fieldErrors.name).toMatch(/required/i)
  })

  it('rejects a name that is only whitespace', async () => {
    await signInAs('ADMIN')
    expect((await create({ name: '   ' })).status).toBe(400)
  })

  it('creates the doctor, active, and returns the row', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })

    const { status, body } = await create({
      name: 'Dr. Ramesh',
      qualification: 'MBBS, MD (Gen. Med.)',
      designation: 'Consultant',
      department: 'General Medicine',
      specialist: 'Cardiology',
      mobile: '9990001111',
      email: 'ramesh@hms.test',
      registration_no: 'TSMC/12345',
    })

    expect(status).toBe(201)
    // The case sheet editor selects the row it just created, so it must come back.
    expect(body.doctor.id).toEqual(expect.any(String))

    expect(db.rows('doctors')[0]).toMatchObject({
      name: 'Dr. Ramesh',
      qualification: 'MBBS, MD (Gen. Med.)',
      department: 'General Medicine',
      registration_no: 'TSMC/12345',
      is_active: true,
      created_by: 'u-admin',
    })
  })

  it.each([
    ['an unknown department', { department: 'Astrology' }, 'department'],
    ['a malformed email', { email: 'not-an-email' }, 'email'],
    ['a mobile too short to dial', { mobile: '12' }, 'mobile'],
  ])('rejects %s', async (_label, patch, field) => {
    await signInAs('ADMIN')
    const { status, body } = await create({ name: 'Dr. Ramesh', ...patch })

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty(field)
  })
})

describe('GET /api/doctors/all', () => {
  it('returns a trimmed list ordered by name', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1', name: 'Dr. Zara' })
    aDoctor({ id: 'd2', name: 'Dr. Amit' })

    const { status, body } = await all()

    expect(status).toBe(200)
    expect(body.map((d: any) => d.id)).toEqual(['d2', 'd1'])
    expect(body[0]).toMatchObject({ name: 'Dr. Amit', specialist: 'General Medicine' })
  })

  /** This is what makes deactivation mean anything: the pickers stop offering them. */
  it('omits inactive doctors', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1', name: 'Dr. Active' })
    aDoctor({ id: 'd2', name: 'Dr. Retired', is_active: false })

    expect((await all()).body.map((d: any) => d.id)).toEqual(['d1'])
  })

  /**
   * Editing a consultation whose doctor has since retired must not silently
   * drop the selection because the picker no longer lists them.
   */
  it('adds one named doctor back regardless of status', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1', name: 'Dr. Active' })
    aDoctor({ id: 'd2', name: 'Dr. Retired', is_active: false })

    const { body } = await all({ includeId: 'd2' })
    expect(body.map((d: any) => d.id).sort()).toEqual(['d1', 'd2'])
  })

  it('carries the fields the pickers actually read', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1', designation: 'Consultant', qualification: 'MBBS', department: 'Cardiology' })

    // designation was read by the case sheet multi-select and never selected,
    // so it was always undefined.
    expect((await all()).body[0]).toMatchObject({
      designation: 'Consultant',
      qualification: 'MBBS',
      department: 'Cardiology',
    })
  })
})

describe('/api/doctors/[id]', () => {
  it('returns 404 for an unknown doctor', async () => {
    await signInAs('ADMIN')

    const { status, body } = await read('missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Doctor not found')
  })

  it('returns the doctor', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })

    expect((await read('d1')).body.doctor).toMatchObject({ id: 'd1', name: 'Dr. Ramesh' })
  })

  it('requires a name on update', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })

    const { status, body } = await update('d1', { name: '', specialist: 'ENT' })
    expect(status).toBe(400)
    expect(body.fieldErrors.name).toBeDefined()
  })

  it('updates the doctor and records who did it', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aDoctor({ id: 'd1', name: 'Dr. Old', specialist: 'ENT' })

    const { status, body } = await update('d1', {
      name: 'Dr. New',
      specialist: 'Cardiology',
      department: 'Cardiology',
    })

    expect(status).toBe(200)
    expect(body.doctor.name).toBe('Dr. New')
    expect(db.find('doctors', r => r.id === 'd1')).toMatchObject({
      name: 'Dr. New',
      specialist: 'Cardiology',
      department: 'Cardiology',
      updated_by: 'u-admin',
    })
  })

  it('deletes a doctor nothing references', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })

    expect((await remove('d1')).status).toBe(200)
    expect(db.count('doctors')).toBe(0)
  })

  it('404s deleting a doctor that is not there', async () => {
    await signInAs('ADMIN')
    expect((await remove('missing')).status).toBe(404)
  })

  /**
   * BUGS.md #48. Every foreign key here is ON DELETE SET NULL, so the delete
   * would not fail — it would quietly blank the doctor's name off consultations,
   * settlements, lab orders and signed discharge summaries.
   */
  it('refuses to delete a doctor who still has consultations, and says what is in the way', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aConsultation({ doctor_id: 'd1' })
    aSettlement({ doctor_id: 'd1' })

    const { status, body } = await remove('d1')

    expect(status).toBe(409)
    expect(db.count('doctors')).toBe(1)
    expect(body.references).toContainEqual({ label: 'consultations', count: 1 })
    expect(body.references).toContainEqual({ label: 'fee settlements', count: 1 })
    expect(body.error).toMatch(/deactivate/i)
  })
})

describe('/api/doctors/[id]/deactivate', () => {
  it('retires a doctor without touching their records', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aDoctor({ id: 'd1', name: 'Dr. Ramesh' })
    aConsultation({ id: 'c1', doctor_id: 'd1' })

    const { status } = await deactivate('d1')

    expect(status).toBe(200)
    expect(db.find('doctors', r => r.id === 'd1')).toMatchObject({
      is_active: false,
      updated_by: 'u-admin',
    })
    // The whole point: the history survives.
    expect(db.find('patient_consultations', r => r.id === 'c1')!.doctor_id).toBe('d1')
  })

  it('brings one back', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', is_active: false })

    expect((await reactivate('d1')).status).toBe(200)
    expect(db.find('doctors', r => r.id === 'd1')!.is_active).toBe(true)
  })

  it('404s for an unknown doctor', async () => {
    await signInAs('ADMIN')
    expect((await deactivate('missing')).status).toBe(404)
  })
})

describe('/api/referrals', () => {
  /**
   * Known defect — see BUGS.md #49. Neither verb authenticates. Every other route in the
   * app checks a token; these two do not, so the referral list can be read and written by
   * anyone who can reach the endpoint.
   */
  it.fails('should reject an unauthenticated read', async () => {
    signOut()
    expect((await call(listReferrals, 'GET', '/api/referrals')).status).toBe(401)
  })

  it.fails('should reject an unauthenticated write', async () => {
    signOut()
    const { status } = await call(createReferral, 'POST', '/api/referrals', { body: { name: 'Anyone' } })
    expect(status).toBe(401)
  })

  it('serves the referral list without any session at all', async () => {
    signOut()
    aReferral({ id: 'r1', name: 'Ramesh' })

    const { status, body } = await call(listReferrals, 'GET', '/api/referrals')

    expect(status).toBe(200)
    expect(body.map((r: any) => r.id)).toEqual(['r1'])
  })

  it('orders referrals by name', async () => {
    await signInAs('ADMIN')
    aReferral({ id: 'r1', name: 'Zara' })
    aReferral({ id: 'r2', name: 'Amit' })

    const { body } = await call(listReferrals, 'GET', '/api/referrals')
    expect(body.map((r: any) => r.id)).toEqual(['r2', 'r1'])
  })

  it('requires a name to create one', async () => {
    await signInAs('ADMIN')

    const { status, body } = await call(createReferral, 'POST', '/api/referrals', { body: {} })
    expect(status).toBe(400)
    expect(body.error).toBe('Referral name is required')
  })

  it('creates an active referral', async () => {
    await signInAs('ADMIN')

    const { status, body } = await call(createReferral, 'POST', '/api/referrals', {
      body: { name: 'Dr. Referrer', phone: '9876500000' },
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({ name: 'Dr. Referrer', phone: '9876500000', status: 'active' })
  })

  it('leaves phone null when not supplied', async () => {
    await signInAs('ADMIN')

    await call(createReferral, 'POST', '/api/referrals', { body: { name: 'No Phone' } })
    expect(db.rows('referrals')[0].phone).toBeNull()
  })

  /**
   * Known defect — see BUGS.md #50. created_by is taken from supabase.auth.getUser(),
   * but the app authenticates with its own JWT cookies and never signs in to Supabase
   * Auth, so this is always null and referrals have no recorded author.
   */
  it.fails('should record who created the referral', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })

    await call(createReferral, 'POST', '/api/referrals', { body: { name: 'Dr. Referrer' } })

    expect(db.rows('referrals')[0].created_by).toBe('u-admin')
  })
})
