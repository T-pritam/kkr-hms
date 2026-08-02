/**
 * One case sheet.
 *
 *   GET    — the full record
 *   PATCH  — edit; diffs before/after and writes a change-log row
 *   DELETE — admin only, cascades to doctors / medication / attachments
 *
 * Two behaviours from the old handler are deliberately gone:
 *
 *   - It merged with `||`, so a field could never be cleared once written
 *     (BUGS.md #63). Sending an empty string now really does empty the field.
 *   - It handled multipart uploads inline, replacing the single attachment and
 *     destroying the previous object. Attachments now have their own routes and
 *     several files are kept.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'
import { loadCaseSheet } from '@/lib/case-sheet/detail'
import {
  TRACKED_FIELDS,
  normaliseCaseSheetBody,
  normaliseDoctors,
  normaliseMedications,
  validateCaseSheet,
} from '@/lib/case-sheet/validate'
import { deleteObject, keyFromUrl } from '@/lib/storage/r2'
import { diffFields, diffList, recordAudit, summariseList } from '@/lib/audit/log'
import type { CaseSheetDoctor, CaseSheetMedication } from '@/lib/case-sheet/types'

const describeDoctor = (d: { doctor_name?: string | null }) => d.doctor_name || ''
const describeMedication = (m: {
  medicine_name?: string | null
  dosage?: string | null
  quantity?: string | null
  usage?: string | null
}) => [m.medicine_name, m.dosage, m.quantity, m.usage].filter(Boolean).join(' · ')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:read')
  if (auth.response) return auth.response

  try {
    const { id: patientId, caseSheetId } = await params
    const supabase = await createClient()

    const sheet = await loadCaseSheet(supabase, patientId, caseSheetId)
    if (!sheet) {
      return NextResponse.json({ success: false, error: 'Case sheet not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: sheet })
  } catch (error: any) {
    console.error('Error loading case sheet:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load case sheet' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:write')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id: patientId, caseSheetId } = await params
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))

    const before = await loadCaseSheet(supabase, patientId, caseSheetId)
    if (!before) {
      return NextResponse.json({ success: false, error: 'Case sheet not found' }, { status: 404 })
    }

    const values = normaliseCaseSheetBody(body)

    // Validate against the merged record: a payload that only changes the
    // discharge date must still be checked against the stored admission date.
    const check = validateCaseSheet({ ...before, ...values })
    if (!check.ok) {
      return NextResponse.json(
        { success: false, error: Object.values(check.errors)[0], errors: check.errors },
        { status: 400 },
      )
    }

    const doctors = normaliseDoctors(body.doctors)
    if (doctors.error) {
      return NextResponse.json({ success: false, error: doctors.error }, { status: 400 })
    }
    const medications = normaliseMedications(body.medications)
    if (medications.error) {
      return NextResponse.json({ success: false, error: medications.error }, { status: 400 })
    }

    const { error } = await supabase
      .from('patient_case_sheets')
      .update({ ...values, updated_by: user.id })
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)

    if (error) throw error

    // Child rows are replaced wholesale rather than diffed row by row. The
    // editor always submits the complete list, and the change log records what
    // moved, so there is nothing to gain from a per-row merge.
    if (body.doctors !== undefined) {
      const { error: delError } = await supabase
        .from('case_sheet_doctors')
        .delete()
        .eq('case_sheet_id', caseSheetId)
      if (delError) throw delError

      if (doctors.rows.length > 0) {
        const { error: insError } = await supabase.from('case_sheet_doctors').insert(
          doctors.rows.map((d, i) => ({ ...d, case_sheet_id: caseSheetId, display_order: i })),
        )
        if (insError) throw insError
      }
    }

    if (body.medications !== undefined) {
      const { error: delError } = await supabase
        .from('case_sheet_medications')
        .delete()
        .eq('case_sheet_id', caseSheetId)
      if (delError) throw delError

      if (medications.rows.length > 0) {
        const { error: insError } = await supabase.from('case_sheet_medications').insert(
          medications.rows.map((m, i) => ({ ...m, case_sheet_id: caseSheetId, display_order: i })),
        )
        if (insError) throw insError
      }
    }

    // ── Change log ───────────────────────────────────────────────────────────
    let changes = diffFields(before as any, values, TRACKED_FIELDS)

    if (body.doctors !== undefined) {
      changes = diffList(
        changes,
        'doctors',
        summariseList<CaseSheetDoctor>(before.doctors, describeDoctor),
        summariseList(doctors.rows, describeDoctor),
      )
    }
    if (body.medications !== undefined) {
      changes = diffList(
        changes,
        'medications',
        summariseList<CaseSheetMedication>(before.medications, describeMedication),
        summariseList(medications.rows, describeMedication),
      )
    }

    if (changes) {
      await recordAudit(supabase, {
        entityType: 'case_sheet',
        entityId: caseSheetId,
        patientId,
        action: 'updated',
        changes,
        actor: { id: user.id, role: user.role },
      })
    }

    const after = await loadCaseSheet(supabase, patientId, caseSheetId)
    return NextResponse.json({ success: true, data: after })
  } catch (error: any) {
    console.error('Error updating case sheet:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update case sheet' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:delete')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id: patientId, caseSheetId } = await params
    const supabase = await createClient()

    const sheet = await loadCaseSheet(supabase, patientId, caseSheetId)
    if (!sheet) {
      return NextResponse.json({ success: false, error: 'Case sheet not found' }, { status: 404 })
    }

    // Stored objects are not reached by ON DELETE CASCADE.
    for (const attachment of sheet.attachments) {
      const key = attachment.file_key || keyFromUrl(attachment.file_url)
      if (key) await deleteObject(key)
    }

    const { error } = await supabase
      .from('patient_case_sheets')
      .delete()
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)

    if (error) throw error

    // Logged last, and deliberately kept after the row is gone: the audit trail
    // is the only remaining record that this document ever existed.
    await recordAudit(supabase, {
      entityType: 'case_sheet',
      entityId: caseSheetId,
      patientId,
      action: 'deleted',
      summary: `Deleted case sheet ${sheet.summary_no || ''}`.trim(),
      actor: { id: user.id, role: user.role },
    })

    return NextResponse.json({ success: true, message: 'Case sheet deleted' })
  } catch (error: any) {
    console.error('Error deleting case sheet:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete case sheet' },
      { status: 500 },
    )
  }
}
