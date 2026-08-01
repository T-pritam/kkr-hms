/**
 * /api/test-results/* — lab orders, their values, and the abnormal-result flagging.
 */

import { describe, it, expect } from 'vitest'
import { GET as listResults, POST as createResult } from '@/app/api/test-results/route'
import { GET as getResult, PUT as updateResult, DELETE as deleteResult } from '@/app/api/test-results/[id]/route'
import { GET as listValues, POST as saveValues } from '@/app/api/test-results/[id]/values/route'
import {
  PUT as editValue,
  DELETE as removeValue,
} from '@/app/api/test-results/[id]/values/[valueId]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aLabTest, aTestParameter, aTestResult, aTestResultValue, aPatient } from '../../helpers/seed'
import { TODAY } from '../../setup'

const list = (query = {}) => call(listResults, 'GET', '/api/test-results', { query })
const create = (body: unknown) => call(createResult, 'POST', '/api/test-results', { body })
const read = (id: string) => call(getResult, 'GET', `/api/test-results/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateResult, 'PUT', `/api/test-results/${id}`, { body, params: { id } })
const remove = (id: string) => call(deleteResult, 'DELETE', `/api/test-results/${id}`, { params: { id } })

const values = (id: string) =>
  call(listValues, 'GET', `/api/test-results/${id}/values`, { params: { id } })
const setValues = (id: string, body: unknown) =>
  call(saveValues, 'POST', `/api/test-results/${id}/values`, { body, params: { id } })
const patchValue = (id: string, valueId: string, body: unknown) =>
  call(editValue, 'PUT', `/api/test-results/${id}/values/${valueId}`, { body, params: { id, valueId } })
const deleteValue = (id: string, valueId: string) =>
  call(removeValue, 'DELETE', `/api/test-results/${id}/values/${valueId}`, { params: { id, valueId } })

/** Seed a result whose test has one parameter with the given reference range. */
function seedResultWithParameter(overrides: {
  param?: Record<string, unknown>
  result?: Record<string, unknown>
} = {}) {
  aLabTest({ id: 'lt1' })
  aTestParameter({ id: 'p1', test_id: 'lt1', name: 'Haemoglobin', unit: 'g/dL', min_value: 10, max_value: 20, ...overrides.param })
  aTestResult({ id: 'r1', test_id: 'lt1', status: 'pending', patient_gender: 'male', ...overrides.result })
}

const storedValue = () => db.rows('test_result_values')[0]

describe('test results — access control', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({ test_id: 't1', price: 1, patient_name: 'X' })).status).toBe(401)
    expect((await setValues('r1', { values: [] })).status).toBe(401)
  })
})

describe('GET /api/test-results', () => {
  it('returns results with pagination', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1' })
    aTestResult({ id: 'r1', test_id: 'lt1' })
    aTestResult({ id: 'r2', test_id: 'lt1' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.data.data).toHaveLength(2)
    expect(body.data.pagination.total).toBe(2)
  })

  it.each([
    ['status', 'completed'],
    ['test_id', 'lt-special'],
    ['patient_id', 'p-special'],
  ])('filters by %s', async (field, value) => {
    await signInAs('NURSE')
    aTestResult({ id: 'match', [field]: value })
    aTestResult({ id: 'other' })

    expect((await list({ [field]: value })).body.data.data.map((r: any) => r.id)).toEqual(['match'])
  })

  it('filters by date range', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'inside', test_date: '2026-03-10' })
    aTestResult({ id: 'outside', test_date: '2026-04-10' })

    const { body } = await list({ from_date: '2026-03-01', to_date: '2026-03-31' })
    expect(body.data.data.map((r: any) => r.id)).toEqual(['inside'])
  })

  it('caps pageSize at 100', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'r1' })

    expect((await list({ pageSize: 5000 })).body.data.pagination.pageSize).toBe(100)
  })
})

describe('POST /api/test-results', () => {
  it('requires test_id and price', async () => {
    await signInAs('NURSE')

    const { status, body } = await create({ patient_name: 'Ramesh' })
    expect(status).toBe(400)
    expect(body.error).toBe('test_id and price are required')
  })

  it('requires a patient name', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1' })

    const { status, body } = await create({ test_id: 'lt1', price: 350 })
    expect(status).toBe(400)
    expect(body.error).toBe('patient_name is required')
  })

  it('creates a pending order for a walk-in with no patient record', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1' })

    const { status } = await create({
      test_id: 'lt1',
      price: 350,
      patient_name: 'Ramesh',
      patient_phone: '9876543210',
      patient_age: 35,
      patient_gender: 'male',
    })

    expect(status).toBe(201)
    expect(db.rows('patient_test_results')[0]).toMatchObject({
      test_id: 'lt1',
      price: 350,
      final_price: 350,
      status: 'pending',
      patient_name: 'Ramesh',
      test_date: TODAY,
    })
    expect(db.rows('patient_test_results')[0].patient_id).toBeUndefined()
  })

  it('links a registered patient when one is given', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1' })
    aPatient({ id: 'p1' })

    await create({ test_id: 'lt1', price: 350, patient_name: 'Ramesh', patient_id: 'p1' })

    expect(db.rows('patient_test_results')[0].patient_id).toBe('p1')
  })

  it('applies the discount to the final price', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1' })

    await create({ test_id: 'lt1', price: 350, discount: 50, patient_name: 'Ramesh' })

    expect(db.rows('patient_test_results')[0]).toMatchObject({ price: 350, discount: 50, final_price: 300 })
  })
})

describe('/api/test-results/[id]', () => {
  it('returns 404 for an unknown result', async () => {
    await signInAs('NURSE')

    expect((await read('missing')).status).toBe(404)
  })

  it('returns the result with its test and values attached', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1', name: 'CBC', code: 'CBC' })
    aTestParameter({ id: 'p1', test_id: 'lt1', name: 'Haemoglobin' })
    aTestResult({ id: 'r1', test_id: 'lt1' })
    aTestResultValue({ id: 'v1', result_id: 'r1', parameter_id: 'p1', value: 14 })

    const { status, body } = await read('r1')

    expect(status).toBe(200)
    expect(body.data.lab_tests).toMatchObject({ id: 'lt1', name: 'CBC' })
    expect(body.data.values).toHaveLength(1)
    expect(body.data.values[0].test_parameters.name).toBe('Haemoglobin')
  })

  it('moves the order through its workflow statuses', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'r1', status: 'pending' })

    for (const status of ['collected', 'processing', 'completed', 'verified', 'cancelled']) {
      await update('r1', { status })
      expect(db.find('patient_test_results', (r) => r.id === 'r1')!.status).toBe(status)
    }
  })

  it('recomputes the final price when the price changes', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'r1', price: 350, discount: 50, final_price: 300 })

    await update('r1', { price: 500 })

    expect(db.find('patient_test_results', (r) => r.id === 'r1')!.final_price).toBe(450)
  })

  it('recomputes the final price when the discount changes', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'r1', price: 350, discount: 0, final_price: 350 })

    await update('r1', { discount: 100 })

    expect(db.find('patient_test_results', (r) => r.id === 'r1')!.final_price).toBe(250)
  })

  it('deletes the result', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'r1' })

    expect((await remove('r1')).status).toBe(200)
    expect(db.count('patient_test_results')).toBe(0)
  })
})

describe('POST /api/test-results/[id]/values — flagging', () => {
  it('requires a non-empty values array', async () => {
    await signInAs('NURSE')
    aTestResult({ id: 'r1' })

    expect((await setValues('r1', { values: [] })).body.error).toBe('Values array is required')
    expect((await setValues('r1', {})).status).toBe(400)
  })

  it('returns 404 for an unknown result', async () => {
    await signInAs('NURSE')

    expect((await setValues('missing', { values: [{ parameter_id: 'p1', value: 1 }] })).status).toBe(404)
  })

  it.each([
    ['normal', 15, 'normal'],
    ['at the lower bound', 10, 'normal'],
    ['at the upper bound', 20, 'normal'],
    ['below the range', 8, 'low'],
    ['above the range', 25, 'high'],
  ])('flags a value %s as %s', async (_case, value, expected) => {
    await signInAs('NURSE')
    seedResultWithParameter() // range 10–20

    await setValues('r1', { values: [{ parameter_id: 'p1', value }] })

    expect(storedValue().flag).toBe(expected)
  })

  it('flags values far outside the range as critical', async () => {
    await signInAs('NURSE')
    seedResultWithParameter() // range 10–20 → critical below 5 or above 30

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 4 }] })
    expect(storedValue().flag).toBe('critical')

    db.reset()
    await signInAs('NURSE')
    seedResultWithParameter()
    await setValues('r1', { values: [{ parameter_id: 'p1', value: 31 }] })
    expect(storedValue().flag).toBe('critical')
  })

  it('copies the unit and reference range onto the stored value', async () => {
    await signInAs('NURSE')
    seedResultWithParameter()

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 15 }] })

    expect(storedValue()).toMatchObject({ unit: 'g/dL', ref_min: 10, ref_max: 20 })
  })

  it('uses the male range for a male patient', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({
      param: { gender_specific: true, male_min: 13, male_max: 17, female_min: 12, female_max: 15 },
      result: { patient_gender: 'male' },
    })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 16 }] })

    expect(storedValue()).toMatchObject({ ref_min: 13, ref_max: 17, flag: 'normal' })
  })

  it('uses the female range for a female patient', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({
      param: { gender_specific: true, male_min: 13, male_max: 17, female_min: 12, female_max: 15 },
      result: { patient_gender: 'female' },
    })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 16 }] })

    expect(storedValue()).toMatchObject({ ref_min: 12, ref_max: 15, flag: 'high' })
  })

  it('falls back to the general range for an unrecognised gender', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({
      param: { gender_specific: true, male_min: 13, male_max: 17, female_min: 12, female_max: 15 },
      result: { patient_gender: 'other' },
    })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 15 }] })

    expect(storedValue()).toMatchObject({ ref_min: 10, ref_max: 20 })
  })

  it('matches the gender case-insensitively', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({
      param: { gender_specific: true, male_min: 13, male_max: 17, female_min: 12, female_max: 15 },
      result: { patient_gender: 'MALE' },
    })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 16 }] })

    expect(storedValue().ref_min).toBe(13)
  })

  it('lets the technician override the computed flag', async () => {
    await signInAs('NURSE')
    seedResultWithParameter()

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 15, flag: 'critical' }] })

    expect(storedValue().flag).toBe('critical')
  })

  it('stores a free-text result with no flag calculation', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({ param: { min_value: null, max_value: null } })

    await setValues('r1', { values: [{ parameter_id: 'p1', text_value: 'No growth after 48h' }] })

    expect(storedValue()).toMatchObject({ text_value: 'No growth after 48h', flag: 'normal' })
  })

  it('promotes the order to completed once values are entered', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({ result: { status: 'collected' } })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 15 }] })

    expect(db.find('patient_test_results', (r) => r.id === 'r1')!.status).toBe('completed')
  })

  it('does not demote an order that was already verified', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({ result: { status: 'verified' } })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 15 }] })

    expect(db.find('patient_test_results', (r) => r.id === 'r1')!.status).toBe('verified')
  })

  it('is idempotent — resubmitting updates the same row', async () => {
    await signInAs('NURSE')
    seedResultWithParameter()

    await setValues('r1', { values: [{ parameter_id: 'p1', value: 15 }] })
    await setValues('r1', { values: [{ parameter_id: 'p1', value: 25 }] })

    expect(db.count('test_result_values')).toBe(1)
    expect(storedValue()).toMatchObject({ value: 25, flag: 'high' })
  })

  it('returns 500 for an unknown parameter', async () => {
    await signInAs('NURSE')
    seedResultWithParameter()

    expect((await setValues('r1', { values: [{ parameter_id: 'ghost', value: 1 }] })).status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #60. The critical rule multiplies the bounds by 0.5 and
   * 1.5, which is meaningless once a range touches or crosses zero. With a lower bound of
   * -2, anything in [-2, -1) is "critical"; with a lower bound of 0 the low-critical
   * branch can never fire at all.
   */
  it.fails('should not call a value inside the range critical when the range spans zero', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({ param: { min_value: -2, max_value: 2 } })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: -1.5 }] })

    expect(storedValue().flag).toBe('normal')
  })

  /**
   * Known defect — see BUGS.md #60. With a lower bound of zero the critical threshold is
   * also zero, so "below range" and "critically below range" become the same condition and
   * every low result is escalated to critical.
   */
  it.fails('should distinguish low from critical when the lower bound is zero', async () => {
    await signInAs('NURSE')
    seedResultWithParameter({ param: { min_value: 0, max_value: 10 } })

    await setValues('r1', { values: [{ parameter_id: 'p1', value: -0.1 }] })

    expect(storedValue().flag).toBe('low')
  })
})

describe('GET/PUT/DELETE a single value', () => {
  it('lists the values for a result', async () => {
    await signInAs('NURSE')
    aLabTest({ id: 'lt1' })
    aTestParameter({ id: 'p1', test_id: 'lt1' })
    aTestResult({ id: 'r1', test_id: 'lt1' })
    aTestResultValue({ id: 'v1', result_id: 'r1', parameter_id: 'p1' })

    const { status, body } = await values('r1')

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('returns 404 when the value belongs to another result', async () => {
    await signInAs('NURSE')
    aTestResultValue({ id: 'v1', result_id: 'r-other' })

    const { status, body } = await patchValue('r1', 'v1', { value: 1 })
    expect(status).toBe(404)
    expect(body.error).toBe('Test result value not found')
  })

  it('recomputes the flag when the value is corrected', async () => {
    await signInAs('NURSE')
    seedResultWithParameter()
    aTestResultValue({ id: 'v1', result_id: 'r1', parameter_id: 'p1', value: 15, flag: 'normal' })

    await patchValue('r1', 'v1', { value: 25 })

    expect(db.find('test_result_values', (r) => r.id === 'v1')).toMatchObject({ value: 25, flag: 'high' })
  })

  it('deletes a value', async () => {
    await signInAs('NURSE')
    aTestResultValue({ id: 'v1', result_id: 'r1' })

    expect((await deleteValue('r1', 'v1')).status).toBe(200)
    expect(db.count('test_result_values')).toBe(0)
  })

  it('will not delete a value belonging to another result', async () => {
    await signInAs('NURSE')
    aTestResultValue({ id: 'v1', result_id: 'r-other' })

    await deleteValue('r1', 'v1')

    expect(db.count('test_result_values')).toBe(1)
  })

  /**
   * Known defect — see BUGS.md #61. The delete is correctly scoped by result, but it
   * reports success whether or not a row matched, so a caller deleting the wrong id is
   * told it worked.
   */
  it.fails('should report that nothing was deleted', async () => {
    await signInAs('NURSE')
    aTestResultValue({ id: 'v1', result_id: 'r-other' })

    expect((await deleteValue('r1', 'v1')).status).toBe(404)
  })
})
