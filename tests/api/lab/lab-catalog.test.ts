/**
 * /api/lab-tests/* and /api/test-parameters/* — the test catalogue.
 *
 * The catalogue is the price list *and* the clinical configuration: change a
 * reference interval here and every future result is judged against it. It is
 * therefore ADMIN-only, which is what the access-control block below pins.
 */

import { describe, it, expect } from 'vitest'
import { GET as listTests, POST as createTest } from '@/app/api/lab-tests/route'
import { GET as getTest, PUT as updateTest, DELETE as deleteTest } from '@/app/api/lab-tests/[id]/route'
import {
  GET as listParameters,
  POST as createParameter,
} from '@/app/api/lab-tests/[id]/parameters/route'
import { PUT as updateParameter, DELETE as deleteParameter } from '@/app/api/test-parameters/[id]/route'
import { GET as listRanges, POST as addRange } from '@/app/api/lab/parameters/[id]/ranges/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  aLabTest, aTestParameter, aParameterRange, aLabOrderItem, aLabResultValue,
} from '../../helpers/seed'

const list = (query = {}) => call(listTests, 'GET', '/api/lab-tests', { query })
const create = (body: unknown) => call(createTest, 'POST', '/api/lab-tests', { body })
const read = (id: string) => call(getTest, 'GET', `/api/lab-tests/${id}`, { params: { id } })
const update = (id: string, body: unknown) =>
  call(updateTest, 'PUT', `/api/lab-tests/${id}`, { body, params: { id } })
const remove = (id: string) => call(deleteTest, 'DELETE', `/api/lab-tests/${id}`, { params: { id } })

const parameters = (testId: string) =>
  call(listParameters, 'GET', `/api/lab-tests/${testId}/parameters`, { params: { id: testId } })
const addParameter = (testId: string, body: unknown) =>
  call(createParameter, 'POST', `/api/lab-tests/${testId}/parameters`, { body, params: { id: testId } })
const editParameter = (id: string, body: unknown) =>
  call(updateParameter, 'PUT', `/api/test-parameters/${id}`, { body, params: { id } })
const removeParameter = (id: string) =>
  call(deleteParameter, 'DELETE', `/api/test-parameters/${id}`, { params: { id } })

const ranges = (id: string) =>
  call(listRanges, 'GET', `/api/lab/parameters/${id}/ranges`, { params: { id } })
const createRange = (id: string, body: unknown) =>
  call(addRange, 'POST', `/api/lab/parameters/${id}/ranges`, { body, params: { id } })

describe('lab catalogue — access control', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({ name: 'X', code: 'X', price: 1 })).status).toBe(401)
    expect((await remove('t1')).status).toBe(401)
  })

  it.each(['NURSE', 'RECEPTIONIST', 'DOCTOR'] as const)(
    'forbids %s from changing the catalogue',
    async (role) => {
      await signInAs(role)
      aLabTest({ id: 't1' })

      expect((await create({ name: 'X', code: 'XX', price: 1 })).status).toBe(403)
      expect((await update('t1', { price: 1 })).status).toBe(403)
      expect((await remove('t1')).status).toBe(403)
      expect((await addParameter('t1', { name: 'Hb' })).status).toBe(403)
      expect((await createRange('p1', { range_type: 'between', min_value: 1, max_value: 2 })).status).toBe(403)
    },
  )

  it.each(['NURSE', 'RECEPTIONIST', 'DOCTOR', 'LAB_TECHNICIAN'] as const)(
    'still lets %s read the catalogue',
    async (role) => {
      await signInAs(role)
      aLabTest({ id: 't1' })

      expect((await list()).status).toBe(200)
      expect((await read('t1')).status).toBe(200)
      expect((await parameters('t1')).status).toBe(200)
    },
  )

  // Interim policy — see the note on LAB_CAPABILITIES in lib/lab/authz.ts.
  it.each(['ADMIN', 'LAB_TECHNICIAN'] as const)('allows %s to change the catalogue', async (role) => {
    await signInAs(role)
    aLabTest({ id: 't1' })

    expect((await update('t1', { price: 1 })).status).toBe(200)
    expect((await remove('t1')).status).toBe(200)
  })
})

