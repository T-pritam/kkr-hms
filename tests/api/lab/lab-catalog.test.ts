/**
 * /api/lab-tests/* and /api/test-parameters/* — the test catalogue and its parameters.
 */

import { describe, it, expect } from 'vitest'
import { GET as listTests, POST as createTest } from '@/app/api/lab-tests/route'
import { GET as getTest, PUT as updateTest, DELETE as deleteTest } from '@/app/api/lab-tests/[id]/route'
import {
  GET as listParameters,
  POST as createParameter,
} from '@/app/api/lab-tests/[id]/parameters/route'
import { PUT as updateParameter, DELETE as deleteParameter } from '@/app/api/test-parameters/[id]/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aLabTest, aTestParameter, aTestResult } from '../../helpers/seed'

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

describe('lab catalogue — access control', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list()).status).toBe(401)
    expect((await create({ name: 'X', code: 'X', price: 1 })).status).toBe(401)
    expect((await remove('t1')).status).toBe(401)
  })

  /**
   * The lab module has no role checks at all — see BUGS.md #57. Any signed-in user,
   * including a receptionist, can rewrite or delete the price list.
   */
  it.each(['NURSE', 'RECEPTIONIST'] as const)('allows %s to change the catalogue', async (role) => {
    await signInAs(role)
    aLabTest({ id: 't1' })

    expect((await update('t1', { price: 1 })).status).toBe(200)
    expect((await remove('t1')).status).toBe(200)
  })

  it.fails('should restrict catalogue changes by role', async () => {
    await signInAs('RECEPTIONIST')
    aLabTest({ id: 't1' })

    expect((await remove('t1')).status).toBe(403)
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
    expect(body.error).toBe('Name, code, and price are required')
  })

  it('accepts a price of zero', async () => {
    await signInAs('ADMIN')

    expect((await create({ name: 'Free Test', code: 'FREE', price: 0 })).status).toBe(201)
  })

  it('rejects a duplicate code', async () => {
    await signInAs('ADMIN')
    aLabTest({ code: 'CBC' })

    const { status, body } = await create({ name: 'Another', code: 'CBC', price: 100 })
    expect(status).toBe(400)
    expect(body.error).toBe('Test code already exists')
  })

  it('creates an active test', async () => {
    await signInAs('ADMIN')

    const { status } = await create({
      name: 'Complete Blood Count',
      code: 'CBC',
      category: 'Hematology',
      sample_type: 'Blood',
      price: 350,
    })

    expect(status).toBe(201)
    expect(db.rows('lab_tests')[0]).toMatchObject({
      name: 'Complete Blood Count',
      code: 'CBC',
      category: 'Hematology',
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
    expect(db.find('lab_tests', (r) => r.id === 't1')).toMatchObject({ price: 400, name: 'CBC', category: 'Hematology' })
  })

  it('lets a test keep its own code', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', code: 'CBC' })

    expect((await update('t1', { code: 'CBC', price: 400 })).status).toBe(200)
  })

  it('rejects a code already used by another test', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1', code: 'CBC' })
    aLabTest({ id: 't2', code: 'LFT' })

    const { status, body } = await update('t2', { code: 'CBC' })
    expect(status).toBe(400)
    expect(body.error).toBe('Test code already exists')
  })

  it('deletes the test', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    expect((await remove('t1')).status).toBe(200)
    expect(db.count('lab_tests')).toBe(0)
  })

  /**
   * Known defect — see BUGS.md #58. A test is deleted outright with no soft-delete and no
   * dependency check, even when results already reference it. Deactivating it (is_active)
   * is the safe path, but nothing steers the caller there.
   */
  it.fails('should refuse to delete a test that already has results', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })
    aTestResult({ test_id: 't1' })

    const { status } = await remove('t1')

    expect(status).toBeGreaterThanOrEqual(400)
    expect(db.count('lab_tests')).toBe(1)
  })
})

describe('/api/lab-tests/[id]/parameters', () => {
  it('returns 404 when the test does not exist', async () => {
    await signInAs('ADMIN')

    const { status, body } = await parameters('missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Lab test not found')
  })

  it('lists parameters in display order', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })
    aTestParameter({ id: 'p1', test_id: 't1', name: 'WBC', display_order: 2 })
    aTestParameter({ id: 'p2', test_id: 't1', name: 'Haemoglobin', display_order: 1 })

    const { status, body } = await parameters('t1')

    expect(status).toBe(200)
    expect(body.data.map((p: any) => p.id)).toEqual(['p2', 'p1'])
  })

  it('requires a parameter name', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await addParameter('t1', { min_value: 1, max_value: 2 })
    expect(status).toBe(400)
    expect(body.error).toBe('Parameter name is required')
  })

  it('requires a general reference range', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await addParameter('t1', { name: 'Haemoglobin' })
    expect(status).toBe(400)
    expect(body.error).toBe('General reference ranges (min_value, max_value) are required')
  })

  it('requires all four values for a gender-specific range', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status, body } = await addParameter('t1', {
      name: 'Haemoglobin',
      gender_specific: true,
      male_min: 13,
      male_max: 17,
      female_min: 12,
    })

    expect(status).toBe(400)
    expect(body.error).toBe('Gender-specific ranges must include male and female min/max values')
  })

  it('creates a general-range parameter', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status } = await addParameter('t1', {
      name: 'Haemoglobin',
      unit: 'g/dL',
      min_value: 13,
      max_value: 17,
      display_order: 1,
    })

    expect(status).toBe(201)
    expect(db.rows('test_parameters')[0]).toMatchObject({
      test_id: 't1',
      name: 'Haemoglobin',
      unit: 'g/dL',
      min_value: 13,
      max_value: 17,
      is_active: true,
    })
  })

  it('creates a gender-specific parameter', async () => {
    await signInAs('ADMIN')
    aLabTest({ id: 't1' })

    const { status } = await addParameter('t1', {
      name: 'Haemoglobin',
      gender_specific: true,
      male_min: 13,
      male_max: 17,
      female_min: 12,
      female_max: 15,
    })

    expect(status).toBe(201)
    expect(db.rows('test_parameters')[0]).toMatchObject({
      gender_specific: true,
      male_min: 13,
      male_max: 17,
      female_min: 12,
      female_max: 15,
    })
  })

  it('updates a parameter', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1', max_value: 17 })

    const { status } = await editParameter('p1', { max_value: 18 })

    expect(status).toBe(200)
    expect(db.find('test_parameters', (r) => r.id === 'p1')!.max_value).toBe(18)
  })

  it('returns 404 when updating an unknown parameter', async () => {
    await signInAs('ADMIN')

    expect((await editParameter('missing', { max_value: 1 })).status).toBe(404)
  })

  it('deletes a parameter', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1' })

    expect((await removeParameter('p1')).status).toBe(200)
    expect(db.count('test_parameters')).toBe(0)
  })

  /**
   * Known defect — see BUGS.md #59. Update applies none of the reference-range invariants
   * that create enforces, so a parameter can be switched to gender-specific with no
   * gender ranges — after which every result flagged against it falls back to the general
   * range without anyone noticing.
   */
  it.fails('should not allow gender_specific to be set without the gender ranges', async () => {
    await signInAs('ADMIN')
    aTestParameter({ id: 'p1', gender_specific: false, male_min: null, male_max: null })

    const { status } = await editParameter('p1', { gender_specific: true })

    expect(status).toBe(400)
  })
})
