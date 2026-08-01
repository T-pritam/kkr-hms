/**
 * Harness self-checks. If these fail, every other test file is unreliable — so this
 * verifies the fake database, the session helpers and the request plumbing before any
 * route behaviour is asserted.
 */

import { describe, it, expect } from 'vitest'
import { db, createFakeClient } from './helpers/fake-supabase'
import { signInAs, signOut } from './helpers/auth'
import { call, makeRequest } from './helpers/request'
import { cookieJar } from './helpers/cookie-jar'
import { aPatient, aDoctor, aConsultation, aSettlement } from './helpers/seed'
import { POST as loginRoute } from '@/app/api/auth/login/route'

const supabase = () => createFakeClient(db) as any

describe('fake supabase client', () => {
  it('inserts and reads back rows', async () => {
    await supabase().from('doctors').insert({ name: 'Dr. A', specialist: 'ENT' })
    const { data } = await supabase().from('doctors').select('*')
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ name: 'Dr. A', specialist: 'ENT' })
    expect(data[0].id).toEqual(expect.any(String))
  })

  it('returns inserted rows only when .select() is chained', async () => {
    const withoutSelect = await supabase().from('doctors').insert({ name: 'Dr. B' })
    expect(withoutSelect.data).toBeNull()

    const withSelect = await supabase().from('doctors').insert({ name: 'Dr. C' }).select().single()
    expect(withSelect.data).toMatchObject({ name: 'Dr. C' })
  })

  it('yields PGRST116 from .single() when no row matches', async () => {
    const { data, error } = await supabase().from('doctors').select('*').eq('id', 'nope').single()
    expect(data).toBeNull()
    expect(error?.code).toBe('PGRST116')
  })

  it('returns null without an error from .maybeSingle() when no row matches', async () => {
    const { data, error } = await supabase().from('doctors').select('*').eq('id', 'nope').maybeSingle()
    expect(data).toBeNull()
    expect(error).toBeNull()
  })

  it('applies eq, neq, in, is and comparison filters', async () => {
    aDoctor({ id: 'd1', name: 'Alpha', specialist: 'ENT' })
    aDoctor({ id: 'd2', name: 'Beta', specialist: 'Ortho' })
    aSettlement({ id: 's1', doctor_id: 'd1', deleted_at: null, visit_count: 3 })
    aSettlement({ id: 's2', doctor_id: 'd2', deleted_at: '2026-01-01', visit_count: 9 })

    const eq = await supabase().from('doctors').select('*').eq('specialist', 'ENT')
    expect(eq.data.map((r: any) => r.id)).toEqual(['d1'])

    const neq = await supabase().from('doctors').select('*').neq('specialist', 'ENT')
    expect(neq.data.map((r: any) => r.id)).toEqual(['d2'])

    const inList = await supabase().from('doctors').select('*').in('id', ['d1', 'd2'])
    expect(inList.data).toHaveLength(2)

    const notDeleted = await supabase().from('doctor_visit_settlements').select('*').is('deleted_at', null)
    expect(notDeleted.data.map((r: any) => r.id)).toEqual(['s1'])

    const bigVisits = await supabase().from('doctor_visit_settlements').select('*').gt('visit_count', 5)
    expect(bigVisits.data.map((r: any) => r.id)).toEqual(['s2'])
  })

  it('treats .eq(column, null) as matching nothing, like PostgREST', async () => {
    aDoctor({ id: 'd1', email: null })
    const { data } = await supabase().from('doctors').select('*').eq('email', null)
    expect(data).toEqual([])
  })

  it('supports ilike and .or() search expressions', async () => {
    aPatient({ id: 'p1', name: 'Ramesh Kumar', patient_id: '1/25', phone: '9990001111' })
    aPatient({ id: 'p2', name: 'Suresh Rao', patient_id: '2/25', phone: '8880002222' })

    const byName = await supabase().from('patients').select('*').ilike('name', '%ramesh%')
    expect(byName.data.map((r: any) => r.id)).toEqual(['p1'])

    const search = await supabase()
      .from('patients')
      .select('*')
      .or('name.ilike.%rao%,patient_id.ilike.%rao%,phone.ilike.%rao%')
    expect(search.data.map((r: any) => r.id)).toEqual(['p2'])
  })

  it('orders rows with Postgres null placement and paginates with range + exact count', async () => {
    aPatient({ id: 'p1', name: 'B', date_of_join: '2026-01-02' })
    aPatient({ id: 'p2', name: 'A', date_of_join: '2026-01-03' })
    aPatient({ id: 'p3', name: 'C', date_of_join: null })

    const ascending = await supabase().from('patients').select('*').order('date_of_join', { ascending: true })
    expect(ascending.data.map((r: any) => r.id)).toEqual(['p1', 'p2', 'p3']) // null last

    const descending = await supabase().from('patients').select('*').order('date_of_join', { ascending: false })
    expect(descending.data.map((r: any) => r.id)).toEqual(['p3', 'p2', 'p1']) // null first

    const page = await supabase()
      .from('patients')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(0, 1)
    expect(page.data.map((r: any) => r.id)).toEqual(['p2', 'p1'])
    expect(page.count).toBe(3) // counted before the range is applied
  })

  it('updates and deletes only the filtered rows', async () => {
    aDoctor({ id: 'd1', name: 'Alpha' })
    aDoctor({ id: 'd2', name: 'Beta' })

    await supabase().from('doctors').update({ name: 'Updated' }).eq('id', 'd1')
    expect(db.find('doctors', (r) => r.id === 'd1')?.name).toBe('Updated')
    expect(db.find('doctors', (r) => r.id === 'd2')?.name).toBe('Beta')

    await supabase().from('doctors').delete().eq('id', 'd2')
    expect(db.rows('doctors').map((r) => r.id)).toEqual(['d1'])
  })

  it('upserts on the conflict key instead of duplicating', async () => {
    await supabase()
      .from('salary_payments')
      .upsert({ employee_id: 'e1', month_year: '2026-03', final_salary: 100 }, { onConflict: 'employee_id,month_year' })
    await supabase()
      .from('salary_payments')
      .upsert({ employee_id: 'e1', month_year: '2026-03', final_salary: 250 }, { onConflict: 'employee_id,month_year' })

    const rows = db.rows('salary_payments')
    expect(rows).toHaveLength(1)
    expect(rows[0].final_salary).toBe(250)
  })

  it('resolves embedded resources by alias, by !column hint and by registry', async () => {
    const doctor = aDoctor({ id: 'd1', name: 'Dr. Who' })
    const patient = aPatient({ id: 'p1', name: 'Rose' })
    aConsultation({ id: 'c1', patient_id: patient.id, doctor_id: doctor.id, created_by: 'u1' })
    db.seed('users', { id: 'u1', username: 'reception' })

    const { data } = await supabase()
      .from('patient_consultations')
      .select('*, doctor:doctors(id, name), created_by_user:users!created_by(id, username)')
      .eq('id', 'c1')
      .single()

    expect(data.doctor).toEqual({ id: 'd1', name: 'Dr. Who' })
    expect(data.created_by_user).toEqual({ id: 'u1', username: 'reception' })
  })

  it('returns null for an embedded resource whose foreign key is null', async () => {
    aConsultation({ id: 'c1', doctor_id: null })
    const { data } = await supabase()
      .from('patient_consultations')
      .select('*, doctor:doctors(id, name)')
      .eq('id', 'c1')
      .single()
    expect(data.doctor).toBeNull()
  })

  it('leaves doctor_visit_settlements.total_amount alone — nothing computes it', async () => {
    // The live schema has no generated expression and no trigger on this column, so it
    // only ever holds what a route explicitly wrote.
    const { data } = await supabase()
      .from('doctor_visit_settlements')
      .insert({ doctor_id: 'd1', visit_count: 3, amount_per_visit: 250 })
      .select()
      .single()
    expect(data.total_amount).toBeUndefined()

    await supabase().from('doctor_visit_settlements').update({ total_amount: 750 }).eq('id', data.id)
    expect(db.find('doctor_visit_settlements', (r) => r.id === data.id)?.total_amount).toBe(750)
  })

  it('rejects a select naming a column the real table does not have', async () => {
    const { data, error } = await supabase().from('patient_billing').select('base_charge, made_up_column')

    expect(data).toBeNull()
    expect(error).toMatchObject({ code: '42703' })
    expect(error?.message).toContain('made_up_column')
  })

  it('rejects a write naming a column the real table does not have', async () => {
    const { error } = await supabase().from('patients').insert({ name: 'X', not_a_column: 1 })

    expect(error).toMatchObject({ code: 'PGRST204' })
  })

  it('rejects a filter on an unknown column', async () => {
    const { error } = await supabase().from('patients').select('*').eq('nope', 1)

    expect(error).toMatchObject({ code: '42703' })
  })

  it('refuses to seed a fixture with an unknown column', () => {
    expect(() => db.seed('patients', { name: 'X', invented: true })).toThrow(/has no column "invented"/)
  })

  it('surfaces a queued failure once, then recovers', async () => {
    db.failNext('doctors')
    const failed = await supabase().from('doctors').select('*')
    expect(failed.error).toBeTruthy()

    const recovered = await supabase().from('doctors').select('*')
    expect(recovered.error).toBeNull()
  })

  it('isolates stored rows from caller mutation', async () => {
    aDoctor({ id: 'd1', name: 'Alpha' })
    const { data } = await supabase().from('doctors').select('*').eq('id', 'd1').single()
    data.name = 'Mutated'
    expect(db.find('doctors', (r) => r.id === 'd1')?.name).toBe('Alpha')
  })
})