describe('GET /api/lab-tests', () => {
  it('returns tests with pagination, nested under data.data', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', name: 'CBC', category: 'Hematology' })
    aLabTest({ id: 't2', name: 'LFT', category: 'Biochemistry' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.data.data.map((t: any) => t.id).sort()).toEqual(['t1', 't2'])
    expect(body.data.pagination).toMatchObject({ page: 1, pageSize: 50, total: 2, totalPages: 1 })
  })

  it('orders by category then name', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', name: 'Zinc', category: 'Biochemistry' })
    aLabTest({ id: 't2', name: 'Albumin', category: 'Biochemistry' })
    aLabTest({ id: 't3', name: 'CBC', category: 'Hematology' })

    expect((await list()).body.data.data.map((t: any) => t.id)).toEqual(['t2', 't1', 't3'])
  })

  it('filters by category, active flag and name', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', name: 'CBC', category: 'Hematology', is_active: true })
    aLabTest({ id: 't2', name: 'LFT', category: 'Biochemistry', is_active: false })

    expect((await list({ category: 'Hematology' })).body.data.data.map((t: any) => t.id)).toEqual(['t1'])
    expect((await list({ is_active: 'true' })).body.data.data.map((t: any) => t.id)).toEqual(['t1'])
    expect((await list({ name: 'lft' })).body.data.data.map((t: any) => t.id)).toEqual(['t2'])
  })

  it('caps pageSize at 100', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    expect((await list({ pageSize: 5000 })).body.data.pagination.pageSize).toBe(100)
  })
})

describe('POST /api/lab-tests', () => {
  it('requires name, code and price', async () => {
    await signInAs('ADMIN')

    const { status, body } = await create({ name: 'CBC' })
    expect(status).toBe(400)
    expect(body.error).toBe('Name, code and price are required')
  })

  it('accepts a price of zero but rejects a negative one', async () => {
    await signInAs('ADMIN')

    expect((await create({ name: 'Free Test', code: 'FREE', price: 0 })).status).toBe(201)
    expect((await create({ name: 'Odd', code: 'ODD', price: -5 })).status).toBe(400)
  })

  it('rejects a duplicate code, case-insensitively', async () => {
    await signInAs('ADMIN')
    aLabTest({ code: 'CBC' })

    const { status, body } = await create({ name: 'Another', code: 'cbc', price: 100 })
    expect(status).toBe(400)
    expect(body.error).toBe('Test code already exists')
  })

  it('creates an active test with its method and default interpretation', async () => {
    await signInAs('ADMIN')

    const { status } = await create({
      name: 'Complete Blood Count',
      code: 'CBC',
      category: 'Hematology',
      sample_type: 'Whole Blood (EDTA)',
      method: 'Automated Cell Counter',
      interpretation_template: 'Correlate clinically.',
      price: 350,
    })

    expect(status).toBe(201)
    expect(db.rows('lab_tests')[0]).toMatchObject({
      name: 'Complete Blood Count',
      code: 'CBC',
      category: 'Hematology',
      method: 'Automated Cell Counter',
      interpretation_template: 'Correlate clinically.',
      price: 350,
      is_active: true,
    })
  })
})

