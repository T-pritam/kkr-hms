/**
 * /api/patients — list, create, read, update, delete, and the active-patient picker.
 */

import { describe, it, expect } from 'vitest'
import { GET as listPatients, POST as createPatient } from '@/app/api/patients/route'
import {
  GET as getPatient,
  PUT as replacePatient,
  PATCH as patchPatient,
  DELETE as deletePatient,
} from '@/app/api/patients/[id]/route'
import { GET as activePatients } from '@/app/api/patients/active/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, expiredToken } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aPatient, aBilling } from '../../helpers/seed'
import { TODAY } from '../../setup'

describe('/api/patients — authentication', () => {
  const endpoints = [
    { name: 'GET /api/patients', run: () => call(listPatients, 'GET', '/api/patients') },
    {
      name: 'POST /api/patients',
      run: () => call(createPatient, 'POST', '/api/patients', { body: { patient_id: '1/25', name: 'A' } }),
    },
    { name: 'GET /api/patients/[id]', run: () => call(getPatient, 'GET', '/api/patients/p1', { params: { id: 'p1' } }) },
    {
      name: 'PUT /api/patients/[id]',
      run: () => call(replacePatient, 'PUT', '/api/patients/p1', { body: {}, params: { id: 'p1' } }),
    },
    {
      name: 'PATCH /api/patients/[id]',
      run: () => call(patchPatient, 'PATCH', '/api/patients/p1', { body: {}, params: { id: 'p1' } }),
    },
    {
      name: 'DELETE /api/patients/[id]',
      run: () => call(deletePatient, 'DELETE', '/api/patients/p1', { params: { id: 'p1' } }),
    },
    { name: 'GET /api/patients/active', run: () => call(activePatients, 'GET', '/api/patients/active') },
  ]

  it.each(endpoints)('$name rejects an unauthenticated caller', async ({ run }) => {
    signOut()
    const { status, body } = await run()

    expect(status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it.each(endpoints)('$name rejects an expired token', async ({ run }) => {
    signOut()
    const { status, body } = await run()
    expect(status).toBe(401)
    expect(body.error).toBe('Unauthorized')

    const withExpired = await (async () => {
      const { cookieJar } = await import('../../helpers/cookie-jar')
      cookieJar.set('accessToken', await expiredToken())
      return run()
    })()
    expect(withExpired.status).toBe(401)
    expect(withExpired.body.error).toBe('Invalid token')
  })

  /**
   * Every role can reach every patient endpoint — including hard delete. There is no
   * role check anywhere in this file. See BUGS.md #9.
   */
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('allows %s (no role checks exist here)', async (role) => {
    await signInAs(role)
    const { status } = await call(listPatients, 'GET', '/api/patients')
    expect(status).toBe(200)
  })
})

describe('GET /api/patients', () => {
  it('returns patients with pagination metadata', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh' })
    aPatient({ id: 'p2', name: 'Suresh' })

    const { status, body } = await call(listPatients, 'GET', '/api/patients')

    expect(status).toBe(200)
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 10, totalPages: 1 })
    expect(body.patients).toHaveLength(2)
  })

  it('returns an empty list rather than failing when there are no patients', async () => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await call(listPatients, 'GET', '/api/patients')

    expect(status).toBe(200)
    expect(body).toMatchObject({ patients: [], total: 0, totalPages: 0 })
  })

  it('orders by join date descending, then by creation date', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'older', date_of_join: '2026-01-01' })
    aPatient({ id: 'newest', date_of_join: '2026-03-01' })
    aPatient({ id: 'middle', date_of_join: '2026-02-01' })

    const { body } = await call(listPatients, 'GET', '/api/patients')
    expect(body.patients.map((p: any) => p.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('paginates', async () => {
    await signInAs('RECEPTIONIST')
    for (let i = 1; i <= 5; i++) aPatient({ id: `p${i}`, date_of_join: `2026-03-0${i}` })

    const { body } = await call(listPatients, 'GET', '/api/patients', { query: { page: 2, pageSize: 2 } })

    expect(body).toMatchObject({ total: 5, page: 2, pageSize: 2, totalPages: 3 })
    expect(body.patients.map((p: any) => p.id)).toEqual(['p3', 'p2'])
  })

  it('searches by name, patient_id and phone', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh Kumar', patient_id: '1/25', phone: '9990001111' })
    aPatient({ id: 'p2', name: 'Suresh Rao', patient_id: '2/25', phone: '8880002222' })

    const byName = await call(listPatients, 'GET', '/api/patients', { query: { search: 'ramesh' } })
    expect(byName.body.patients.map((p: any) => p.id)).toEqual(['p1'])

    const byPatientId = await call(listPatients, 'GET', '/api/patients', { query: { search: '2/25' } })
    expect(byPatientId.body.patients.map((p: any) => p.id)).toEqual(['p2'])

    const byPhone = await call(listPatients, 'GET', '/api/patients', { query: { search: '9990' } })
    expect(byPhone.body.patients.map((p: any) => p.id)).toEqual(['p1'])
  })

  it('reports the total for a filtered search, not the table size', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh' })
    aPatient({ id: 'p2', name: 'Suresh' })

    const { body } = await call(listPatients, 'GET', '/api/patients', { query: { search: 'ramesh' } })
    expect(body.total).toBe(1)
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('RECEPTIONIST')
    db.failNext('patients')

    const { status } = await call(listPatients, 'GET', '/api/patients')
    expect(status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #10. pageSize is taken from the query string with no
   * upper bound, so `?pageSize=100000` streams the entire table in one response.
   */
  it.fails('should cap pageSize', async () => {
    await signInAs('RECEPTIONIST')
    for (let i = 1; i <= 5; i++) aPatient({ id: `p${i}` })

    const { body } = await call(listPatients, 'GET', '/api/patients', { query: { pageSize: 100000 } })
    expect(body.pageSize).toBeLessThanOrEqual(100)
  })
})

describe('POST /api/patients', () => {
  const create = (body: unknown) => call(createPatient, 'POST', '/api/patients', { body })

  it('requires patient_id and name', async () => {
    await signInAs('RECEPTIONIST')

    expect((await create({ name: 'Ramesh' })).body.error).toBe('Patient ID and name are required')
    expect((await create({ patient_id: '1/25' })).body.error).toBe('Patient ID and name are required')
    expect((await create({})).status).toBe(400)
  })

  it('rejects a duplicate patient_id', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ patient_id: '1/25' })

    const { status, body } = await create({ patient_id: '1/25', name: 'Someone Else' })

    expect(status).toBe(400)
    expect(body.error).toBe('Patient ID already exists')
    expect(db.count('patients')).toBe(1)
  })

  it('creates the patient with sensible defaults', async () => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await create({ patient_id: '1/25', name: 'Ramesh Kumar' })

    expect(status).toBe(201)
    expect(body).toEqual({ message: 'Patient created successfully' })

    const stored = db.rows('patients')[0]
    expect(stored).toMatchObject({
      patient_id: '1/25',
      name: 'Ramesh Kumar',
      gender: 'Male',
      date_of_join: TODAY,
      status: 'Active',
      phone: null,
      address: null,
    })
  })

  it('stores every optional field it is given', async () => {
    await signInAs('RECEPTIONIST')
    await create({
      patient_id: '2/25',
      name: 'Suresh',
      phone: '9876543210',
      gender: 'Female',
      date_of_birth: '1985-06-15',
      date_of_join: '2026-03-10',
      address: '12 Main Street',
      referred_by: 'ref-1',
      emergency_contact_name: 'Kumar',
      emergency_contact_phone: '9998887777',
      medical_history: 'Diabetes',
      allergies: 'Penicillin',
      current_medications: 'Metformin',
    })

    expect(db.rows('patients')[0]).toMatchObject({
      gender: 'Female',
      date_of_birth: '1985-06-15',
      date_of_join: '2026-03-10',
      address: '12 Main Street',
      referred_by: 'ref-1',
      emergency_contact_name: 'Kumar',
      medical_history: 'Diabetes',
      allergies: 'Penicillin',
      current_medications: 'Metformin',
    })
  })

  it('opens a billing record for the new patient', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    await create({ patient_id: '1/25', name: 'Ramesh' })

    const patient = db.rows('patients')[0]
    const billing = db.rows('patient_billing')[0]

    expect(billing).toMatchObject({
      patient_id: patient.id,
      base_charge: 0,
      total_doctor_fees: 0,
      patient_charges_total: 0,
      patient_paid_amount: 0,
      billing_status: 'pending',
      referral_settled: false,
      created_by: 'u-recep',
    })
  })

  it('still reports success when the billing insert fails, leaving the patient without billing', async () => {
    await signInAs('RECEPTIONIST')
    db.failNext('patient_billing')

    const { status } = await create({ patient_id: '1/25', name: 'Ramesh' })

    expect(status).toBe(201)
    expect(db.count('patients')).toBe(1)
    expect(db.count('patient_billing')).toBe(0)
  })

  it('returns 500 when the patient insert fails', async () => {
    await signInAs('RECEPTIONIST')
    db.failNext('patients') // duplicate check
    db.failNext('patients') // insert

    const { status } = await create({ patient_id: '1/25', name: 'Ramesh' })
    expect(status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #11. The response carries only a message, so the client
   * cannot learn the new patient's id and has to re-query the list to find it.
   */
  it.fails('should return the created patient', async () => {
    await signInAs('RECEPTIONIST')
    const { body } = await create({ patient_id: '1/25', name: 'Ramesh' })

    expect(body.patient?.id).toEqual(expect.any(String))
  })
})

describe('GET /api/patients/[id]', () => {
  it('returns the patient', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh', patient_id: '1/25' })

    const { status, body } = await call(getPatient, 'GET', '/api/patients/p1', { params: { id: 'p1' } })

    expect(status).toBe(200)
    expect(body.patient).toMatchObject({ id: 'p1', name: 'Ramesh', patient_id: '1/25' })
  })

  it('returns 404 for an unknown id', async () => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await call(getPatient, 'GET', '/api/patients/nope', { params: { id: 'nope' } })

    expect(status).toBe(404)
    expect(body.error).toBe('Patient not found')
  })
})

