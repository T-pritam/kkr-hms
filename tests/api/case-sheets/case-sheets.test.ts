/**
 * /api/patients/[id]/case-sheets/* — discharge summaries and their PDF attachments.
 *
 * Files live in Cloudflare R2. The upload goes through a Supabase edge function that
 * hands back a presigned PUT URL; downloads are presigned GETs. Both the edge function
 * and the S3 client are stubbed here — whether the bytes really land in the bucket is a
 * manual check (see TESTING.md).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as listCaseSheets, POST as createCaseSheet } from '@/app/api/patients/[id]/case-sheets/route'
import { POST as uploadCaseSheet } from '@/app/api/patients/[id]/case-sheets/upload/route'
import {
  PATCH as updateCaseSheet,
  DELETE as deleteCaseSheet,
} from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/route'
import { GET as downloadCaseSheet } from '@/app/api/patients/[id]/case-sheets/[caseSheetId]/download/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aPatient, aCaseSheet, aBilling } from '../../helpers/seed'
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

const list = (patientId: string) =>
  call(listCaseSheets, 'GET', `/api/patients/${patientId}/case-sheets`, { params: { id: patientId } })

const create = (patientId: string, body: unknown) =>
  call(createCaseSheet, 'POST', `/api/patients/${patientId}/case-sheets`, { body, params: { id: patientId } })

const update = (patientId: string, caseSheetId: string, body: unknown) =>
  call(updateCaseSheet, 'PATCH', `/api/patients/${patientId}/case-sheets/${caseSheetId}`, {
    body,
    params: { id: patientId, caseSheetId },
  })

const remove = (patientId: string, caseSheetId: string) =>
  call(deleteCaseSheet, 'DELETE', `/api/patients/${patientId}/case-sheets/${caseSheetId}`, {
    params: { id: patientId, caseSheetId },
  })

const download = (patientId: string, caseSheetId: string) =>
  call(downloadCaseSheet, 'GET', `/api/patients/${patientId}/case-sheets/${caseSheetId}/download`, {
    params: { id: patientId, caseSheetId },
  })

function upload(patientId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return call(uploadCaseSheet, 'POST', `/api/patients/${patientId}/case-sheets/upload`, {
    formData: form,
    params: { id: patientId },
  })
}

const pdf = (name = 'discharge.pdf', sizeBytes = 1024) =>
  new File([new Uint8Array(sizeBytes)], name, { type: 'application/pdf' })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('upload-case-sheet')) {
      return new Response(
        JSON.stringify({
          uploadUrl: 'https://r2.test/presigned-put',
          publicUrl: 'https://pub-test-account.r2.dev/case-sheets/p1/1700000000_discharge.pdf',
        }),
        { status: 200 }
      )
    }
    return new Response(null, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

describe('case sheets — authentication', () => {
  it('rejects unauthenticated access', async () => {
    signOut()

    expect((await list('p1')).status).toBe(401)
    expect((await create('p1', {})).status).toBe(401)
    expect((await upload('p1', pdf())).status).toBe(401)
    expect((await download('p1', 'cs1')).status).toBe(401)
    expect((await remove('p1', 'cs1')).status).toBe(401)
  })
})

describe('GET/POST /api/patients/[id]/case-sheets', () => {
  it('lists the patient’s case sheets newest first', async () => {
    await signInAs('NURSE')
    aCaseSheet({ id: 'cs1', patient_id: 'p1', created_at: '2026-01-01T00:00:00.000Z' })
    aCaseSheet({ id: 'cs2', patient_id: 'p1', created_at: '2026-03-01T00:00:00.000Z' })

    const { status, body } = await list('p1')

    expect(status).toBe(200)
    expect(body.map((c: any) => c.id)).toEqual(['cs2', 'cs1'])
  })

  it('does not leak another patient’s case sheets', async () => {
    await signInAs('NURSE')
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })
    aCaseSheet({ id: 'cs2', patient_id: 'p2' })

    expect((await list('p1')).body.map((c: any) => c.id)).toEqual(['cs1'])
  })

  it('records the discharge details', async () => {
    await signInAs('NURSE', { userId: 'u-nurse' })
    aPatient({ id: 'p1' })
    aBilling({ id: 'b1', patient_id: 'p1' })

    const { status } = await create('p1', {
      patient_billing_id: 'b1',
      discharge_date: TODAY,
      discharge_notes: 'Discharged stable',
      case_sheet_url: 'https://pub-test-account.r2.dev/case-sheets/p1/sheet.pdf',
      case_sheet_filename: 'sheet.pdf',
    })

    expect(status).toBe(200)
    expect(db.rows('patient_case_sheets')[0]).toMatchObject({
      patient_id: 'p1',
      patient_billing_id: 'b1',
      discharge_date: TODAY,
      discharge_notes: 'Discharged stable',
      case_sheet_filename: 'sheet.pdf',
      created_by: 'u-nurse',
    })
  })

  it('stamps uploaded_at only when a file URL is supplied', async () => {
    await signInAs('NURSE')

    await create('p1', { discharge_date: TODAY, discharge_notes: 'No attachment' })
    expect(db.rows('patient_case_sheets')[0].uploaded_at).toBeNull()
  })
})

describe('POST /api/patients/[id]/case-sheets/upload', () => {
  it('requires a file', async () => {
    await signInAs('NURSE')

    const { status, body } = await call(uploadCaseSheet, 'POST', '/api/patients/p1/case-sheets/upload', {
      formData: new FormData(),
      params: { id: 'p1' },
    })

    expect(status).toBe(400)
    expect(body.error).toBe('No file provided')
  })

  it('accepts only PDFs', async () => {
    await signInAs('NURSE')
    const jpeg = new File([new Uint8Array(10)], 'scan.jpg', { type: 'image/jpeg' })

    const { status, body } = await upload('p1', jpeg)
    expect(status).toBe(400)
    expect(body.error).toBe('Only PDF files are allowed')
  })

  it('rejects a file over 10MB', async () => {
    await signInAs('NURSE')
    const tooBig = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.pdf', { type: 'application/pdf' })

    const { status, body } = await upload('p1', tooBig)
    expect(status).toBe(400)
    expect(body.error).toBe('File size must be less than 10MB')
  })

  it('accepts a file at exactly 10MB', async () => {
    await signInAs('NURSE')
    const atLimit = new File([new Uint8Array(10 * 1024 * 1024)], 'limit.pdf', { type: 'application/pdf' })

    expect((await upload('p1', atLimit)).status).toBe(200)
  })

  it('asks the edge function for a presigned URL, then PUTs the bytes to it', async () => {
    await signInAs('NURSE')

    const { status, body } = await upload('p1', pdf('discharge.pdf'))

    expect(status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      url: 'https://pub-test-account.r2.dev/case-sheets/p1/1700000000_discharge.pdf',
    })

    const [presignUrl, presignInit] = fetchMock.mock.calls[0]
    expect(presignUrl).toBe('https://test-project.supabase.co/functions/v1/upload-case-sheet')
    expect(JSON.parse(presignInit.body)).toMatchObject({
      contentType: 'application/pdf',
      patientId: 'p1',
      fileSize: 1024,
    })

    const [putUrl, putInit] = fetchMock.mock.calls[1]
    expect(putUrl).toBe('https://r2.test/presigned-put')
    expect(putInit.method).toBe('PUT')
    expect(putInit.headers['Content-Type']).toBe('application/pdf')
  })

  it('prefixes the stored filename with a timestamp', async () => {
    await signInAs('NURSE')

    const { body } = await upload('p1', pdf('discharge.pdf'))
    expect(body.filename).toMatch(/^\d+_discharge\.pdf$/)
  })

  it('returns 500 when the presign call fails', async () => {
    await signInAs('NURSE')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'R2 unavailable' }), { status: 500 }))

    const { status, body } = await upload('p1', pdf())
    expect(status).toBe(500)
    expect(body.error).toBe('R2 unavailable')
  })

  it('returns 500 when the upload to R2 fails', async () => {
    await signInAs('NURSE')
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ uploadUrl: 'https://r2.test/put', publicUrl: 'https://pub.r2.dev/x.pdf' }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response('access denied', { status: 403 }))

    expect((await upload('p1', pdf())).status).toBe(500)
  })

  /**
   * Known defect — see BUGS.md #62. The route returns its own filename while the edge
   * function prepends a second timestamp and sanitises the name before storing it, so the
   * value handed back never matches the real object key.
   */
  it.fails('should return the filename the object was actually stored under', async () => {
    await signInAs('NURSE')

    const { body } = await upload('p1', pdf('discharge.pdf'))

    expect(body.url).toContain(body.filename)
  })
})

