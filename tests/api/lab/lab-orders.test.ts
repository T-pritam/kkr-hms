/**
 * /api/lab/orders/* and /api/lab/order-items/* — the order lifecycle.
 *
 * Covers the three things the old flat model could not do: link an order to a
 * registered patient, carry several tests under one accession, and record the
 * sample's timestamps. Plus the clinical derivation on result entry, which must
 * never be taken from the client.
 */

import { describe, it, expect } from 'vitest'
import { GET as listOrders, POST as createOrder } from '@/app/api/lab/orders/route'
import { GET as getOrder, PUT as updateOrder, DELETE as deleteOrder } from '@/app/api/lab/orders/[id]/route'
import { POST as collect } from '@/app/api/lab/orders/[id]/collect/route'
import { POST as receive } from '@/app/api/lab/orders/[id]/receive/route'
import { POST as saveResults } from '@/app/api/lab/order-items/[id]/results/route'
import { PUT as saveInterpretation } from '@/app/api/lab/order-items/[id]/interpretation/route'
import { POST as authorise, DELETE as withdraw } from '@/app/api/lab/order-items/[id]/authorise/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  aPatient, aLabTest, aTestParameter, aParameterRange,
  aLabOrder, aLabOrderItem, aLabResultValue,
} from '../../helpers/seed'

const list = (query = {}) => call(listOrders, 'GET', '/api/lab/orders', { query })
const create = (body: unknown) => call(createOrder, 'POST', '/api/lab/orders', { body })
const read = (id: string) => call(getOrder, 'GET', `/api/lab/orders/${id}`, { params: { id } })
const patch = (id: string, body: unknown) =>
  call(updateOrder, 'PUT', `/api/lab/orders/${id}`, { body, params: { id } })
const cancel = (id: string) => call(deleteOrder, 'DELETE', `/api/lab/orders/${id}`, { params: { id } })
const markCollected = (id: string, body: unknown = {}) =>
  call(collect, 'POST', `/api/lab/orders/${id}/collect`, { body, params: { id } })
const markReceived = (id: string, body: unknown = {}) =>
  call(receive, 'POST', `/api/lab/orders/${id}/receive`, { body, params: { id } })

const enterResults = (id: string, body: unknown) =>
  call(saveResults, 'POST', `/api/lab/order-items/${id}/results`, { body, params: { id } })
const setInterpretation = (id: string, body: unknown) =>
  call(saveInterpretation, 'PUT', `/api/lab/order-items/${id}/interpretation`, { body, params: { id } })
const sign = (id: string) => call(authorise, 'POST', `/api/lab/order-items/${id}/authorise`, { params: { id } })
const unsign = (id: string) => call(withdraw, 'DELETE', `/api/lab/order-items/${id}/authorise`, { params: { id } })

/** A test with one numeric parameter and a 13–17 interval. */
function aHaemoglobinTest(testId = 't1', paramId = 'p1') {
  aLabTest({ id: testId, name: 'Complete Blood Count', code: 'CBC', price: 350 })
  aTestParameter({ id: paramId, test_id: testId, name: 'Haemoglobin', code: 'HB', unit: 'g/dL' })
  aParameterRange({ parameter_id: paramId, range_type: 'between', min_value: 13, max_value: 17 })
}