describe('/api/lab-tests/[id]', () => {
  it('returns 404 for an unknown test', async () => {
    await signInAs('ADMIN')

    expect((await read('missing')).status).toBe(404)
    expect((await update('missing', { price: 1 })).status).toBe(404)
  })

  it('updates only the fields supplied', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', name: 'CBC', price: 350, category: 'Hematology' })

    const { status } = await update('t1', { price: 400 })

    expect(status).toBe(200)
    expect(db.find('lab_tests', (r) => r.id === 't1'))
      .toMatchObject({ price: 400, name: 'CBC', category: 'Hematology' })
  })

  it('rejects a code already used by another test', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', code: 'CBC' })
    aLabTest({ id: 't2', code: 'LFT' })

    const { status, body } = await update('t2', { code: 'CBC' })
    expect(status).toBe(400)
    expect(body.error).toBe('Test code already exists')
  })

  it('deletes a test that has never been ordered', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    expect((await remove('t1')).status).toBe(200)
    expect(db.count('lab_tests')).toBe(0)
  })

  /**
   * Was BUGS.md #58: the old handler hard-deleted and let the database's
   * ON DELETE RESTRICT surface as a raw 500. A test that has been ordered is now
   * retired, so past reports stay reproducible.
   */
  it('retires rather than deletes a test that has been ordered', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', is_active: true })
    aLabOrderItem({ test_id: 't1' })

    const { status, body } = await remove('t1')

    expect(status).toBe(200)
    expect(body.message).toMatch(/retired/i)
    expect(db.count('lab_tests')).toBe(1)
    expect(db.find('lab_tests', (r) => r.id === 't1')!.is_active).toBe(false)
  })
})

describe('/api/lab-tests/[id]/parameters', () => {
  it('returns 404 when the test does not exist', async () => {
    await signInAs('ADMIN')

    const { status, body } = await parameters('missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Lab test not found')
  })

  it('lists parameters in display order, each with its reference intervals', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })
    aTestParameter({ id: 'p1', test_id: 't1', name: 'WBC', display_order: 2 })
    aTestParameter({ id: 'p2', test_id: 't1', name: 'Haemoglobin', display_order: 1 })
    aParameterRange({ id: 'r1', parameter_id: 'p2', min_value: 13, max_value: 17 })

    const { status, body } = await parameters('t1')

    expect(status).toBe(200)
    expect(body.data.map((p: any) => p.id)).toEqual(['p2', 'p1'])
    expect(body.data[0].ranges.map((r: any) => r.id)).toEqual(['r1'])
    expect(body.data[1].ranges).toEqual([])
  })

  it('requires a parameter name', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await addParameter('t1', {})
    expect(status).toBe(400)
    expect(body.error).toBe('Parameter name is required')
  })

  it('creates a numeric parameter without needing an interval up front', async () => {
    // Intervals live on test_parameter_ranges now, added separately.
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status } = await addParameter('t1', {
      name: 'Haemoglobin', code: 'hb', unit: 'g/dL', decimals: 1, display_order: 1,
    })

    expect(status).toBe(201)
    expect(db.rows('test_parameters')[0]).toMatchObject({
      test_id: 't1', name: 'Haemoglobin', code: 'HB', unit: 'g/dL',
      param_type: 'numeric', decimals: 1, is_active: true,
    })
  })

  it('rejects a duplicate code within the same test', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })
    aTestParameter({ id: 'p1', test_id: 't1', code: 'HB' })

    const { status, body } = await addParameter('t1', { name: 'Another', code: 'hb' })
    expect(status).toBe(400)
    expect(body.error).toMatch(/already uses the code HB/)
  })

  it('requires at least two options for a qualitative parameter', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await addParameter('t1', {
      name: 'HIV I & II', param_type: 'qualitative', options: ['Non-Reactive'],
    })
    expect(status).toBe(400)
    expect(body.error).toMatch(/at least two options/)
  })

  it('rejects a calculated parameter whose formula is not arithmetic', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await addParameter('t1', {
      name: 'A/G Ratio', code: 'AG', param_type: 'calculated', formula: 'alert(1)',
    })
    expect(status).toBe(400)
    expect(body.error).toMatch(/formula is not valid/)
  })

  it('accepts a well-formed calculated parameter', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status } = await addParameter('t1', {
      name: 'A/G Ratio', code: 'AG', param_type: 'calculated', formula: '{ALB} / ({TP} - {ALB})',
    })
    expect(status).toBe(201)
  })

  it('updates a parameter', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1', max_value: 17 })

    const { status } = await editParameter('p1', { max_value: 18 })

    expect(status).toBe(200)
    expect(db.find('test_parameters', (r) => r.id === 'p1')!.max_value).toBe(18)
  })

  /**
   * Was BUGS.md #59: create validated the parameter, update did not, so a
   * parameter could be edited into a state that no longer made sense.
   */
  it('applies the same validation on update as on create', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1', param_type: 'numeric', options: null, formula: null, code: null })

    expect((await editParameter('p1', { param_type: 'qualitative' })).status).toBe(400)
    expect((await editParameter('p1', { param_type: 'calculated' })).status).toBe(400)
    expect((await editParameter('p1', { name: '  ' })).status).toBe(400)
  })

  it('returns 404 when updating an unknown parameter', async () => {
    await signInAs('ADMIN')

    expect((await editParameter('missing', { max_value: 1 })).status).toBe(404)
  })

  it('deletes an unused parameter but deactivates one that has been reported', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })
    aTestParameter({ id: 'p2', name: 'Reported' })
    aLabResultValue({ parameter_id: 'p2' })

    expect((await removeParameter('p1')).status).toBe(200)
    expect(db.find('test_parameters', (r) => r.id === 'p1')).toBeUndefined()

    const { status, body } = await removeParameter('p2')
    expect(status).toBe(200)
    expect(body.message).toMatch(/deactivated/i)
    expect(db.find('test_parameters', (r) => r.id === 'p2')!.is_active).toBe(false)
  })
})

