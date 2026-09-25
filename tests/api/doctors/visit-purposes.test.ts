/**
 * /api/visit-purposes — what a visit is for.
 *
 * A visit's purpose is what doctor fees are grouped by: one fee row per doctor,
 * per purpose, per bill. The doctor fee schedule that used to sit beside this —
 * a fixed rate per doctor per purpose — was dropped on 2026-09-25 (Q-97): the
 * same doctor charges differently for a consultation and a surgery, and per
 * procedure within each, so a rate card only suggested wrong numbers.
 */

import { describe, it, expect } from 'vitest'
import { GET as listPurposes, POST as createPurpose } from '@/app/api/visit-purposes/route'
import { PATCH as updatePurpose } from '@/app/api/visit-purposes/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aVisitPurpose } from '../../helpers/seed'

const purposes = (query = {}) => call(listPurposes, 'GET', '/api/visit-purposes', { query })
const addPurpose = (body: unknown) => call(createPurpose, 'POST', '/api/visit-purposes', { body })
const editPurpose = (id: string, body: unknown) =>
  call(updatePurpose, 'PATCH', `/api/visit-purposes/${id}`, { body, params: { id } })

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

  // Reception manages the purposes it prices against (CR-04, Q-19 h).
  it.each(['DOCTOR', 'NURSE', 'LAB_TECHNICIAN'] as const)(
    'refuses to let %s add a purpose',
    async (role) => {
      await signInAs(role)
      expect((await addPurpose({ name: 'Operation' })).status).toBe(403)
    },
  )

  it('lets reception add a purpose', async () => {
    await signInAs('RECEPTIONIST')
    expect((await addPurpose({ name: 'Operation' })).status).toBe(201)
  })

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