describe('PUT /api/patients/[id]', () => {
  const replace = (id: string, body: unknown) =>
    call(replacePatient, 'PUT', `/api/patients/${id}`, { body, params: { id } })

  it('requires patient_id and name', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { status, body } = await replace('p1', { name: 'Ramesh' })
    expect(status).toBe(400)
    expect(body.error).toBe('Patient ID and name are required')
  })

  it('updates the record', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Old Name', phone: '1111111111' })

    const { status } = await replace('p1', { patient_id: '1/25', name: 'New Name', phone: '9999999999' })

    expect(status).toBe(200)
    expect(db.find('patients', (r) => r.id === 'p1')).toMatchObject({
      name: 'New Name',
      phone: '9999999999',
    })
  })

  it('allows a patient to keep its own patient_id', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25' })

    const { status } = await replace('p1', { patient_id: '1/25', name: 'Ramesh' })
    expect(status).toBe(200)
  })

  it('rejects a patient_id already used by someone else', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25' })
    aPatient({ id: 'p2', patient_id: '2/25' })

    const { status, body } = await replace('p2', { patient_id: '1/25', name: 'Ramesh' })

    expect(status).toBe(400)
    expect(body.error).toBe('Patient ID already exists')
  })

  it('blanks every optional field the caller omits', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', phone: '9999999999', address: 'Somewhere', allergies: 'Penicillin' })

    await replace('p1', { patient_id: '1/25', name: 'Ramesh' })

    expect(db.find('patients', (r) => r.id === 'p1')).toMatchObject({
      phone: null,
      address: null,
      allergies: null,
    })
  })

  /**
   * Known defect — see BUGS.md #12. `status: status || 'Active'` means any edit that
   * omits status silently re-admits a discharged patient.
   */
  it.fails('should not resurrect a discharged patient when status is omitted', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25', status: 'Discharged' })

    await replace('p1', { patient_id: '1/25', name: 'Ramesh' })

    expect(db.find('patients', (r) => r.id === 'p1')!.status).toBe('Discharged')
  })
})

