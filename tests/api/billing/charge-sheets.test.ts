/**
 * /api/charge-sheets — temporary charge sheets.
 *
 * The defining property is that a sheet is *not* billing. Creating one must move
 * no total, create no due and write no ledger entry. Forwarding is the single
 * step that turns it into money, and it has to be impossible to do twice.
 */

import { describe, it, expect } from 'vitest'
import { GET as listSheets, POST as createSheet } from '@/app/api/charge-sheets/route'
import {
  GET as readSheet,
  PATCH as updateSheet,
  DELETE as deleteSheet,
} from '@/app/api/charge-sheets/[id]/route'
import { POST as forwardSheet } from '@/app/api/charge-sheets/[id]/forward/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  aBilling,
  aChargeItem,
  aChargeSheet,
  aChargeSheetItem,
  aPatient,
} from '../../helpers/seed'

const list = (query = {}) => call(listSheets, 'GET', '/api/charge-sheets', { query })
const create = (body: unknown) => call(createSheet, 'POST', '/api/charge-sheets', { body })
const read = (id: string) =>
  call(readSheet, 'GET', `/api/charge-sheets/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateSheet, 'PATCH', `/api/charge-sheets/${id}`, { body, params: { id } })
const remove = (id: string) =>
  call(deleteSheet, 'DELETE', `/api/charge-sheets/${id}`, { params: { id } })
const forward = (id: string) =>
  call(forwardSheet, 'POST', `/api/charge-sheets/${id}/forward`, { params: { id } })

const LINE = { description: 'X-Ray', unit_price: 500, qty: 1 }

describe('/api/charge-sheets — authorisation', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({})).status).toBe(401)
    expect((await read('s1')).status).toBe(401)
    expect((await update('s1', {})).status).toBe(401)
    expect((await remove('s1')).status).toBe(401)
    expect((await forward('s1')).status).toBe(401)
  })

  it('lets reception raise a sheet — it is desk work, not money', async () => {
    await signInAs('RECEPTIONIST')
    const patient = aPatient({ id: 'p1' })

    const { status } = await create({
      subject_type: 'patient',
      patient_id: patient.id,
      items: [LINE],
    })

    expect(status).toBe(201)
  })

  /** Forwarding creates a due, so it is the one step reception cannot take. */
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
    'refuses to let %s forward a sheet into billing',
    async (role) => {
      await signInAs(role)
      const sheet = aChargeSheet({ patient_id: 'p1' })

      expect((await forward(sheet.id)).status).toBe(403)
    },
  )

  it('refuses a lab technician entirely', async () => {
    await signInAs('LAB_TECHNICIAN')

    expect((await create({ subject_type: 'opd', opd_name: 'X', items: [LINE] })).status).toBe(403)
  })
})

describe('/api/charge-sheets — validation', () => {
  it('requires a subject and at least one line', async () => {
    await signInAs('RECEPTIONIST')

    expect((await create({})).status).toBe(400)
    expect((await create({ subject_type: 'opd', opd_name: 'Walk-in', items: [] })).status).toBe(400)
  })

  it('requires a patient for a patient sheet and a name for a walk-in', async () => {
    await signInAs('RECEPTIONIST')

    expect(
      (await create({ subject_type: 'patient', items: [LINE] })).body.fieldErrors.patient_id,
    ).toEqual(expect.any(String))

    expect(
      (await create({ subject_type: 'opd', items: [LINE] })).body.fieldErrors.opd_name,
    ).toEqual(expect.any(String))
  })

  it('404s for a patient that does not exist', async () => {
    await signInAs('RECEPTIONIST')

    const { status } = await create({
      subject_type: 'patient',
      patient_id: 'ghost',
      items: [LINE],
    })

    expect(status).toBe(404)
  })

  it('rejects a line with no description, a negative price or a zero quantity', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const bad = (line: any) =>
      create({ subject_type: 'patient', patient_id: 'p1', items: [line] })

    expect((await bad({ ...LINE, description: '' })).status).toBe(400)
    expect((await bad({ ...LINE, unit_price: -1 })).status).toBe(400)
    expect((await bad({ ...LINE, qty: 0 })).status).toBe(400)
  })
})

describe('/api/charge-sheets — create', () => {
  it('numbers the sheet, stores the lines and totals them', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const { status, body } = await create({
      subject_type: 'patient',
      patient_id: 'p1',
      items: [
        { description: 'X-Ray', unit_price: 500, qty: 1 },
        { description: 'Dressing', unit_price: 200, qty: 2 },
      ],
    })

    expect(status).toBe(201)
    expect(body.chargeSheet.sheet_no).toBe('CS-000001')
    expect(Number(body.chargeSheet.total_amount)).toBe(900)
    expect(db.rows('charge_sheet_items')).toHaveLength(2)
  })

  it('issues a fresh number for each sheet', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    const first = await create({ subject_type: 'patient', patient_id: 'p1', items: [LINE] })
    const second = await create({ subject_type: 'patient', patient_id: 'p1', items: [LINE] })

    expect(first.body.chargeSheet.sheet_no).toBe('CS-000001')
    expect(second.body.chargeSheet.sheet_no).toBe('CS-000002')
  })

  it('takes a walk-in with no patient record at all', async () => {
    await signInAs('RECEPTIONIST')

    const { status } = await create({
      subject_type: 'opd',
      opd_name: 'Walk-in Person',
      opd_phone: '9876500000',
      items: [LINE],
    })

    expect(status).toBe(201)
    expect(db.rows('charge_sheets')[0]).toMatchObject({
      subject_type: 'opd',
      opd_name: 'Walk-in Person',
      patient_id: null,
    })
  })

  /** The whole point: a sheet is not a bill. */
  it('creates no billing record, no charge and no ledger entry', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })

    await create({ subject_type: 'patient', patient_id: 'p1', items: [LINE] })

    expect(db.count('patient_billing')).toBe(0)
    expect(db.count('patient_charges')).toBe(0)
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('does not leave a headless sheet behind when the lines fail to save', async () => {
    await signInAs('RECEPTIONIST')
    aPatient({ id: 'p1' })
    db.failNext('charge_sheet_items', { message: 'insert failed' })

    const { status } = await create({ subject_type: 'patient', patient_id: 'p1', items: [LINE] })

    expect(status).toBe(500)
    expect(db.count('charge_sheets')).toBe(0)
  })
})

describe('/api/charge-sheets — list and read', () => {
  it('filters by status and subject', async () => {
    await signInAs('ADMIN')
    aChargeSheet({ status: 'draft' })
    aChargeSheet({ status: 'cancelled' })
    aChargeSheet({ subject_type: 'opd' })

    expect((await list({ status: 'draft' })).body.chargeSheets).toHaveLength(2)
    expect((await list({ status: 'cancelled' })).body.chargeSheets).toHaveLength(1)
    expect((await list({ subject_type: 'opd' })).body.chargeSheets).toHaveLength(1)
  })

  it('embeds the lines on the detail view', async () => {
    await signInAs('ADMIN')
    const sheet = aChargeSheet()
    aChargeSheetItem({ charge_sheet_id: sheet.id, description: 'X-Ray' })

    const { body } = await read(sheet.id)

    expect(body.chargeSheet.items).toHaveLength(1)
    expect(body.chargeSheet.items[0].description).toBe('X-Ray')
  })

  it('404s for a sheet that does not exist', async () => {
    await signInAs('ADMIN')

    expect((await read('missing')).status).toBe(404)
  })
})

describe('/api/charge-sheets — edit and discard', () => {
  it('replaces the lines and re-totals', async () => {
    await signInAs('RECEPTIONIST')
    const sheet = aChargeSheet({ total_amount: 500 })
    aChargeSheetItem({ charge_sheet_id: sheet.id, unit_price: 500, qty: 1 })

    const { status } = await update(sheet.id, {
      items: [{ description: 'Scan', unit_price: 1200, qty: 2 }],
    })

    expect(status).toBe(200)
    expect(db.rows('charge_sheet_items')).toHaveLength(1)
    expect(Number(db.find('charge_sheets', (r) => r.id === sheet.id)!.total_amount)).toBe(2400)
  })

  it('cancels a draft', async () => {
    await signInAs('RECEPTIONIST')
    const sheet = aChargeSheet()

    await update(sheet.id, { status: 'cancelled' })

    expect(db.find('charge_sheets', (r) => r.id === sheet.id)!.status).toBe('cancelled')
  })

  it('deletes a draft outright', async () => {
    await signInAs('RECEPTIONIST')
    const sheet = aChargeSheet()

    expect((await remove(sheet.id)).status).toBe(200)
    expect(db.count('charge_sheets')).toBe(0)
  })

  /** A forwarded sheet is the provenance of charges on a real bill. */
  it('refuses to edit or delete a forwarded sheet', async () => {
    await signInAs('ADMIN')
    const sheet = aChargeSheet({ status: 'forwarded', forwarded_billing_id: 'b1' })

    expect((await update(sheet.id, { notes: 'x' })).status).toBe(409)
    expect((await remove(sheet.id)).status).toBe(409)
    expect(db.count('charge_sheets')).toBe(1)
  })
})

describe('/api/charge-sheets — forwarding into billing', () => {
  const draftFor = (patientId: string) => {
    const sheet = aChargeSheet({ patient_id: patientId, subject_type: 'patient' })
    aChargeSheetItem({ charge_sheet_id: sheet.id, description: 'X-Ray', unit_price: 500, qty: 1 })
    aChargeSheetItem({ charge_sheet_id: sheet.id, description: 'Dressing', unit_price: 200, qty: 2 })
    return sheet
  }

  it('copies every line onto the patient’s bill and moves the total', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1', base_charge: 0 })
    const sheet = draftFor('p1')

    const { status, body } = await forward(sheet.id)

    expect(status).toBe(200)
    expect(body.charges_created).toBe(2)
    expect(db.count('patient_charges')).toBe(2)
    // 500 + (200 x 2)
    expect(Number(db.find('patient_billing', (r) => r.id === 'b1')!.patient_charges_total)).toBe(900)
  })

  it('stamps the sheet with where it went, and marks it forwarded', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    const sheet = draftFor('p1')

    await forward(sheet.id)

    expect(db.find('charge_sheets', (r) => r.id === sheet.id)).toMatchObject({
      status: 'forwarded',
      forwarded_billing_id: 'b1',
      forwarded_by: 'u-admin',
    })
  })

  it('tags the copied charges with the sheet they came from', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    const sheet = draftFor('p1')

    await forward(sheet.id)

    const charges = db.rows('patient_charges')
    expect(charges.every((c) => c.source_sheet_id === sheet.id)).toBe(true)
    // One group, so a sheet forwarded in error can be removed in one action.
    expect(new Set(charges.map((c) => c.charge_group_id)).size).toBe(1)
  })

  it('opens a billing record when the patient has none yet', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1', date_of_join: '2026-03-01' })
    const sheet = draftFor('p1')

    const { status, body } = await forward(sheet.id)

    expect(status).toBe(200)
    expect(db.count('patient_billing')).toBe(1)
    expect(db.rows('patient_billing')[0]).toMatchObject({
      patient_id: 'p1',
      base_charge: 0,
      month_year: '2026-03',
    })
    expect(body.billing_id).toEqual(expect.any(String))
  })

  /** The idempotency guarantee: a double-click must not bill twice. */
  it('refuses a second forward and bills nothing further', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    const sheet = draftFor('p1')

    expect((await forward(sheet.id)).status).toBe(200)

    const second = await forward(sheet.id)

    expect(second.status).toBe(409)
    expect(db.count('patient_charges')).toBe(2)
  })

  it('refuses to forward a walk-in sheet, which has nobody to bill', async () => {
    await signInAs('ADMIN')
    const sheet = aChargeSheet({ subject_type: 'opd' })
    aChargeSheetItem({ charge_sheet_id: sheet.id })

    const { status } = await forward(sheet.id)

    expect(status).toBe(400)
    expect(db.count('patient_billing')).toBe(0)
    expect(db.count('patient_charges')).toBe(0)
  })

  it('refuses a cancelled sheet and an empty one', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })

    const cancelled = aChargeSheet({ patient_id: 'p1', status: 'cancelled' })
    aChargeSheetItem({ charge_sheet_id: cancelled.id })
    expect((await forward(cancelled.id)).status).toBe(409)

    const empty = aChargeSheet({ patient_id: 'p1' })
    expect((await forward(empty.id)).status).toBe(400)
  })

  it('404s for a sheet that does not exist', async () => {
    await signInAs('ADMIN')

    expect((await forward('missing')).status).toBe(404)
  })

  it('leaves the sheet forwardable when writing the charges fails', async () => {
    await signInAs('ADMIN')
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })
    const sheet = draftFor('p1')
    db.failNext('patient_charges', { message: 'insert failed' })

    expect((await forward(sheet.id)).status).toBe(500)

    // Still a draft: locking it here would strand the sheet with nothing billed.
    expect(db.find('charge_sheets', (r) => r.id === sheet.id)!.status).toBe('draft')
  })
})