describe('GET .../case-sheets/[caseSheetId]/download', () => {
  it('returns 404 for an unknown case sheet', async () => {
    await signInAs('NURSE')

    const { status, body } = await download('p1', 'missing')
    expect(status).toBe(404)
    expect(body.error).toBe('Case sheet not found')
  })

  it('returns 404 when the sheet belongs to another patient', async () => {
    await signInAs('NURSE')
    aCaseSheet({ id: 'cs1', patient_id: 'p2' })

    expect((await download('p1', 'cs1')).status).toBe(404)
  })

  it('returns 404 when no file is attached', async () => {
    await signInAs('NURSE')
    aCaseSheet({ id: 'cs1', patient_id: 'p1', case_sheet_url: null })

    const { status, body } = await download('p1', 'cs1')
    expect(status).toBe(404)
    expect(body.error).toBe('No file attached to this case sheet')
  })

  it('rejects a stored URL that is not an R2 case-sheet path', async () => {
    await signInAs('NURSE')
    aCaseSheet({ id: 'cs1', patient_id: 'p1', case_sheet_url: 'https://example.com/random.pdf' })

    const { status, body } = await download('p1', 'cs1')
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid file URL')
  })

  it('issues a presigned URL valid for one hour, keyed to the stored object', async () => {
    await signInAs('NURSE')
    aCaseSheet({
      id: 'cs1',
      patient_id: 'p1',
      case_sheet_url: 'https://pub-test-account.r2.dev/case-sheets/p1/1700000000_sheet.pdf',
      case_sheet_filename: 'sheet.pdf',
    })

    const { status, body } = await download('p1', 'cs1')

    expect(status).toBe(200)
    expect(body.filename).toBe('sheet.pdf')
    expect(body.downloadUrl).toContain('case-sheets/p1/1700000000_sheet.pdf')
    expect(body.downloadUrl).toContain('expires=3600')
  })
})