describe('lab orders — access control', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({})).status).toBe(401)
    expect((await enterResults('i1', { values: [] })).status).toBe(401)
  })

  it('lets the front desk register and progress orders', async () => {
    await signInAs('RECEPTIONIST')
    aLabTest({ id: 't1', price: 350 })

    const { status, body } = await create({ patient_name: 'Walk-in', tests: [{ test_id: 't1' }] })
    expect(status).toBe(201)
    expect((await markCollected(body.data.id)).status).toBe(200)
  })

  it('forbids the front desk from entering results', async () => {
    await signInAs('RECEPTIONIST')
    aLabOrder({ id: 'o1' })
    aLabOrderItem({ id: 'i1', order_id: 'o1' })

    expect((await enterResults('i1', { values: [] })).status).toBe(403)
  })

  // Interim policy — see the note on LAB_CAPABILITIES in lib/lab/authz.ts.
  it.each(['ADMIN', 'LAB_TECHNICIAN', 'NURSE'] as const)(
    'lets %s enter results and write the interpretation',
    async (role) => {
      await signInAs(role)
      aHaemoglobinTest()
      aLabOrder({ id: 'o1', status: 'received' })
      aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

      expect((await enterResults('i1', { values: [{ parameter_id: 'p1', value: 14 }] })).status).toBe(200)
      expect((await setInterpretation('i1', { interpretation: 'Normal study.' })).status).toBe(200)
    },
  )

  it('restricts authorisation to ADMIN and DOCTOR', async () => {
    aLabOrder({ id: 'o1' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', status: 'results_entered' })
    aLabResultValue({ order_item_id: 'i1' })

    await signInAs('LAB_TECHNICIAN')
    expect((await sign('i1')).status).toBe(403)

    await signInAs('NURSE')
    expect((await sign('i1')).status).toBe(403)

    await signInAs('DOCTOR')
    expect((await sign('i1')).status).toBe(200)
  })
})

describe('POST /api/lab/orders', () => {
  it('requires at least one test', async () => {
    await signInAs('ADMIN')

    const { status, body } = await create({ patient_name: 'Walk-in', tests: [] })
    expect(status).toBe(400)
    expect(body.error).toMatch(/at least one test/i)
  })

  it('requires a patient name for a walk-in', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await create({ tests: [{ test_id: 't1' }] })
    expect(status).toBe(400)
    expect(body.error).toMatch(/patient name is required/i)
  })

  it('rejects the same test twice in one order', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await create({
      patient_name: 'Walk-in', tests: [{ test_id: 't1' }, { test_id: 't1' }],
    })
    expect(status).toBe(400)
    expect(body.error).toMatch(/only appear once/i)
  })

  it('refuses a test that is no longer offered', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', name: 'Retired Test', is_active: false })

    const { status, body } = await create({ patient_name: 'Walk-in', tests: [{ test_id: 't1' }] })
    expect(status).toBe(400)
    expect(body.error).toMatch(/no longer offered/i)
  })

  it('carries several tests under one accession number', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', name: 'CBC', code: 'CBC', price: 350 })
    aLabTest({ id: 't2', name: 'LFT', code: 'LFT', price: 600 })

    const { status, body } = await create({
      patient_name: 'Walk-in', tests: [{ test_id: 't1' }, { test_id: 't2' }],
    })

    expect(status).toBe(201)
    expect(body.data.order_no).toMatch(/^LAB\/\d{4}\/\d{5}$/)
    expect(db.count('lab_order_items')).toBe(2)
    expect(db.rows('lab_orders')[0]).toMatchObject({ total_amount: 950, discount: 0, net_amount: 950 })
  })

  it('issues sequential order numbers', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const first = await create({ patient_name: 'A', tests: [{ test_id: 't1' }] })
    const second = await create({ patient_name: 'B', tests: [{ test_id: 't1' }] })

    expect(first.body.data.order_no).not.toBe(second.body.data.order_no)
    expect(first.body.data.order_no.endsWith('00001')).toBe(true)
    expect(second.body.data.order_no.endsWith('00002')).toBe(true)
  })

  /**
   * The whole point of the rebuild: the old modal searched for a patient, used
   * their name to fill three text boxes, then discarded `patient.id`.
   */
  it('links to a registered patient and snapshots their details from the record', async () => {
    await signInAs('ADMIN')
    aPatient({
      id: 'pat1', patient_id: '118/25', name: 'Ramesh Kumar',
      phone: '9876543210', gender: 'Male', date_of_birth: '1984-03-01', status: 'Active',
    })
    aLabTest({ id: 't1', price: 350 })

    const { status } = await create({
      patient_id: 'pat1',
      // Deliberately contradictory: the record must win.
      patient_name: 'Someone Else',
      tests: [{ test_id: 't1' }],
    })

    expect(status).toBe(201)
    expect(db.rows('lab_orders')[0]).toMatchObject({
      patient_id: 'pat1',
      patient_name: 'Ramesh Kumar',
      patient_display_id: '118/25',
      patient_status: 'Active',
      patient_gender: 'Male',
    })
    expect(db.rows('lab_orders')[0].patient_age).toBeGreaterThan(30)
  })

  it('leaves patient_id null for a walk-in', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    await create({ patient_name: 'Walk-in', patient_age: 42, patient_gender: 'male', tests: [{ test_id: 't1' }] })

    expect(db.rows('lab_orders')[0]).toMatchObject({
      patient_id: null, patient_name: 'Walk-in', patient_age: 42,
    })
  })

  it('returns 404 for an unknown patient', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    expect((await create({ patient_id: 'nope', tests: [{ test_id: 't1' }] })).status).toBe(404)
  })

  it('snapshots the catalogue onto each line', async () => {
    await signInAs('ADMIN')
    aLabTest({
      id: 't1', name: 'CBC', code: 'CBC', category: 'Hematology',
      sample_type: 'Whole Blood (EDTA)', method: 'Automated Cell Counter', price: 350,
    })

    await create({ patient_name: 'Walk-in', tests: [{ test_id: 't1' }] })

    expect(db.rows('lab_order_items')[0]).toMatchObject({
      test_name: 'CBC', test_code: 'CBC', category: 'Hematology',
      specimen: 'Whole Blood (EDTA)', method: 'Automated Cell Counter',
      price: 350, status: 'pending',
    })
  })

  it('honours a price override and clamps the discount to the subtotal', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', price: 350 })

    await create({ patient_name: 'Walk-in', discount: 9999, tests: [{ test_id: 't1', price: 300 }] })

    expect(db.rows('lab_orders')[0]).toMatchObject({ total_amount: 300, discount: 300, net_amount: 0 })
  })
})

