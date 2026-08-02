/**
 * /api/medicines — the medicine master behind the discharge-advice autocomplete.
 *
 * The list starts empty and fills up as staff add names. Its whole purpose is
 * that the same drug stops being spelled three ways, so the interesting cases
 * here are all about matching an existing name rather than creating a duplicate.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as listMedicines, POST as createMedicine } from '@/app/api/medicines/route'
import { PUT as updateMedicine, DELETE as retireMedicine } from '@/app/api/medicines/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aMedicine } from '../../helpers/seed'

const list = (query: Record<string, string> = {}) =>
  call(listMedicines, 'GET', '/api/medicines', { query })

const create = (body: Record<string, unknown>) =>
  call(createMedicine, 'POST', '/api/medicines', { body })

const update = (id: string, body: Record<string, unknown>) =>
  call(updateMedicine, 'PUT', `/api/medicines/${id}`, { params: { id }, body })

const retire = (id: string) =>
  call(retireMedicine, 'DELETE', `/api/medicines/${id}`, { params: { id } })

describe('medicines — access control', () => {
  it('rejects an anonymous request', async () => {
    await signOut()
    expect((await list()).status).toBe(401)
    expect((await create({ name: 'X' })).status).toBe(401)
  })

  it.each(['ADMIN', 'DOCTOR', 'NURSE'] as const)('allows %s to add a medicine', async (role) => {
    await signInAs(role)
    expect((await create({ name: `Drug ${role}` })).status).toBe(201)
  })

  it.each(['RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'forbids %s from adding a medicine',
    async (role) => {
      await signInAs(role)
      expect((await create({ name: 'Paracetamol' })).status).toBe(403)
    },
  )

  it('lets any role read the list — the summary is printed at the desk', async () => {
    await signInAs('RECEPTIONIST')
    expect((await list()).status).toBe(200)
  })
})

describe('GET /api/medicines', () => {
  beforeEach(async () => { await signInAs('DOCTOR') })

  it('returns active medicines ordered by name', async () => {
    aMedicine({ id: 'm1', name: 'Pantoprazole' })
    aMedicine({ id: 'm2', name: 'Amoxicillin' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.data.map((m: any) => m.name)).toEqual(['Amoxicillin', 'Pantoprazole'])
  })

  it('hides retired medicines', async () => {
    aMedicine({ id: 'm1', name: 'Old Drug', is_active: false })

    const { body } = await list()
    expect(body.data).toEqual([])
  })

  it('filters by search term', async () => {
    aMedicine({ id: 'm1', name: 'Pantoprazole' })
    aMedicine({ id: 'm2', name: 'Amoxicillin' })

    const { body } = await list({ search: 'panto' })
    expect(body.data.map((m: any) => m.name)).toEqual(['Pantoprazole'])
  })

  /** A name like "Paracetamol (500)" would otherwise parse as PostgREST filter syntax. */
  it('does not let punctuation in the search break the query', async () => {
    aMedicine({ id: 'm1', name: 'Paracetamol' })

    const { status } = await list({ search: 'Paracetamol (500),x' })
    expect(status).toBe(200)
  })
})

describe('POST /api/medicines', () => {
  beforeEach(async () => { await signInAs('DOCTOR', { userId: 'u-doc' }) })

  it('creates a medicine and records who added it', async () => {
    const { status, body } = await create({ name: 'Pantoprazole', form: 'Tablet', strength: '40 mg' })

    expect(status).toBe(201)
    expect(body.data.name).toBe('Pantoprazole')
    expect(db.rows('medicines')[0].created_by).toBe('u-doc')
  })

  it('rejects a blank name', async () => {
    const { status, body } = await create({ name: '   ' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/medicine name/i)
  })

  /**
   * The user is mid-prescription and just wants something to select; handing
   * back the existing row is more useful than a 409 they have to think about.
   */
  it('returns the existing row instead of duplicating, ignoring case', async () => {
    aMedicine({ id: 'm1', name: 'Pantoprazole' })

    const { status, body } = await create({ name: 'pantoprazole' })

    expect(status).toBe(200)
    expect(body.data.id).toBe('m1')
    expect(db.count('medicines')).toBe(1)
  })
})

describe('PUT / DELETE /api/medicines/[id]', () => {
  beforeEach(async () => { await signInAs('ADMIN', { userId: 'u-admin' }) })

  it('corrects a name', async () => {
    aMedicine({ id: 'm1', name: 'Pantaprazole' })

    const { status, body } = await update('m1', { name: 'Pantoprazole' })

    expect(status).toBe(200)
    expect(body.data.name).toBe('Pantoprazole')
    expect(db.find('medicines', r => r.id === 'm1')!.updated_by).toBe('u-admin')
  })

  it('404s for an unknown medicine', async () => {
    expect((await update('nope', { name: 'X' })).status).toBe(404)
    expect((await retire('nope')).status).toBe(404)
  })

  /**
   * Soft delete: discharge summaries snapshot the name, but medicine_id would
   * go null on a hard delete and the link back to the master would be lost.
   */
  it('retires rather than deletes', async () => {
    aMedicine({ id: 'm1', name: 'Old Drug' })

    const { status } = await retire('m1')

    expect(status).toBe(200)
    expect(db.count('medicines')).toBe(1)
    expect(db.find('medicines', r => r.id === 'm1')!.is_active).toBe(false)
  })
})