describe('/api/lab/parameters/[id]/ranges', () => {
  it('rejects an interval that cannot be rendered', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })

    expect((await createRange('p1', { range_type: 'between', min_value: 13 })).status).toBe(400)
    expect((await createRange('p1', { range_type: 'less_than' })).status).toBe(400)
    expect((await createRange('p1', { range_type: 'text' })).status).toBe(400)
  })

  it('rejects a minimum above the maximum', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })

    const { status, body } = await createRange('p1', { range_type: 'between', min_value: 17, max_value: 13 })
    expect(status).toBe(400)
    expect(body.error).toMatch(/minimum cannot be greater/i)
  })

  it('rejects critical bounds that sit inside the interval', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })

    const { status } = await createRange('p1', {
      range_type: 'between', min_value: 13, max_value: 17, critical_high: 15,
    })
    expect(status).toBe(400)
  })

  it('stores an age- and sex-banded interval', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })

    const { status } = await createRange('p1', {
      range_type: 'between', gender: 'Male', age_min_years: 12, age_max_years: 120,
      min_value: 13, max_value: 17, critical_low: 7, critical_high: 20,
    })

    expect(status).toBe(201)
    expect(db.rows('test_parameter_ranges')[0]).toMatchObject({
      parameter_id: 'p1', gender: 'male', age_min_years: 12, age_max_years: 120,
      min_value: 13, max_value: 17, critical_low: 7, critical_high: 20,
    })
  })

  it('stores a "less than" interval, which the old model could not express', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1', name: 'Total Cholesterol' })

    const { status } = await createRange('p1', { range_type: 'less_than', max_value: 200 })

    expect(status).toBe(201)
    expect(db.rows('test_parameter_ranges')[0]).toMatchObject({ range_type: 'less_than', max_value: 200 })
  })

  it('returns 404 for an unknown parameter', async () => {
    await signInAs('ADMIN')

    expect((await createRange('missing', { range_type: 'between', min_value: 1, max_value: 2 })).status).toBe(404)
  })

  it('lists intervals in display order', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })
    aParameterRange({ id: 'r2', parameter_id: 'p1', display_order: 2 })
    aParameterRange({ id: 'r1', parameter_id: 'p1', display_order: 1 })

    expect((await ranges('p1')).body.data.map((r: any) => r.id)).toEqual(['r1', 'r2'])
  })
})