describe('sample tracking', () => {
  /**
   * The old "Collect Sample" button wrote only `status`, so the report always
   * printed "Collection Date: N/A".
   */
  it('records the collection time and who collected it', async () => {
    const session = await signInAs('LAB_TECHNICIAN')
    aLabOrder({ id: 'o1', status: 'registered' })

    const { status } = await markCollected('o1')

    expect(status).toBe(200)
    const order = db.find('lab_orders', (r) => r.id === 'o1')!
    expect(order.status).toBe('collected')
    expect(order.collected_at).toBeTruthy()
    expect(order.collected_by).toBe(session.userId)
  })

  it('records receipt separately from collection', async () => {
    await signInAs('LAB_TECHNICIAN')
    aLabOrder({ id: 'o1', status: 'collected', collected_at: '2026-08-01T09:40:00.000Z' })

    expect((await markReceived('o1', { received_at: '2026-08-01T10:05:00.000Z' })).status).toBe(200)
    expect(db.find('lab_orders', (r) => r.id === 'o1')).toMatchObject({
      status: 'received', received_at: '2026-08-01T10:05:00.000Z',
    })
  })

  it('refuses a receipt time earlier than collection', async () => {
    await signInAs('LAB_TECHNICIAN')
    aLabOrder({ id: 'o1', status: 'collected', collected_at: '2026-08-01T09:40:00.000Z' })

    const { status, body } = await markReceived('o1', { received_at: '2026-08-01T08:00:00.000Z' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/cannot be received before/i)
  })

  it('refuses to skip collection', async () => {
    await signInAs('LAB_TECHNICIAN')
    aLabOrder({ id: 'o1', status: 'registered' })

    const { status, body } = await markReceived('o1')
    expect(status).toBe(400)
    expect(body.error).toMatch(/Cannot move an order/i)
  })

  it('rejects a status that is not in the vocabulary', async () => {
    await signInAs('ADMIN')
    aLabOrder({ id: 'o1', status: 'registered' })

    // 'verified' was a real status in the old module; it no longer exists.
    expect((await patch('o1', { status: 'verified' })).status).toBe(400)
    expect((await patch('o1', { status: 'banana' })).status).toBe(400)
  })
})

describe('result entry', () => {
  it('derives the interval, the abnormal marker and the unit server-side', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'received', patient_gender: 'male', patient_age: 42 })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    const { status } = await enterResults('i1', { values: [{ parameter_id: 'p1', value: 11 }] })

    expect(status).toBe(200)
    expect(db.rows('lab_result_values')[0]).toMatchObject({
      parameter_id: 'p1', value: 11, abnormal: 'L', is_critical: false,
      unit: 'g/dL', ref_display: '13 - 17', ref_min: 13, ref_max: 17,
    })
  })

  /** The old endpoint accepted `flag: v.flag || computed`, letting the client overrule the lab. */
  it('ignores an abnormal marker supplied by the client', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    await enterResults('i1', {
      values: [{ parameter_id: 'p1', value: 15, abnormal: 'H', is_critical: true }],
    })

    expect(db.rows('lab_result_values')[0]).toMatchObject({ abnormal: null, is_critical: false })
  })

  it('picks the sex-specific interval for the patient on the order', async () => {
    await signInAs('LAB_TECHNICIAN')
    aLabTest({ id: 't1' })
    aTestParameter({ id: 'p1', test_id: 't1', name: 'Haemoglobin' })
    aParameterRange({ parameter_id: 'p1', gender: 'male', min_value: 13, max_value: 17 })
    aParameterRange({ parameter_id: 'p1', gender: 'female', min_value: 12, max_value: 15 })
    aLabOrder({ id: 'o1', status: 'received', patient_gender: 'female', patient_age: 30 })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    await enterResults('i1', { values: [{ parameter_id: 'p1', value: 12.5 }] })

    expect(db.rows('lab_result_values')[0]).toMatchObject({ ref_min: 12, ref_max: 15, abnormal: null })
  })

  it('computes calculated parameters and refuses to guess when an input is blank', async () => {
    await signInAs('LAB_TECHNICIAN')
    aLabTest({ id: 't1' })
    aTestParameter({ id: 'alb', test_id: 't1', name: 'Albumin', code: 'ALB' })
    aTestParameter({ id: 'tp', test_id: 't1', name: 'Total Protein', code: 'TP' })
    aTestParameter({
      id: 'ag', test_id: 't1', name: 'A/G Ratio', code: 'AG',
      param_type: 'calculated', formula: '{ALB} / ({TP} - {ALB})',
    })
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    await enterResults('i1', {
      values: [{ parameter_id: 'alb', value: 4 }, { parameter_id: 'tp', value: 7 }],
    })
    expect(db.find('lab_result_values', (r) => r.parameter_id === 'ag')!.value).toBeCloseTo(1.3333, 3)

    // Clear Total Protein: the derived ratio must go, not linger as a stale figure.
    await enterResults('i1', {
      values: [{ parameter_id: 'alb', value: 4 }, { parameter_id: 'tp', value: null }],
    })
    expect(db.find('lab_result_values', (r) => r.parameter_id === 'ag')).toBeUndefined()
  })

  it('marks a qualitative result outside its normal options', async () => {
    await signInAs('LAB_TECHNICIAN')
    aLabTest({ id: 't1' })
    aTestParameter({
      id: 'p1', test_id: 't1', name: 'HIV I & II',
      param_type: 'qualitative', options: ['Non-Reactive', 'Reactive'],
    })
    aParameterRange({
      parameter_id: 'p1', range_type: 'text', min_value: null, max_value: null,
      normal_options: ['Non-Reactive'],
    })
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    await enterResults('i1', { values: [{ parameter_id: 'p1', text_value: 'Reactive' }] })

    expect(db.rows('lab_result_values')[0]).toMatchObject({ text_value: 'Reactive', abnormal: 'A' })
  })

  it('is an upsert, so re-entering a value corrects it rather than duplicating', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    await enterResults('i1', { values: [{ parameter_id: 'p1', value: 11 }] })
    await enterResults('i1', { values: [{ parameter_id: 'p1', value: 14 }] })

    expect(db.count('lab_result_values')).toBe(1)
    expect(db.rows('lab_result_values')[0]).toMatchObject({ value: 14, abnormal: null })
  })

  it('removes a value that is submitted blank', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    await enterResults('i1', { values: [{ parameter_id: 'p1', value: 14 }] })
    await enterResults('i1', { values: [{ parameter_id: 'p1', value: null, text_value: '' }] })

    expect(db.count('lab_result_values')).toBe(0)
    expect(db.find('lab_order_items', (r) => r.id === 'i1')!.status).toBe('pending')
  })

  it('rejects a parameter that belongs to another test', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest()
    aTestParameter({ id: 'other', test_id: 't2', name: 'Bilirubin' })
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    const { status, body } = await enterResults('i1', { values: [{ parameter_id: 'other', value: 1 }] })
    expect(status).toBe(400)
    expect(body.error).toMatch(/do not belong to this test/i)
  })

  it('refuses results on a cancelled order', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'cancelled' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })

    expect((await enterResults('i1', { values: [{ parameter_id: 'p1', value: 14 }] })).status).toBe(400)
  })

  it('moves the order to reported once every test has results', async () => {
    await signInAs('LAB_TECHNICIAN')
    aHaemoglobinTest('t1', 'p1')
    aLabTest({ id: 't2', name: 'LFT', code: 'LFT' })
    aTestParameter({ id: 'p2', test_id: 't2', name: 'Bilirubin' })
    aLabOrder({ id: 'o1', status: 'received' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })
    aLabOrderItem({ id: 'i2', order_id: 'o1', test_id: 't2' })

    await enterResults('i1', { values: [{ parameter_id: 'p1', value: 14 }] })
    expect(db.find('lab_orders', (r) => r.id === 'o1')!.status).toBe('in_progress')

    await enterResults('i2', { values: [{ parameter_id: 'p2', value: 1 }] })
    const order = db.find('lab_orders', (r) => r.id === 'o1')!
    expect(order.status).toBe('reported')
    expect(order.reported_at).toBeTruthy()
  })
})