describe('DELETE .../case-sheets/[caseSheetId]', () => {
  it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)('refuses %s', async (role) => {
    await signInAs(role)
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })

    const { status, body } = await remove('p1', 'cs1')

    expect(status).toBe(403)
    expect(body.error).toBe('Only admins can delete case sheets')
    expect(db.count('patient_case_sheets')).toBe(1)
  })

  it('lets an admin delete the sheet', async () => {
    await signInAs('ADMIN')
    aCaseSheet({ id: 'cs1', patient_id: 'p1' })

    const { status } = await remove('p1', 'cs1')

    expect(status).toBe(200)
    expect(db.count('patient_case_sheets')).toBe(0)
  })

  it('returns 404 for an unknown case sheet', async () => {
    await signInAs('ADMIN')

    expect((await remove('p1', 'missing')).status).toBe(404)
  })
})

describe('PATCH .../case-sheets/[caseSheetId]', () => {
  it('returns 404 for an unknown case sheet', async () => {
    await signInAs('ADMIN')

    const { status, body } = await update('p1', 'missing', { discharge_notes: 'x' })
    expect(status).toBe(404)
    expect(body.error).toBe('Case sheet not found')
  })

  it('updates the discharge notes', async () => {
    await signInAs('ADMIN')
    aCaseSheet({ id: 'cs1', patient_id: 'p1', discharge_notes: 'Original' })

    const { status } = await update('p1', 'cs1', { discharge_notes: 'Corrected summary' })

    expect(status).toBe(200)
    expect(db.find('patient_case_sheets', (r) => r.id === 'cs1')!.discharge_notes).toBe('Corrected summary')
  })

  /**
   * Known defect — see BUGS.md #63. Fields are merged with `||`, so an empty string falls
   * back to the existing value and a note can never be cleared once set.
   */
  it.fails('should allow the discharge notes to be cleared', async () => {
    await signInAs('ADMIN')
    aCaseSheet({ id: 'cs1', patient_id: 'p1', discharge_notes: 'Original' })

    await update('p1', 'cs1', { discharge_notes: '' })

    expect(db.find('patient_case_sheets', (r) => r.id === 'cs1')!.discharge_notes).toBe('')
  })
})
