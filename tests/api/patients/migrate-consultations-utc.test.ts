/**
 * /api/admin/migrate-consultations-utc — one-off repair for consultation timestamps.
 *
 * Older rows were stored as naive or offset-bearing local strings rather than canonical
 * UTC. The UI parses them and applies a fixed +05:30 offset, so a naive value is read as
 * if it were UTC and renders about 5½ hours out — enough to slide an evening consultation
 * into the next day and to break the "before join date" check. This endpoint rewrites
 * every stored value to its ISO-8601 UTC form.
 */

import { describe, it, expect } from 'vitest'
import {
  GET as migrationStatus,
  POST as runMigration,
} from '@/app/api/admin/migrate-consultations-utc/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aConsultation } from '../../helpers/seed'

const status = () => call(migrationStatus, 'GET', '/api/admin/migrate-consultations-utc')
const migrate = () => call(runMigration, 'POST', '/api/admin/migrate-consultations-utc')

/** A naive local timestamp, the shape the old rows were written in. */
const NAIVE_LOCAL = '2026-03-12 18:30:00'
const OFFSET_BEARING = '2026-03-12T18:30:00+05:30'
const CANONICAL_UTC = '2026-03-12T13:00:00.000Z'

describe('migrate-consultations-utc — access control', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await status()).status).toBe(401)
    expect((await migrate()).status).toBe(401)
  })

  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('rejects %s', async (role) => {
    await signInAs(role, { seedUser: true })

    const check = await status()
    expect(check.status).toBe(403)
    expect(check.body.error).toBe('Only admins can check migration status')

    const run = await migrate()
    expect(run.status).toBe(403)
    expect(run.body.error).toBe('Only admins can run migrations')
  })

  it('reads the role from the database, not from the token', async () => {
    // A token claiming ADMIN for a user row that says otherwise must not pass.
    await signInAs('ADMIN', { userId: 'u1' })
    db.seed('users', { id: 'u1', email: 'x@hms.test', username: 'x', role: 'NURSE', status: 'ACTIVE' })

    expect((await migrate()).status).toBe(403)
  })
})

describe('GET /api/admin/migrate-consultations-utc — status', () => {
  it('reports nothing to do on an empty table', async () => {
    await signInAs('ADMIN', { seedUser: true })

    const { status: code, body } = await status()
    expect(code).toBe(200)
    expect(body).toEqual({ total: 0, utcFormat: 0, needsMigration: 0, migrationNeeded: false })
  })

  it('counts rows already in canonical UTC as clean', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: CANONICAL_UTC })

    const { body } = await status()
    expect(body).toEqual({ total: 1, utcFormat: 1, needsMigration: 0, migrationNeeded: false })
  })

  it('flags naive and offset-bearing rows as needing migration', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: NAIVE_LOCAL })
    aConsultation({ id: 'c2', consultation_date: OFFSET_BEARING })
    aConsultation({ id: 'c3', consultation_date: CANONICAL_UTC })

    const { body } = await status()
    expect(body).toEqual({ total: 3, utcFormat: 1, needsMigration: 2, migrationNeeded: true })
  })

  it('ignores soft-deleted consultations', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: NAIVE_LOCAL, deleted_at: '2026-03-01T00:00:00.000Z' })

    const { body } = await status()
    expect(body.total).toBe(0)
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('ADMIN', { seedUser: true })
    db.failNext('patient_consultations')

    expect((await status()).status).toBe(500)
  })
})

describe('POST /api/admin/migrate-consultations-utc — run', () => {
  it('reports nothing to do on an empty table', async () => {
    await signInAs('ADMIN', { seedUser: true })

    const { status: code, body } = await migrate()
    expect(code).toBe(200)
    expect(body).toEqual({ success: true, message: 'No consultations to migrate', updated: 0 })
  })

  it('rewrites an offset-bearing timestamp to UTC', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: OFFSET_BEARING })

    const { body } = await migrate()

    expect(body).toMatchObject({ success: true, updated: 1, total: 1 })
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.consultation_date).toBe(CANONICAL_UTC)
  })

  it('leaves rows that are already canonical untouched', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: CANONICAL_UTC })

    const { body } = await migrate()

    expect(body).toMatchObject({ updated: 0, total: 1 })
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.consultation_date).toBe(CANONICAL_UTC)
  })

  it('is idempotent — a second run changes nothing', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: OFFSET_BEARING })

    await migrate()
    const second = await migrate()

    expect(second.body.updated).toBe(0)
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.consultation_date).toBe(CANONICAL_UTC)
  })

  it('migrates a mixed table and counts only what it changed', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: OFFSET_BEARING })
    aConsultation({ id: 'c2', consultation_date: CANONICAL_UTC })
    aConsultation({ id: 'c3', consultation_date: '2026-01-05T08:15:00+05:30' })

    const { body } = await migrate()

    expect(body).toMatchObject({ updated: 2, total: 3 })
    expect(body.message).toBe('Migration completed. 2 records updated.')
    expect(db.find('patient_consultations', (r) => r.id === 'c3')!.consultation_date).toBe('2026-01-05T02:45:00.000Z')
  })

  it('skips soft-deleted consultations', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: OFFSET_BEARING, deleted_at: '2026-03-01T00:00:00.000Z' })

    const { body } = await migrate()

    expect(body.updated).toBe(0)
    expect(db.find('patient_consultations', (r) => r.id === 'c1')!.consultation_date).toBe(OFFSET_BEARING)
  })

  it('collects per-row errors instead of aborting the whole run', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: OFFSET_BEARING })
    aConsultation({ id: 'c2', consultation_date: '2026-01-05T08:15:00+05:30' })

    db.failNext('patient_consultations') // the select succeeds…
    const { status: code } = await migrate()
    expect(code).toBe(500) // …unless it is the select that fails

    aConsultation({ id: 'c3', consultation_date: OFFSET_BEARING })
    const { body } = await migrate()
    expect(body.success).toBe(true)
  })

  it('records an error for a row whose date cannot be parsed', async () => {
    await signInAs('ADMIN', { seedUser: true })
    aConsultation({ id: 'c1', consultation_date: 'not-a-date' })

    const { status: code, body } = await migrate()

    expect(code).toBe(200)
    expect(body.updated).toBe(0)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0].id).toBe('c1')
  })
})
