/**
 * /api/doctors/* and /api/referrals — the two reference registries.
 */

import { describe, it, expect } from 'vitest'
import { GET as listDoctors, POST as createDoctor } from '@/app/api/doctors/route'
import { GET as allDoctors } from '@/app/api/doctors/all/route'
import { GET as getDoctor, PUT as updateDoctor, DELETE as deleteDoctor } from '@/app/api/doctors/[id]/route'
import { GET as listReferrals, POST as createReferral } from '@/app/api/referrals/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aDoctor, aReferral, aSettlement, aConsultation } from '../../helpers/seed'

const list = (query = {}) => call(listDoctors, 'GET', '/api/doctors', { query })
const create = (body: unknown) => call(createDoctor, 'POST', '/api/doctors', { body })
const all = () => call(allDoctors, 'GET', '/api/doctors/all')
const read = (id: string) => call(getDoctor, 'GET', `/api/doctors/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateDoctor, 'PUT', `/api/doctors/${id}`, { body, params: { id } })
const remove = (id: string) => call(deleteDoctor, 'DELETE', `/api/doctors/${id}`, { params: { id } })

describe('/api/doctors — authentication', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({ name: 'Dr. X' })).status).toBe(401)
    expect((await all()).status).toBe(401)
    expect((await read('d1')).status).toBe(401)
    expect((await update('d1', { name: 'X' })).status).toBe(401)
    expect((await remove('d1')).status).toBe(401)
  })

  /** Any signed-in role can add, edit and delete doctors — there is no role check. See BUGS.md #47. */
  it.each(['NURSE', 'RECEPTIONIST'] as const)('allows %s to create and delete doctors', async (role) => {
    await signInAs(role)
    aDoctor({ id: 'd1' })

    expect((await create({ name: 'Dr. New' })).status).toBe(201)
    expect((await remove('d1')).status).toBe(200)
  })

  it.fails('should restrict deleting a doctor to admins', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1' })

    expect((await remove('d1')).status).toBe(403)
  })
})

describe('GET /api/doctors', () => {
  it('lists doctors newest first with pagination metadata', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', created_at: '2026-01-01T00:00:00.000Z' })
    aDoctor({ id: 'd2', created_at: '2026-03-01T00:00:00.000Z' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 10, totalPages: 1 })
    expect(body.doctors.map((d: any) => d.id)).toEqual(['d2', 'd1'])
  })

  it('searches by name, specialist, email and mobile', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Ramesh', specialist: 'Cardiology', email: 'ramesh@hms.test', mobile: '9990001111' })
    aDoctor({ id: 'd2', name: 'Dr. Suresh', specialist: 'Orthopaedics', email: 'suresh@hms.test', mobile: '8880002222' })

    expect((await list({ search: 'ramesh' })).body.doctors.map((d: any) => d.id)).toEqual(['d1'])
    expect((await list({ search: 'ortho' })).body.doctors.map((d: any) => d.id)).toEqual(['d2'])
    expect((await list({ search: '9990' })).body.doctors.map((d: any) => d.id)).toEqual(['d1'])
  })

  it('paginates', async () => {
    await signInAs('ADMIN')
    for (let i = 1; i <= 5; i++) aDoctor({ id: `d${i}`, created_at: `2026-01-0${i}T00:00:00.000Z` })

    const { body } = await list({ page: 2, pageSize: 2 })
    expect(body.doctors.map((d: any) => d.id)).toEqual(['d3', 'd2'])
    expect(body.totalPages).toBe(3)
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
    expect(body.error).toBe('Name is required')
  })

  it('creates the doctor', async () => {
    await signInAs('ADMIN')

    const { status } = await create({
      name: 'Dr. Ramesh',
      mobile: '9990001111',
      email: 'ramesh@hms.test',
      designation: 'Consultant',
      specialist: 'Cardiology',
    })

    expect(status).toBe(201)
    expect(db.rows('doctors')[0]).toMatchObject({
      name: 'Dr. Ramesh',
      mobile: '9990001111',
      email: 'ramesh@hms.test',
      designation: 'Consultant',
      specialist: 'Cardiology',
    })
  })
})

describe('GET /api/doctors/all', () => {
  it('returns a trimmed list ordered by name', async () => {
    await signInAs('NURSE')
    aDoctor({ id: 'd1', name: 'Dr. Zara' })
    aDoctor({ id: 'd2', name: 'Dr. Amit' })

    const { status, body } = await all()

    expect(status).toBe(200)
    expect(body).toEqual([
      { id: 'd2', name: 'Dr. Amit', specialist: 'General Medicine' },
      { id: 'd1', name: 'Dr. Zara', specialist: 'General Medicine' },
    ])
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

    expect((await update('d1', { specialist: 'ENT' })).body.error).toBe('Name is required')
  })

  it('updates the doctor', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1', name: 'Dr. Old', specialist: 'ENT' })

    const { status } = await update('d1', { name: 'Dr. New', specialist: 'Cardiology' })

    expect(status).toBe(200)
    expect(db.find('doctors', (r) => r.id === 'd1')).toMatchObject({ name: 'Dr. New', specialist: 'Cardiology' })
  })

  it('hard-deletes the doctor', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })

    expect((await remove('d1')).status).toBe(200)
    expect(db.count('doctors')).toBe(0)
  })

  /**
   * Known defect — see BUGS.md #48. Doctors are deleted outright with no soft-delete and
   * no dependency check, even when consultations and settlements still reference them. In
   * the live database the foreign keys would reject this; the route offers no guard and no
   * useful error.
   */
  it.fails('should refuse to delete a doctor who still has consultations', async () => {
    await signInAs('ADMIN')
    aDoctor({ id: 'd1' })
    aConsultation({ doctor_id: 'd1' })
    aSettlement({ doctor_id: 'd1' })

    const { status } = await remove('d1')

    expect(status).toBeGreaterThanOrEqual(400)
    expect(db.count('doctors')).toBe(1)
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
