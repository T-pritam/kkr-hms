/**
 * /api/patients — the patient register.
 *
 * Rewritten alongside the registry rebuild. The interesting cases here are all
 * things the old routes got wrong: no role checks anywhere but DELETE,
 * `if (!patient_id || !name)` as the entire validation, a hand-typed patient ID
 * guarded by a check-then-insert, an unbounded pageSize, and a PUT that
 * defaulted `status` to 'Active' and so un-discharged anyone it touched.
 */

import { describe, it, expect } from 'vitest'
import { GET as listPatients, POST as createPatient } from '@/app/api/patients/route'
import { GET as nextPatientId } from '@/app/api/patients/next-id/route'
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

/** The four fields registration requires. */
const VALID = { name: 'Ramesh Kumar', gender: 'Male', phone: '9876543210' }

describe('/api/patients — authentication', () => {
  const endpoints = [
    { name: 'GET /api/patients', run: () => call(listPatients, 'GET', '/api/patients') },
    {
      name: 'POST /api/patients',
      run: () => call(createPatient, 'POST', '/api/patients', { body: VALID }),
    },
    { name: 'GET /api/patients/next-id', run: () => call(nextPatientId, 'GET', '/api/patients/next-id') },
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
    const { status } = await run()
    expect(status).toBe(401)
  })

  it.each(endpoints)('$name rejects an expired token', async ({ run }) => {
    const { cookieJar } = await import('../../helpers/cookie-jar')
    cookieJar.set('accessToken', await expiredToken())

    const { status } = await run()
    expect(status).toBe(401)
  })

  it.each(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'lets %s read the register — every screen in the hospital starts from a patient',
    async (role) => {
      await signInAs(role)
      expect((await call(listPatients, 'GET', '/api/patients')).status).toBe(200)
    },
  )

  it.each(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
    'lets %s register a patient',
    async (role) => {
      await signInAs(role)
      expect((await call(createPatient, 'POST', '/api/patients', { body: VALID })).status).toBe(201)
    },
  )

  /** Registering is reception's job. Running the lab is not. */
  it('forbids LAB_TECHNICIAN from registering or editing a patient', async () => {
    await signInAs('LAB_TECHNICIAN')
    aPatient({ id: 'p1' })

    expect((await call(createPatient, 'POST', '/api/patients', { body: VALID })).status).toBe(403)
    expect(
      (await call(replacePatient, 'PUT', '/api/patients/p1', { body: VALID, params: { id: 'p1' } }))
        .status,
    ).toBe(403)
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

  it('defaults to newest joined first', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'older', date_of_join: '2026-01-01' })
    aPatient({ id: 'newest', date_of_join: '2026-03-01' })
    aPatient({ id: 'middle', date_of_join: '2026-02-01' })

    const { body } = await call(listPatients, 'GET', '/api/patients')
    expect(body.patients.map((p: any) => p.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('sorts by a chosen column in a chosen direction', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Zara' })
    aPatient({ id: 'p2', name: 'Amit' })

    const asc = await call(listPatients, 'GET', '/api/patients', {
      query: { sort: 'name', dir: 'asc' },
    })
    expect(asc.body.patients.map((p: any) => p.name)).toEqual(['Amit', 'Zara'])

    const desc = await call(listPatients, 'GET', '/api/patients', {
      query: { sort: 'name', dir: 'desc' },
    })
    expect(desc.body.patients.map((p: any) => p.name)).toEqual(['Zara', 'Amit'])
  })

  /** An unknown sort key must not reach the query builder as a column name. */
  it('falls back to the default order for an unrecognised sort key', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', date_of_join: '2026-01-01' })
    aPatient({ id: 'p2', date_of_join: '2026-03-01' })

    const { status, body } = await call(listPatients, 'GET', '/api/patients', {
      query: { sort: 'nonsense; drop table patients' },
    })

    expect(status).toBe(200)
    expect(body.patients.map((p: any) => p.id)).toEqual(['p2', 'p1'])
  })

  it('filters by status', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', status: 'Active' })
    aPatient({ id: 'p2', status: 'Discharged' })

    const { body } = await call(listPatients, 'GET', '/api/patients', {
      query: { status: 'Discharged' },
    })
    expect(body.patients.map((p: any) => p.id)).toEqual(['p2'])
  })

  it('ignores a status that is not one of the three', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { body } = await call(listPatients, 'GET', '/api/patients', {
      query: { status: 'Inactive' },
    })
    expect(body.patients).toHaveLength(1)
  })

  it('filters by the date-of-join range', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'jan', date_of_join: '2026-01-15' })
    aPatient({ id: 'feb', date_of_join: '2026-02-15' })
    aPatient({ id: 'mar', date_of_join: '2026-03-15' })

    const { body } = await call(listPatients, 'GET', '/api/patients', {
      query: { joinedFrom: '2026-02-01', joinedTo: '2026-02-28' },
    })
    expect(body.patients.map((p: any) => p.id)).toEqual(['feb'])
  })

  it('paginates', async () => {
    await signInAs('RECEPTIONIST')
    for (let i = 1; i <= 5; i++) aPatient({ id: `p${i}`, date_of_join: `2026-03-0${i}` })

    const { body } = await call(listPatients, 'GET', '/api/patients', {
      query: { page: 2, pageSize: 2 },
    })

    expect(body).toMatchObject({ total: 5, page: 2, pageSize: 2, totalPages: 3 })
    expect(body.patients.map((p: any) => p.id)).toEqual(['p3', 'p2'])
  })

  /** BUGS.md #10: `?pageSize=100000` used to stream the whole table. */
  it('caps pageSize', async () => {
    await signInAs('RECEPTIONIST')
    const { body } = await call(listPatients, 'GET', '/api/patients', {
      query: { pageSize: 100000 },
    })
    expect(body.pageSize).toBe(100)
  })

  it.each([
    ['a non-numeric page', { page: 'abc' }, { page: 1 }],
    ['a negative page', { page: -5 }, { page: 1 }],
    ['a zero pageSize', { pageSize: 0 }, { pageSize: 10 }],
  ])('survives %s', async (_label, query, expected) => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await call(listPatients, 'GET', '/api/patients', { query })

    expect(status).toBe(200)
    expect(body).toMatchObject(expected)
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

  /** A name like "Rao (Jr), S" would otherwise parse as PostgREST filter syntax. */
  it('does not let punctuation in the search break the query', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh' })

    const { status } = await call(listPatients, 'GET', '/api/patients', {
      query: { search: 'Rao (Jr), S' },
    })
    expect(status).toBe(200)
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
})

