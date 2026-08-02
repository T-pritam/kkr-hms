/**
 * /api/patients/[id]/case-sheets/* — discharge summaries.
 *
 * Covers the things the rewrite exists to guarantee:
 *   - only ADMIN / DOCTOR / NURSE can write one; everyone can read and print it
 *   - a draft saves with almost nothing filled in, but finalising demands the
 *     four required sections
 *   - finalising — and only finalising — discharges the patient
 *   - every create, edit, finalise, reopen and delete leaves an audit row
 *   - attachments accumulate rather than replacing each other
 *
 * Files live in Cloudflare R2. The S3 client and the presigner are stubbed;
 * whether the bytes really land in the bucket is a manual check (TESTING.md).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as listCaseSheets, POST as createCaseSheet } from '@/app/api/patients/[id]/case-sheets/route'
import {
  GET as getCaseSheet,
  PATCH as updateCaseSheet,
  DELETE as deleteCaseSheet,
} from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/route'
import {
  POST as finaliseCaseSheet,
  DELETE as reopenCaseSheet,
} from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/finalise/route'
import { POST as uploadAttachment } from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/attachments/route'
import {
  GET as downloadAttachment,
  DELETE as deleteAttachment,
} from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/attachments/[attachmentId]/route'
import { GET as caseSheetAudit } from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/audit/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import {
  aPatient, aCaseSheet, aCaseSheetDoctor, aCaseSheetAttachment, aBilling,
} from '../../helpers/seed'
import { TODAY } from '../../setup'

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = vi.fn(async () => ({}))
  },
  GetObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
  PutObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async (_client: unknown, command: any, options: any) => {
    const key = command?.input?.Key ?? 'unknown'
    return `https://r2.test/signed/${key}?expires=${options?.expiresIn}`
  }),
}))

// ── Curried callers ──────────────────────────────────────────────────────────
const list = () =>
  call(listCaseSheets, 'GET', '/api/patients/p1/case-sheets', { params: { id: 'p1' } })

const create = (body: Record<string, unknown>) =>
  call(createCaseSheet, 'POST', '/api/patients/p1/case-sheets', { params: { id: 'p1' }, body })

const read = (caseSheetId = 'cs1') =>
  call(getCaseSheet, 'GET', `/api/patients/p1/case-sheets/${caseSheetId}`, {
    params: { id: 'p1', caseSheetId },
  })

const update = (body: Record<string, unknown>, caseSheetId = 'cs1') =>
  call(updateCaseSheet, 'PATCH', `/api/patients/p1/case-sheets/${caseSheetId}`, {
    params: { id: 'p1', caseSheetId }, body,
  })

const finalise = (caseSheetId = 'cs1') =>
  call(finaliseCaseSheet, 'POST', `/api/patients/p1/case-sheets/${caseSheetId}/finalise`, {
    params: { id: 'p1', caseSheetId },
  })

const reopen = (caseSheetId = 'cs1') =>
  call(reopenCaseSheet, 'DELETE', `/api/patients/p1/case-sheets/${caseSheetId}/finalise`, {
    params: { id: 'p1', caseSheetId },
  })

const destroy = (caseSheetId = 'cs1') =>
  call(deleteCaseSheet, 'DELETE', `/api/patients/p1/case-sheets/${caseSheetId}`, {
    params: { id: 'p1', caseSheetId },
  })

const audit = (caseSheetId = 'cs1') =>
  call(caseSheetAudit, 'GET', `/api/patients/p1/case-sheets/${caseSheetId}/audit`, {
    params: { id: 'p1', caseSheetId },
  })

/** A complete draft — everything finalise requires, nothing more. */
function completeDraft(overrides: Record<string, unknown> = {}) {
  const sheet = aCaseSheet({
    id: 'cs1',
    patient_id: 'p1',
    status: 'draft',
    finalised_at: null,
    ...overrides,
  })
  aCaseSheetDoctor({ case_sheet_id: 'cs1', doctor_name: 'Dr. S. Rao' })
  return sheet
}