describe('interpretation and authorisation', () => {
  it('stamps the author and time, and clears both when the text is removed', async () => {
    const session = await signInAs('DOCTOR')
    aLabOrderItem({ id: 'i1' })

    await setInterpretation('i1', { interpretation: '  Mild leucocytosis.  ' })
    expect(db.find('lab_order_items', (r) => r.id === 'i1')).toMatchObject({
      interpretation: 'Mild leucocytosis.',
      interpretation_by: session.userId,
    })

    await setInterpretation('i1', { interpretation: '' })
    expect(db.find('lab_order_items', (r) => r.id === 'i1')).toMatchObject({
      interpretation: null, interpretation_by: null, interpretation_at: null,
    })
  })

  it('refuses to authorise a test with no results', async () => {
    await signInAs('DOCTOR')
    aLabOrderItem({ id: 'i1', status: 'pending' })

    const { status, body } = await sign('i1')
    expect(status).toBe(400)
    expect(body.error).toMatch(/Enter results before authorising/i)
  })

  it('stamps the authoriser, and can withdraw it again', async () => {
    const session = await signInAs('DOCTOR')
    aLabOrderItem({ id: 'i1', status: 'results_entered' })
    aLabResultValue({ order_item_id: 'i1' })

    expect((await sign('i1')).status).toBe(200)
    expect(db.find('lab_order_items', (r) => r.id === 'i1')).toMatchObject({
      status: 'authorised', authorised_by: session.userId,
    })

    expect((await unsign('i1')).status).toBe(200)
    expect(db.find('lab_order_items', (r) => r.id === 'i1')).toMatchObject({
      status: 'results_entered', authorised_by: null, authorised_at: null,
    })
  })

  /** A sign-off must never outlive the numbers it was given for. */
  it('drops the authorisation when results are edited afterwards', async () => {
    await signInAs('DOCTOR')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'reported' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1', status: 'results_entered' })
    aLabResultValue({ order_item_id: 'i1', parameter_id: 'p1' })
    await sign('i1')

    await signInAs('LAB_TECHNICIAN')
    await enterResults('i1', { values: [{ parameter_id: 'p1', value: 9 }] })

    expect(db.find('lab_order_items', (r) => r.id === 'i1')).toMatchObject({
      status: 'results_entered', authorised_by: null, authorised_at: null,
    })
  })
})