describe('session and request helpers', () => {
  it('attaches the session to both auth paths', async () => {
    const session = await signInAs('ADMIN')
    const request = makeRequest('GET', '/api/anything')

    expect(request.cookies.get('accessToken')?.value).toBe(session.accessToken)
    expect(cookieJar.get('accessToken')?.value).toBe(session.accessToken)
  })

  it('omits cookies when the request is anonymous', async () => {
    await signInAs('ADMIN')
    const request = makeRequest('GET', '/api/anything', { anonymous: true })
    expect(request.cookies.get('accessToken')).toBeUndefined()
  })

  it('clears the session on sign-out', async () => {
    await signInAs('ADMIN')
    signOut()
    expect(makeRequest('GET', '/api/anything').cookies.get('accessToken')).toBeUndefined()
  })

  it('builds query strings', () => {
    const request = makeRequest('GET', '/api/patients', { query: { page: 2, search: 'ram', skip: undefined } })
    expect(request.nextUrl.searchParams.get('page')).toBe('2')
    expect(request.nextUrl.searchParams.get('search')).toBe('ram')
    expect(request.nextUrl.searchParams.has('skip')).toBe(false)
  })
})

describe('end-to-end wiring through a real route handler', () => {
  it('runs the login handler against the fake database and sets cookies', async () => {
    const { hashPassword } = await import('./helpers/auth')
    db.seed('users', {
      id: 'u1',
      email: 'admin@hms.test',
      username: 'admin',
      password_hash: await hashPassword('Secret@123'),
      role: 'ADMIN',
      status: 'ACTIVE',
      needs_password_change: false,
    })

    const { status, body } = await call(loginRoute, 'POST', '/api/auth/login', {
      body: { email: 'admin@hms.test', password: 'Secret@123' },
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, user: { id: 'u1', role: 'ADMIN' } })
    expect(cookieJar.get('accessToken')?.value).toEqual(expect.any(String))
    expect(db.find('users', (r) => r.id === 'u1')?.last_login).toBeTruthy()
  })
})
