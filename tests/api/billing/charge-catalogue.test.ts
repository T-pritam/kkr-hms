/**
 * /api/charge-items — the charge catalogue.
 *
 * This is the price list, so writes are ADMIN only for the same reason
 * /api/lab-tests is. Reads are open: every charge form in the app needs the list.
 *
 * The two behaviours worth pinning down are `billing_mode`, which decides whether
 * a charge asks for one date or a range, and the retire-don't-destroy rule — a
 * catalogue entry with charges pointing at it is history, not config.
 */

import { describe, it, expect } from 'vitest'
import { GET as listItems, POST as createItem } from '@/app/api/charge-items/route'
import { GET as allItems } from '@/app/api/charge-items/all/route'
import {
  GET as readItem,
  PATCH as updateItem,
  DELETE as deleteItem,
} from '@/app/api/charge-items/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aChargeItem, aCharge, aChargeSheetItem } from '../../helpers/seed'

const list = (query = {}) => call(listItems, 'GET', '/api/charge-items', { query })
const create = (body: unknown) => call(createItem, 'POST', '/api/charge-items', { body })
const all = (query = {}) => call(allItems, 'GET', '/api/charge-items/all', { query })
const read = (id: string) =>
  call(readItem, 'GET', `/api/charge-items/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateItem, 'PATCH', `/api/charge-items/${id}`, { body, params: { id } })
const remove = (id: string) =>
  call(deleteItem, 'DELETE', `/api/charge-items/${id}`, { params: { id } })

const VALID = { name: 'ICU Bed', category: 'room', billing_mode: 'per_day', default_price: 5000 }

describe('/api/charge-items — authorisation', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await all()).status).toBe(401)
    expect((await create(VALID)).status).toBe(401)
    expect((await read('c1')).status).toBe(401)
    expect((await update('c1', { name: 'X' })).status).toBe(401)
    expect((await remove('c1')).status).toBe(401)
  })

  it.each(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'lets %s read the catalogue',
    async (role) => {
      await signInAs(role)
      expect((await list()).status).toBe(200)
      expect((await all()).status).toBe(200)
    },
  )

  /** One edit here changes what every future charge costs. */
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'refuses to let %s change the price list',
    async (role) => {
      await signInAs(role)
      const item = aChargeItem()

      expect((await create(VALID)).status).toBe(403)
      expect((await update(item.id, { default_price: 1 })).status).toBe(403)
      expect((await remove(item.id)).status).toBe(403)
    },
  )
})

describe('/api/charge-items — validation', () => {
  it('requires a name, a category and a billing mode', async () => {
    await signInAs('ADMIN')

    const { status, body } = await create({})

    expect(status).toBe(400)
    expect(body.fieldErrors).toMatchObject({
      name: expect.any(String),
      category: expect.any(String),
      billing_mode: expect.any(String),
    })
  })

  it('rejects a category or billing mode outside the vocabulary', async () => {
    await signInAs('ADMIN')

    expect((await create({ ...VALID, category: 'invented' })).status).toBe(400)
    expect((await create({ ...VALID, billing_mode: 'per_fortnight' })).status).toBe(400)
  })

  it('accepts every billing mode in the vocabulary', async () => {
    await signInAs('ADMIN')

    for (const mode of ['one_time', 'per_day', 'per_hour']) {
      const { status } = await create({ ...VALID, name: `Service ${mode}`, billing_mode: mode })
      expect(status).toBe(201)
    }
  })

  it('rejects a negative price', async () => {
    await signInAs('ADMIN')

    const { status, body } = await create({ ...VALID, default_price: -1 })

    expect(status).toBe(400)
    expect(body.fieldErrors.default_price).toEqual(expect.any(String))
  })

  it('accepts a price of zero — "type it in at the desk"', async () => {
    await signInAs('ADMIN')

    const { status } = await create({ ...VALID, default_price: 0 })

    expect(status).toBe(201)
  })

  it('refuses a duplicate name through the unique index rather than a race-prone check', async () => {
    await signInAs('ADMIN')
    aChargeItem({ name: 'ICU Bed' })

    const { status } = await create(VALID)

    expect(status).toBe(409)
  })
})

describe('/api/charge-items — create', () => {
  it('stores the entry and attributes it', async () => {
    const user = await signInAs('ADMIN')

    const { status, body } = await create({
      ...VALID,
      code: 'ICU',
      unit_label: 'per day',
    })

    expect(status).toBe(201)
    expect(db.rows('charge_items')).toHaveLength(1)
    expect(db.rows('charge_items')[0]).toMatchObject({
      name: 'ICU Bed',
      code: 'ICU',
      category: 'room',
      billing_mode: 'per_day',
      default_price: 5000,
      unit_label: 'per day',
      is_active: true,
      created_by: user.userId,
      updated_by: user.userId,
    })
    expect(body.chargeItem.id).toEqual(expect.any(String))
  })

  it('trims a padded name rather than storing the padding', async () => {
    await signInAs('ADMIN')

    await create({ ...VALID, name: '  Oxygen  ' })

    expect(db.rows('charge_items')[0].name).toBe('Oxygen')
  })

  it('reports a database failure as a 500', async () => {
    await signInAs('ADMIN')
    db.failNext('charge_items', { message: 'connection reset' })

    expect((await create(VALID)).status).toBe(500)
  })
})

describe('/api/charge-items — list and filter', () => {
  it('filters by category, billing mode and active state', async () => {
    await signInAs('ADMIN')
    aChargeItem({ name: 'Room', category: 'room', billing_mode: 'per_day' })
    aChargeItem({ name: 'Registration', category: 'registration', billing_mode: 'one_time' })
    aChargeItem({ name: 'Retired', category: 'room', billing_mode: 'per_day', is_active: false })

    expect((await list({ category: 'room' })).body.chargeItems).toHaveLength(2)
    expect((await list({ billing_mode: 'one_time' })).body.chargeItems).toHaveLength(1)
    expect((await list({ active: 'true' })).body.chargeItems).toHaveLength(2)
    expect((await list({ active: 'false' })).body.chargeItems).toHaveLength(1)
  })

  it('ignores a category that is not in the vocabulary rather than returning nothing', async () => {
    await signInAs('ADMIN')
    aChargeItem()

    expect((await list({ category: 'invented' })).body.chargeItems).toHaveLength(1)
  })

  it('offers only active entries to the pickers', async () => {
    await signInAs('RECEPTIONIST')
    aChargeItem({ name: 'Live' })
    const retired = aChargeItem({ name: 'Retired', is_active: false })

    const { body } = await all()

    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Live')

    // ...unless the form is editing a charge that names the retired one.
    expect((await all({ includeId: retired.id })).body).toHaveLength(2)
  })
})

describe('/api/charge-items — update', () => {
  it('404s for an entry that does not exist', async () => {
    await signInAs('ADMIN')

    expect((await update('missing', { default_price: 100 })).status).toBe(404)
    expect((await read('missing')).status).toBe(404)
  })

  it('rejects an empty patch rather than writing an attribution-only row', async () => {
    await signInAs('ADMIN')
    const item = aChargeItem()

    expect((await update(item.id, {})).status).toBe(400)
  })

  it('changes the price without touching the rest', async () => {
    const user = await signInAs('ADMIN')
    const item = aChargeItem({ name: 'ICU Bed', default_price: 5000 })

    const { status } = await update(item.id, { default_price: 6000 })

    expect(status).toBe(200)
    expect(db.find('charge_items', (r) => r.id === item.id)).toMatchObject({
      name: 'ICU Bed',
      default_price: 6000,
      updated_by: user.userId,
    })
  })
})

describe('/api/charge-items — retire, do not destroy', () => {
  it('deletes an entry nothing points at', async () => {
    await signInAs('ADMIN')
    const item = aChargeItem()

    const { status, body } = await remove(item.id)

    expect(status).toBe(200)
    expect(body.deactivated).toBe(false)
    expect(db.rows('charge_items')).toHaveLength(0)
  })

  it('deactivates one that a patient charge names, keeping the bill intelligible', async () => {
    await signInAs('ADMIN')
    const item = aChargeItem()
    aCharge({ charge_item_id: item.id })

    const { status, body } = await remove(item.id)

    expect(status).toBe(200)
    expect(body.deactivated).toBe(true)
    expect(db.find('charge_items', (r) => r.id === item.id)).toMatchObject({ is_active: false })
  })

  it('deactivates one that only a charge sheet names', async () => {
    await signInAs('ADMIN')
    const item = aChargeItem()
    aChargeSheetItem({ charge_item_id: item.id })

    expect((await remove(item.id)).body.deactivated).toBe(true)
    expect(db.rows('charge_items')).toHaveLength(1)
  })

  it('404s for an entry that does not exist', async () => {
    await signInAs('ADMIN')

    expect((await remove('missing')).status).toBe(404)
  })
})