describe('GET /api/lab/orders', () => {
  it('filters by status and searches across order number, name and phone', async () => {
    await signInAs('ADMIN')
    aLabOrder({ id: 'o1', order_no: 'LAB/2026/00001', patient_name: 'Ramesh Kumar', status: 'registered' })
    aLabOrder({ id: 'o2', order_no: 'LAB/2026/00002', patient_name: 'Sita Devi', status: 'reported', patient_phone: '9998887777' })

    expect((await list({ status: 'reported' })).body.data.data.map((o: any) => o.id)).toEqual(['o2'])
    expect((await list({ search: 'Ramesh' })).body.data.data.map((o: any) => o.id)).toEqual(['o1'])
    expect((await list({ search: '9998887777' })).body.data.data.map((o: any) => o.id)).toEqual(['o2'])
    expect((await list({ search: '00002' })).body.data.data.map((o: any) => o.id)).toEqual(['o2'])
  })

  it('ignores a status that is not in the vocabulary rather than returning nothing', async () => {
    await signInAs('ADMIN')
    aLabOrder({ id: 'o1' })

    expect((await list({ status: 'verified' })).body.data.data).toHaveLength(1)
  })
})

describe('GET /api/lab/orders/[id]', () => {
  it('returns 404 for an unknown order', async () => {
    await signInAs('ADMIN')

    expect((await read('missing')).status).toBe(404)
  })

  it('assembles tests, parameters, values and the interval that applied to this patient', async () => {
    await signInAs('ADMIN')
    aHaemoglobinTest()
    aLabOrder({ id: 'o1', status: 'reported', patient_gender: 'male', patient_age: 42 })
    aLabOrderItem({ id: 'i1', order_id: 'o1', test_id: 't1' })
    aLabResultValue({ order_item_id: 'i1', parameter_id: 'p1', value: 14 })

    const { status, body } = await read('o1')

    expect(status).toBe(200)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].parameters[0]).toMatchObject({ id: 'p1', name: 'Haemoglobin' })
    expect(body.data.items[0].parameters[0].resolved).toMatchObject({ refMin: 13, refMax: 17, display: '13 - 17' })
    expect(body.data.items[0].values[0]).toMatchObject({ value: 14 })
  })

  it('resolves the names behind entered_by and authorised_by', async () => {
    const session = await signInAs('ADMIN', { seedUser: true, username: 'dr.rao' })
    aLabOrder({ id: 'o1' })
    aLabOrderItem({ id: 'i1', order_id: 'o1', entered_by: session.userId, authorised_by: session.userId })

    const { body } = await read('o1')

    expect(body.data.items[0]).toMatchObject({ entered_by_name: 'dr.rao', authorised_by_name: 'dr.rao' })
  })
})

describe('DELETE /api/lab/orders/[id]', () => {
  it('deletes an order that has no results', async () => {
    await signInAs('ADMIN')
    aLabOrder({ id: 'o1' })
    aLabOrderItem({ id: 'i1', order_id: 'o1' })

    expect((await cancel('o1')).status).toBe(200)
    expect(db.count('lab_orders')).toBe(0)
  })

  it('cancels rather than destroys an order that already has results', async () => {
    await signInAs('ADMIN')
    aLabOrder({ id: 'o1', status: 'reported' })
    aLabOrderItem({ id: 'i1', order_id: 'o1' })
    aLabResultValue({ order_item_id: 'i1' })

    const { status, body } = await cancel('o1')

    expect(status).toBe(200)
    expect(body.message).toMatch(/cancelled/i)
    expect(db.find('lab_orders', (r) => r.id === 'o1')!.status).toBe('cancelled')
    expect(db.count('lab_result_values')).toBe(1)
  })
})