beforeEach(() => {
  aPatient({ id: 'p1', name: 'Ramesh Kumar' })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('case sheets — access control', () => {
  it.each([
    { name: 'GET  /case-sheets',               run: list },
    { name: 'POST /case-sheets',               run: () => create({}) },
    { name: 'PATCH /case-sheets/[id]',         run: () => update({}) },
    { name: 'POST /case-sheets/[id]/finalise', run: () => finalise() },
    { name: 'DELETE /case-sheets/[id]',        run: () => destroy() },
  ])('$name rejects an anonymous request', async ({ run }) => {
    await signOut()
    const { status } = await run()
    expect(status).toBe(401)
  })

  it.each(['ADMIN', 'DOCTOR', 'NURSE'] as const)('allows %s to create a case sheet', async (role) => {
    await signInAs(role)
    const { status } = await create({ diagnosis: 'Fever' })
    expect(status).toBe(201)
  })

  it.each(['RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'forbids %s from creating a case sheet',
    async (role) => {
      await signInAs(role)
      const { status, body } = await create({ diagnosis: 'Fever' })
      expect(status).toBe(403)
      expect(body.error).toContain(role)
    },
  )

  it.each(['RECEPTIONIST', 'LAB_TECHNICIAN'] as const)(
    'still lets %s read a case sheet — reception hands the document over',
    async (role) => {
      aCaseSheet({ id: 'cs1', patient_id: 'p1' })
      await signInAs(role)
      const { status } = await list()
      expect(status).toBe(200)
    },
  )

  it('only an admin can delete a case sheet', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })

    await signInAs('DOCTOR')
    expect((await destroy()).status).toBe(403)

    await signInAs('ADMIN')
    expect((await destroy()).status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/patients/[id]/case-sheets', () => {
  beforeEach(async () => { await signInAs('DOCTOR', { userId: 'u-doc' }) })

  it('creates a draft, issues a summary number and leaves the patient admitted', async () => {
    const { status, body } = await create({
      discharge_date: TODAY,
      diagnosis: 'Acute gastroenteritis',
    })

    expect(status).toBe(201)
    expect(body.data.status).toBe('draft')
    expect(body.data.summary_no).toMatch(/^DS\/\d{4}\/\d{5}$/)
    expect(body.data.created_by).toBe('u-doc')

    // The old code discharged the patient the moment a case sheet was saved.
    expect(db.find('patients', r => r.id === 'p1')!.status).toBe('Active')
  })

  it('stores consulting doctors and medication', async () => {
    const { body } = await create({
      doctors: [{ doctor_id: null, doctor_name: 'Dr. S. Rao', doctor_specialist: 'Medicine' }],
      medications: [
        { medicine_name: 'Paracetamol', dosage: '500 mg', quantity: '10 tabs', usage: '1-0-1' },
      ],
    })

    expect(db.rows('case_sheet_doctors')).toHaveLength(1)
    expect(db.rows('case_sheet_medications')[0]).toMatchObject({
      case_sheet_id: body.data.id,
      medicine_name: 'Paracetamol',
      usage: '1-0-1',
    })
  })

  it('drops blank medication rows rather than rejecting them', async () => {
    // The editor always leaves one empty row on screen.
    await create({ medications: [{ medicine_name: '   ' }, { medicine_name: 'Pantoprazole' }] })

    expect(db.rows('case_sheet_medications')).toHaveLength(1)
    expect(db.rows('case_sheet_medications')[0].medicine_name).toBe('Pantoprazole')
  })

  it('rejects a discharge date before the admission date', async () => {
    const { status, body } = await create({
      admission_date: '2026-03-15',
      discharge_date: '2026-03-10',
    })

    expect(status).toBe(400)
    expect(body.errors.discharge_date).toMatch(/before the admission date/i)
  })

  it('404s for a patient that does not exist', async () => {
    const { status } = await call(createCaseSheet, 'POST', '/api/patients/nope/case-sheets', {
      params: { id: 'nope' }, body: {},
    })
    expect(status).toBe(404)
  })

  it('records the creation in the audit log', async () => {
    await create({ diagnosis: 'Fever' })

    const entries = db.rows('record_audit_log')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      entity_type: 'case_sheet',
      action: 'created',
      patient_id: 'p1',
      actor_id: 'u-doc',
      actor_role: 'DOCTOR',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/patients/[id]/case-sheets/[caseSheetId]', () => {
  beforeEach(async () => { await signInAs('NURSE', { userId: 'u-nurse' }) })

  it('updates fields and stamps the editor', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', diagnosis: 'Fever' })

    const { status } = await update({ diagnosis: 'Dengue fever' })

    expect(status).toBe(200)
    const row = db.find('patient_case_sheets', r => r.id === 'cs1')!
    expect(row.diagnosis).toBe('Dengue fever')
    expect(row.updated_by).toBe('u-nurse')
  })

  /** The old handler merged with `||`, so a field could never be emptied — BUGS.md #63. */
  it('clears a field that is explicitly blanked', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', advice_notes: 'Old advice' })

    await update({ advice_notes: '' })

    expect(db.find('patient_case_sheets', r => r.id === 'cs1')!.advice_notes).toBeNull()
  })

  it('leaves fields the payload does not mention alone', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', diagnosis: 'Fever', ward: 'ICU' })

    await update({ diagnosis: 'Dengue' })

    expect(db.find('patient_case_sheets', r => r.id === 'cs1')!.ward).toBe('ICU')
  })

  it('replaces the doctor list wholesale', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })
    aCaseSheetDoctor({ case_sheet_id: 'cs1', doctor_name: 'Dr. Old' })

    await update({ doctors: [{ doctor_name: 'Dr. New' }] })

    const doctors = db.rows('case_sheet_doctors')
    expect(doctors).toHaveLength(1)
    expect(doctors[0].doctor_name).toBe('Dr. New')
  })

  it('logs which fields changed, old value and new', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', diagnosis: 'Fever' })

    await update({ diagnosis: 'Dengue fever' })

    const entry = db.rows('record_audit_log').find(r => r.action === 'updated')!
    expect(entry.changes).toMatchObject({
      diagnosis: { from: 'Fever', to: 'Dengue fever' },
    })
    expect(entry.actor_id).toBe('u-nurse')
  })

  it('writes no audit row when nothing actually changed', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', diagnosis: 'Fever' })

    await update({ diagnosis: 'Fever' })

    expect(db.rows('record_audit_log')).toHaveLength(0)
  })

  it('404s for a case sheet belonging to another patient', async () => {
    aPatient({ id: 'p2' })
    aCaseSheet({ id: 'cs1', patient_id: 'p2' })

    const { status } = await update({ diagnosis: 'X' })
    expect(status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('finalise / reopen', () => {
  beforeEach(async () => { await signInAs('DOCTOR', { userId: 'u-doc' }) })

  it('finalises a complete draft and discharges the patient', async () => {
    completeDraft()

    const { status, body } = await finalise()

    expect(status).toBe(200)
    expect(body.data.status).toBe('final')
    expect(body.data.finalised_by).toBe('u-doc')
    expect(db.find('patients', r => r.id === 'p1')!.status).toBe('Discharged')
  })

  it.each([
    ['discharge_date',   { discharge_date: null }],
    ['diagnosis',        { diagnosis: null }],
    ['clinical_summary', { clinical_summary: null }],
  ])('refuses to finalise without %s', async (field, missing) => {
    completeDraft(missing)

    const { status, body } = await finalise()

    expect(status).toBe(400)
    expect(body.errors[field]).toBeTruthy()
    expect(db.find('patient_case_sheets', r => r.id === 'cs1')!.status).toBe('draft')
    expect(db.find('patients', r => r.id === 'p1')!.status).toBe('Active')
  })

  it('refuses to finalise with no consulting doctor', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', status: 'draft', finalised_at: null })

    const { status, body } = await finalise()

    expect(status).toBe(400)
    expect(body.errors.doctors).toMatch(/consulting doctor/i)
  })

  it('refuses to finalise twice', async () => {
    completeDraft()
    await finalise()

    const { status, body } = await finalise()
    expect(status).toBe(400)
    expect(body.error).toMatch(/already finalised/i)
  })

  it('reopens a finalised summary without re-admitting the patient', async () => {
    completeDraft()
    await finalise()

    const { status, body } = await reopen()

    expect(status).toBe(200)
    expect(body.data.status).toBe('draft')
    expect(body.data.finalised_at).toBeNull()
    // Reverting a discharge is a separate, deliberate act.
    expect(db.find('patients', r => r.id === 'p1')!.status).toBe('Discharged')
  })

  it('logs finalise and reopen separately', async () => {
    completeDraft()
    await finalise()
    await reopen()

    const actions = db.rows('record_audit_log').map(r => r.action)
    expect(actions).toContain('finalised')
    expect(actions).toContain('reopened')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/patients/[id]/case-sheets', () => {
  beforeEach(async () => { await signInAs('RECEPTIONIST') })

  it('returns each sheet with its doctors, medication and attachments', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })
    aCaseSheetDoctor({ case_sheet_id: 'cs1', doctor_name: 'Dr. S. Rao' })
    aCaseSheetAttachment({ case_sheet_id: 'cs1', filename: 'scan.pdf' })

    const { status, body } = await list()

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].doctors[0].doctor_name).toBe('Dr. S. Rao')
    expect(body.data[0].attachments[0].filename).toBe('scan.pdf')
  })

  /** A readmission gets its own summary; the old screen could only hold one. */
  it('returns every case sheet a patient has had', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', created_at: '2026-01-10T10:00:00.000Z' })
    aCaseSheet({ id: 'cs2', patient_id: 'p1', created_at: '2026-03-10T10:00:00.000Z' })

    const { body } = await list()

    expect(body.data.map((s: any) => s.id)).toEqual(['cs2', 'cs1'])
  })

  it('names the last person who touched each sheet', async () => {
    db.seed('users', {
      id: 'u-nurse', username: 'anita', email: 'a@hms.test',
      password_hash: 'x', role: 'NURSE', status: 'ACTIVE', needs_password_change: false,
    })
    aCaseSheet({ id: 'cs1', patient_id: 'p1', updated_by: 'u-nurse' })

    const { body } = await list()
    expect(body.data[0].updated_by_name).toBe('anita')
  })

  it('returns an empty list, not an error, for a patient with no case sheet', async () => {
    const { status, body } = await list()
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('attachments', () => {
  const pdf = () =>
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'scan.pdf', {
      type: 'application/pdf',
    })

  const upload = (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return call(uploadAttachment, 'POST', '/api/patients/p1/case-sheets/cs1/attachments', {
      params: { id: 'p1', caseSheetId: 'cs1' }, formData,
    })
  }

  beforeEach(async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })
    await signInAs('NURSE', { userId: 'u-nurse' })
  })

  it('stores the object key alongside the URL', async () => {
    const { status, body } = await upload(pdf())

    expect(status).toBe(201)
    // The old flow stored a filename that was not the key it had written, so
    // the download route had to reverse-engineer it — BUGS.md #62.
    expect(body.data.file_key).toMatch(/^case-sheets\/p1\/\d+_scan\.pdf$/)
    expect(body.data.file_url).toContain(body.data.file_key)
    expect(body.data.uploaded_by).toBe('u-nurse')
  })

  it('keeps earlier scans instead of replacing them', async () => {
    await upload(pdf())
    await upload(pdf())

    expect(db.rows('case_sheet_attachments')).toHaveLength(2)
    expect(db.rows('case_sheet_attachments').map(r => r.display_order)).toEqual([0, 1])
  })

  it('rejects anything that is not a PDF', async () => {
    const { status, body } = await upload(
      new File([new Uint8Array([1, 2, 3])], 'scan.png', { type: 'image/png' }),
    )

    expect(status).toBe(400)
    expect(body.error).toMatch(/PDF/i)
    expect(db.count('case_sheet_attachments')).toBe(0)
  })

  it('hands back a presigned URL for the stored key', async () => {
    aCaseSheetAttachment({ id: 'att1', case_sheet_id: 'cs1', file_key: 'case-sheets/p1/1_scan.pdf' })

    const { status, body } = await call(
      downloadAttachment, 'GET', '/api/patients/p1/case-sheets/cs1/attachments/att1',
      { params: { id: 'p1', caseSheetId: 'cs1', attachmentId: 'att1' } },
    )

    expect(status).toBe(200)
    expect(body.downloadUrl).toContain('case-sheets/p1/1_scan.pdf')
    expect(body.downloadUrl).toContain('expires=3600')
  })

  it('falls back to deriving the key from the URL for pre-migration rows', async () => {
    aCaseSheetAttachment({
      id: 'att1',
      case_sheet_id: 'cs1',
      file_key: null,
      file_url: 'https://pub-test-account.r2.dev/case-sheets/p1/legacy.pdf',
    })

    const { status, body } = await call(
      downloadAttachment, 'GET', '/api/patients/p1/case-sheets/cs1/attachments/att1',
      { params: { id: 'p1', caseSheetId: 'cs1', attachmentId: 'att1' } },
    )

    expect(status).toBe(200)
    expect(body.downloadUrl).toContain('case-sheets/p1/legacy.pdf')
  })

  it('removes the row on delete', async () => {
    aCaseSheetAttachment({ id: 'att1', case_sheet_id: 'cs1' })

    const { status } = await call(
      deleteAttachment, 'DELETE', '/api/patients/p1/case-sheets/cs1/attachments/att1',
      { params: { id: 'p1', caseSheetId: 'cs1', attachmentId: 'att1' } },
    )

    expect(status).toBe(200)
    expect(db.count('case_sheet_attachments')).toBe(0)
  })

  it('404s for an attachment reached through the wrong patient', async () => {
    aPatient({ id: 'p2' })
    aCaseSheet({ id: 'cs2', patient_id: 'p2' })
    aCaseSheetAttachment({ id: 'att2', case_sheet_id: 'cs2' })

    const { status } = await call(
      downloadAttachment, 'GET', '/api/patients/p1/case-sheets/cs1/attachments/att2',
      { params: { id: 'p1', caseSheetId: 'cs1', attachmentId: 'att2' } },
    )

    expect(status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE and the change log', () => {
  it('keeps the audit row after the record is gone', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', summary_no: 'DS/2026/00007' })
    await signInAs('ADMIN', { userId: 'u-admin' })

    const { status } = await destroy()

    expect(status).toBe(200)
    expect(db.count('patient_case_sheets')).toBe(0)

    const entry = db.rows('record_audit_log').find(r => r.action === 'deleted')!
    expect(entry.summary).toContain('DS/2026/00007')
    expect(entry.actor_id).toBe('u-admin')
  })

  it('GET /audit returns one entry per edit, each with its before and after', async () => {
    aCaseSheet({ id: 'cs1', patient_id: 'p1', diagnosis: 'Fever' })
    await signInAs('DOCTOR')
    await update({ diagnosis: 'One' })
    await update({ diagnosis: 'Two' })

    const { status, body } = await audit()

    expect(status).toBe(200)
    expect(body.data).toHaveLength(2)

    // The clock is frozen in tests, so both rows share a created_at and the
    // descending sort cannot separate them. Assert the content instead.
    const changes = body.data.map((e: any) => e.changes.diagnosis)
    expect(changes).toContainEqual({ from: 'Fever', to: 'One' })
    expect(changes).toContainEqual({ from: 'One', to: 'Two' })
  })

  it("GET /audit 404s for another patient's case sheet", async () => {
    aPatient({ id: 'p2' })
    aCaseSheet({ id: 'cs9', patient_id: 'p2' })
    await signInAs('ADMIN')

    const { status } = await audit('cs9')
    expect(status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/patients/[id]/case-sheets/[caseSheetId]', () => {
  it('returns the full record', async () => {
    const billing = aBilling({ id: 'b1', patient_id: 'p1' })
    aCaseSheet({ id: 'cs1', patient_id: 'p1', patient_billing_id: billing.id })
    await signInAs('ADMIN')

    const { status, body } = await read()

    expect(status).toBe(200)
    expect(body.data.id).toBe('cs1')
    expect(body.data.patient_billing_id).toBe('b1')
    expect(body.data.doctors).toEqual([])
  })

  it('404s for an unknown id', async () => {
    await signInAs('ADMIN')
    const { status } = await read('nope')
    expect(status).toBe(404)
  })
})