describe('GET /api/patients/next-id', () => {
  it('suggests the next number without consuming it', async () => {
    await signInAs('RECEPTIONIST')

    const first = await call(nextPatientId, 'GET', '/api/patients/next-id')
    const second = await call(nextPatientId, 'GET', '/api/patients/next-id')

    expect(first.status).toBe(200)
    // Two people opening the form see the same suggestion. That is the point —
    // and the reason the allocation happens in POST, not here.
    expect(second.body.data.patient_id).toBe(first.body.data.patient_id)
    expect(db.count('patient_counters')).toBe(0)
  })

  it('continues the series rather than restarting it', async () => {
    await signInAs('RECEPTIONIST')
    const year = new Date().getFullYear()
    db.seed('patient_counters', { year, last_no: 4 })

    const { body } = await call(nextPatientId, 'GET', '/api/patients/next-id')
    expect(body.data.patient_id).toBe(`5/${String(year % 100).padStart(2, '0')}`)
  })
})

describe('POST /api/patients', () => {
  const create = (body: unknown) => call(createPatient, 'POST', '/api/patients', { body })
  const yy = String(new Date().getFullYear() % 100).padStart(2, '0')

  it.each(['name', 'gender', 'phone'] as const)('requires %s', async (field) => {
    await signInAs('RECEPTIONIST')
    const body = { ...VALID, [field]: '' }

    const res = await create(body)

    expect(res.status).toBe(400)
    expect(res.body.fieldErrors).toHaveProperty(field)
  })

  /**
   * Gender used to be pre-selected as "Male" in the form and never enforced, so
   * an unanswered question was stored as a fact and printed on every document.
   */
  it('will not invent a gender', async () => {
    await signInAs('RECEPTIONIST')

    const { status, body } = await create({ name: 'Ramesh', phone: '9876543210' })

    expect(status).toBe(400)
    expect(body.fieldErrors.gender).toMatch(/required/i)
    expect(db.count('patients')).toBe(0)
  })

  it('rejects a gender outside the three known values', async () => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await create({ ...VALID, gender: 'MALE' })

    expect(status).toBe(400)
    expect(body.fieldErrors.gender).toMatch(/Male, Female or Other/)
  })

  it('rejects a phone number that is too short to dial', async () => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await create({ ...VALID, phone: '123' })

    expect(status).toBe(400)
    expect(body.fieldErrors.phone).toBeDefined()
  })

  it('accepts a phone number written with spaces and a country code', async () => {
    await signInAs('RECEPTIONIST')
    const { status } = await create({ ...VALID, phone: '+91 98765 43210' })
    expect(status).toBe(201)
  })

  /**
   * The heart of the ID change: an omitted patient_id is allocated from the
   * counter under a row lock, not taken from whatever the form was showing.
   */
  it('issues a patient ID when the caller does not supply one', async () => {
    await signInAs('RECEPTIONIST')
    const year = new Date().getFullYear()
    db.seed('patient_counters', { year, last_no: 4 })

    const { status, body } = await create(VALID)

    expect(status).toBe(201)
    expect(body.patient.patient_id).toBe(`5/${yy}`)
    expect(db.find('patient_counters', r => r.year === year)!.last_no).toBe(5)
  })

  it('gives two simultaneous registrations different IDs', async () => {
    await signInAs('RECEPTIONIST')

    const first = await create(VALID)
    const second = await create({ ...VALID, name: 'Suresh' })

    expect(first.body.patient.patient_id).toBe(`1/${yy}`)
    expect(second.body.patient.patient_id).toBe(`2/${yy}`)
  })

  it('keeps a patient ID the caller typed', async () => {
    await signInAs('RECEPTIONIST')

    const { body } = await create({ ...VALID, patient_id: 'LEGACY-7' })

    expect(body.patient.patient_id).toBe('LEGACY-7')
    // A typed ID must not burn a number from the series.
    expect(db.count('patient_counters')).toBe(0)
  })

  it('reports a duplicate patient ID as a 409 against the field', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ patient_id: '1/25' })

    const { status, body } = await create({ ...VALID, patient_id: '1/25' })

    expect(status).toBe(409)
    expect(body.fieldErrors.patient_id).toBeDefined()
    expect(db.count('patients')).toBe(1)
  })

  it('creates the patient with sensible defaults', async () => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await create(VALID)

    expect(status).toBe(201)
    // BUGS.md #11: the response used to carry only a message, so the client had
    // to re-query the list to find out what it had just made.
    expect(body.patient.id).toEqual(expect.any(String))

    const stored = db.rows('patients')[0]
    expect(stored).toMatchObject({
      name: 'Ramesh Kumar',
      gender: 'Male',
      date_of_join: TODAY,
      status: 'Active',
    })
    // Anything not sent is simply not written, and the column default is NULL.
    expect(stored.address ?? null).toBeNull()
  })

  it('stores every optional field it is given', async () => {
    await signInAs('RECEPTIONIST')
    await create({
      ...VALID,
      patient_id: '2/25',
      date_of_birth: '1985-06-15',
      date_of_join: '2026-03-10',
      blood_group: 'O+',
      email: 'suresh@example.com',
      alternate_phone: '9998887777',
      address: '12 Main Street',
      referred_by: 'ref-1',
      emergency_contact_name: 'Kumar',
      emergency_contact_relation: 'Son',
      emergency_contact_phone: '9998887777',
      id_proof_type: 'Aadhaar',
      id_proof_number: '1234 5678 9012',
      medical_history: 'Diabetes',
      allergies: 'Penicillin',
      current_medications: 'Metformin',
    })

    expect(db.rows('patients')[0]).toMatchObject({
      date_of_birth: '1985-06-15',
      date_of_join: '2026-03-10',
      blood_group: 'O+',
      email: 'suresh@example.com',
      alternate_phone: '9998887777',
      address: '12 Main Street',
      referred_by: 'ref-1',
      emergency_contact_relation: 'Son',
      id_proof_type: 'Aadhaar',
      id_proof_number: '1234 5678 9012',
      medical_history: 'Diabetes',
    })
  })

  /**
   * A stated age is stored with the date it was stated, never back-computed
   * into a date of birth — that would fabricate a fact which then prints on a
   * discharge summary.
   */
  it('stamps a stated age with the date it was given', async () => {
    await signInAs('RECEPTIONIST')
    await create({ ...VALID, age_years: 45 })

    const stored = db.rows('patients')[0]
    expect(stored).toMatchObject({ age_years: 45, age_recorded_on: TODAY })
    // Critically, no birth date was invented from it.
    expect(stored.date_of_birth ?? null).toBeNull()
  })

  it.each([
    ['an impossible age', { age_years: 200 }, 'age_years'],
    ['an unknown blood group', { blood_group: 'C+' }, 'blood_group'],
    ['an unknown ID proof', { id_proof_type: 'Library Card' }, 'id_proof_type'],
    ['an unknown relation', { emergency_contact_relation: 'Neighbour' }, 'emergency_contact_relation'],
    ['a malformed email', { email: 'not-an-email' }, 'email'],
    ['a birth date in the future', { date_of_birth: '2099-01-01' }, 'date_of_birth'],
  ])('rejects %s', async (_label, patch, field) => {
    await signInAs('RECEPTIONIST')
    const { status, body } = await create({ ...VALID, ...patch })

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty(field)
  })

  it('opens a billing record for the new patient', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    await create(VALID)

    const patient = db.rows('patients')[0]

    expect(db.rows('patient_billing')[0]).toMatchObject({
      patient_id: patient.id,
      base_charge: 0,
      billing_status: 'pending',
      referral_settled: false,
      created_by: 'u-recep',
    })
    expect(patient.created_by).toBe('u-recep')
  })

  it('still registers the patient when the billing insert fails', async () => {
    await signInAs('RECEPTIONIST')
    db.failNext('patient_billing')

    const { status } = await create(VALID)

    expect(status).toBe(201)
    expect(db.count('patients')).toBe(1)
    expect(db.count('patient_billing')).toBe(0)
  })

  it('returns 500 when the patient insert fails', async () => {
    await signInAs('RECEPTIONIST')
    db.failNext('patients')

    const { status } = await create(VALID)
    expect(status).toBe(500)
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

  it('enforces the same required fields as create', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { status, body } = await replace('p1', { patient_id: '1/25', name: 'Ramesh' })

    expect(status).toBe(400)
    expect(body.fieldErrors).toHaveProperty('gender')
    expect(body.fieldErrors).toHaveProperty('phone')
  })

  it('updates the record and returns it', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aPatient({ id: 'p1', name: 'Old Name', phone: '1111111111' })

    const { status, body } = await replace('p1', {
      ...VALID,
      patient_id: '1/25',
      name: 'New Name',
      phone: '9999999999',
    })

    expect(status).toBe(200)
    expect(body.patient.name).toBe('New Name')
    expect(db.find('patients', r => r.id === 'p1')).toMatchObject({
      name: 'New Name',
      phone: '9999999999',
      updated_by: 'u-recep',
    })
  })

  it('allows a patient to keep its own patient_id', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25' })

    const { status } = await replace('p1', { ...VALID, patient_id: '1/25' })
    expect(status).toBe(200)
  })

  it('blanks every optional field the caller omits', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', phone: '9999999999', address: 'Somewhere', allergies: 'Penicillin' })

    await replace('p1', { ...VALID, patient_id: '1/25', address: '', allergies: '' })

    expect(db.find('patients', r => r.id === 'p1')).toMatchObject({
      address: null,
      allergies: null,
    })
  })

  /**
   * BUGS.md #12. `status: status || 'Active'` meant correcting a discharged
   * patient's phone number quietly re-admitted them.
   */
  it('does not resurrect a discharged patient when status is omitted', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25', status: 'Discharged' })

    await replace('p1', { ...VALID, patient_id: '1/25' })

    expect(db.find('patients', r => r.id === 'p1')!.status).toBe('Discharged')
  })

  it('changes the status when one is actually sent', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25', status: 'Discharged' })

    await replace('p1', { ...VALID, patient_id: '1/25', status: 'Active' })

    expect(db.find('patients', r => r.id === 'p1')!.status).toBe('Active')
  })

  it('rejects a status outside the three', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25' })

    const { status, body } = await replace('p1', { ...VALID, patient_id: '1/25', status: 'Inactive' })

    expect(status).toBe(400)
    expect(body.fieldErrors.status).toBeDefined()
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

  /** A partial update must not be forced to resend the whole record. */
  it('updates one field without demanding the required four', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Ramesh', status: 'Active', phone: '1111111111' })

    const { status } = await patch('p1', { status: 'Discharged' })

    expect(status).toBe(200)
    const stored = db.find('patients', r => r.id === 'p1')!
    expect(stored.status).toBe('Discharged')
    expect(stored.name).toBe('Ramesh')
    expect(stored.phone).toBe('1111111111')
  })

  /** …but still validates whatever it did send. */
  it('validates the fields it was given', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { status, body } = await patch('p1', { gender: 'MALE' })

    expect(status).toBe(400)
    expect(body.fieldErrors.gender).toBeDefined()
  })

  it('ignores anything outside the writable list', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', patient_id: '1/25' })

    await patch('p1', { status: 'Discharged', created_by: 'HACKED', id: 'HACKED' })

    const stored = db.find('patients', r => r.id === 'p1')!
    expect(stored.id).toBe('p1')
    expect(stored.created_by).not.toBe('HACKED')
  })

  it.each([
    ['phone', '9876543210'],
    ['address', 'New Address'],
    ['medical_history', 'Asthma'],
    ['allergies', 'Sulfa'],
    ['current_medications', 'Inhaler'],
    ['emergency_contact_name', 'Kumar'],
    ['emergency_contact_phone', '9998887777'],
    ['blood_group', 'B+'],
    // The old PATCH whitelist stopped at eight fields, so the info tab could fix
    // an address but not a misspelled name.
    ['name', 'Corrected Name'],
  ])('accepts %s', async (field, value) => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { status } = await patch('p1', { [field]: value })

    expect(status).toBe(200)
    expect(db.find('patients', r => r.id === 'p1')![field]).toBe(value)
  })

  it('can clear a field by sending null', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', allergies: 'Penicillin' })

    await patch('p1', { allergies: null })
    expect(db.find('patients', r => r.id === 'p1')!.allergies).toBeNull()
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
   * Deleting a patient takes their billing, charges, consultations, lab orders
   * and discharge summaries with it. Until the case sheet rebuild any
   * authenticated role could do it (BUGS.md #9).
   */
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'refuses %s',
    async (role) => {
      await signInAs(role)
      aPatient({ id: 'p1' })

      const { status } = await call(deletePatient, 'DELETE', '/api/patients/p1', { params: { id: 'p1' } })

      expect(status).toBe(403)
      expect(db.count('patients')).toBe(1)
    },
  )

  /**
   * Still a known defect — the remaining half of BUGS.md #9. Nothing checks for
   * dependent billing, charges or consultations first. In the real database the
   * foreign keys would reject this; the fake has no such constraint, so this
   * documents that the route itself offers no protection.
   */
  it.fails('should refuse to delete a patient that still has billing records', async () => {
    await signInAs('ADMIN')
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
    expect(body.data).toEqual([
      { id: 'p2', patient_id: '1/25', name: 'Amit' },
      { id: 'p1', patient_id: '2/25', name: 'Zara' },
    ])
  })

  /**
   * BUGS.md #13. The filter was `.neq('status', 'discharge')` — a value nothing
   * in the app has ever written — so this picker offered discharged patients.
   */
  it('excludes anyone who is not currently under care', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1', name: 'Active One', status: 'Active' })
    aPatient({ id: 'p2', name: 'Gone', status: 'Discharged' })
    aPatient({ id: 'p3', name: 'Mistake', status: 'Cancelled' })

    const { body } = await call(activePatients, 'GET', '/api/patients/active')

    expect(body.data.map((p: any) => p.id)).toEqual(['p1'])
  })
})