describe('PATCH /api/patients/[id]', () => {
  const patch = (id: string, body: unknown) =>
    call(patchPatient, 'PATCH', `/api/patients/${id}`, { body, params: { id } })

  it('rejects an empty update', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { status, body } = await patch('p1', {})
    expect(status).toBe(400)
    expect(body.error).toBe('No fields to update')
  })

  it('updates only the whitelisted fields it is given', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh', status: 'Active', phone: '1111111111' })

    const { status } = await patch('p1', { status: 'Discharged' })

    expect(status).toBe(200)
    const stored = db.find('patients', (r) => r.id === 'p1')!
    expect(stored.status).toBe('Discharged')
    expect(stored.name).toBe('Ramesh')
    expect(stored.phone).toBe('1111111111')
  })

  it('ignores fields outside the whitelist', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25', name: 'Ramesh' })

    await patch('p1', { status: 'Discharged', patient_id: 'HACKED', name: 'HACKED' })

    const stored = db.find('patients', (r) => r.id === 'p1')!
    expect(stored.patient_id).toBe('1/25')
    expect(stored.name).toBe('Ramesh')
  })

  it.each([
    ['phone', '9876543210'],
    ['address', 'New Address'],
    ['medical_history', 'Asthma'],
    ['allergies', 'Sulfa'],
    ['current_medications', 'Inhaler'],
    ['emergency_contact_name', 'Kumar'],
    ['emergency_contact_phone', '9998887777'],
  ])('accepts %s', async (field, value) => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    await patch('p1', { [field]: value })
    expect(db.find('patients', (r) => r.id === 'p1')![field]).toBe(value)
  })

  it('can clear a field by sending null', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', allergies: 'Penicillin' })

    await patch('p1', { allergies: null })
    expect(db.find('patients', (r) => r.id === 'p1')!.allergies).toBeNull()
  })
})

describe('DELETE /api/patients/[id]', () => {
  it('deletes the patient', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })

    const { status, body } = await call(deletePatient, 'DELETE', '/api/patients/p1', { params: { id: 'p1' } })

    expect(status).toBe(200)
    expect(body.message).toBe('Patient deleted successfully')
    expect(db.count('patients')).toBe(0)
  })

  /**
   * Known defect — see BUGS.md #9. Any authenticated role can hard-delete a patient, and
   * nothing checks for dependent billing, charges or consultations first. In the real
   * database the foreign keys would reject this; the fake has no such constraint, so this
   * test documents that the route itself offers no protection.
   */
  it.fails('should refuse to delete a patient that still has billing records', async () => {
    await signInAs('NURSE')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await call(deletePatient, 'DELETE', '/api/patients/p1', { params: { id: 'p1' } })

    expect(status).toBeGreaterThanOrEqual(400)
  })
})

describe('GET /api/patients/active', () => {
  it('returns a trimmed list ordered by name', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Zara', patient_id: '2/25' })
    aPatient({ id: 'p2', name: 'Amit', patient_id: '1/25' })

    const { status, body } = await call(activePatients, 'GET', '/api/patients/active')

    expect(status).toBe(200)
    expect(body).toEqual([
      { id: 'p2', patient_id: '1/25', name: 'Amit' },
      { id: 'p1', patient_id: '2/25', name: 'Zara' },
    ])
  })

  /**
   * Known defect — see BUGS.md #13. The filter is `.neq('status', 'discharge')` but the
   * value actually written elsewhere in the app is `'Discharged'`, so discharged patients
   * are never excluded from the picker this endpoint feeds.
   */
  it.fails('should exclude discharged patients', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Active One', status: 'Active' })
    aPatient({ id: 'p2', name: 'Gone', status: 'Discharged' })

    const { body } = await call(activePatients, 'GET', '/api/patients/active')

    expect(body.map((p: any) => p.id)).toEqual(['p1'])
  })
})
