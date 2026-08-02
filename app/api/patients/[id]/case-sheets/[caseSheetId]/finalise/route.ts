/**
 * Signing off a discharge summary.
 *
 *   POST   — draft → final, and marks the patient Discharged
 *   DELETE — final → draft ("reopen"), leaving the patient status alone
 *
 * Finalising is the moment the document becomes real, so this is where the four
 * required fields are enforced. It is also the only thing that discharges the
 * patient: under the old code merely *creating* a case sheet did that, so a
 * half-written note discharged someone still in a bed.
 *
 * Reopening does not un-discharge. If a patient's status needs reverting that
 * is a separate, deliberate act on the Patient Info tab — quietly re-admitting
 * someone because a typo was fixed in their summary would be worse.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'
import { loadCaseSheet } from '@/lib/case-sheet/detail'
import { validateFinalise } from '@/lib/case-sheet/validate'
import { recordAudit } from '@/lib/audit/log'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:finalise')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id: patientId, caseSheetId } = await params
    const supabase = await createClient()

    const sheet = await loadCaseSheet(supabase, patientId, caseSheetId)
    if (!sheet) {
      return NextResponse.json({ success: false, error: 'Case sheet not found' }, { status: 404 })
    }
    if (sheet.status === 'final') {
      return NextResponse.json(
        { success: false, error: 'This case sheet is already finalised' },
        { status: 400 },
      )
    }

    const check = validateFinalise(sheet)
    if (!check.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Fill in the required sections before finalising',
          errors: check.errors,
        },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('patient_case_sheets')
      .update({
        status: 'final',
        finalised_by: user.id,
        finalised_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)

    if (error) throw error

    // Discharging the patient is a side effect of sign-off, not the point of
    // it. A failure here must not leave the summary un-finalised, so it is
    // logged rather than thrown.
    const { error: patientError } = await supabase
      .from('patients')
      .update({ status: 'Discharged', updated_by: user.id })
      .eq('id', patientId)

    if (patientError) {
      console.error('Case sheet finalised but patient status not updated:', patientError)
    }

    await recordAudit(supabase, {
      entityType: 'case_sheet',
      entityId: caseSheetId,
      patientId,
      action: 'finalised',
      summary: `Finalised case sheet ${sheet.summary_no || ''} and discharged the patient`.trim(),
      actor: { id: user.id, role: user.role },
    })

    const after = await loadCaseSheet(supabase, patientId, caseSheetId)
    return NextResponse.json({ success: true, data: after })
  } catch (error: any) {
    console.error('Error finalising case sheet:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to finalise case sheet' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:finalise')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id: patientId, caseSheetId } = await params
    const supabase = await createClient()

    const sheet = await loadCaseSheet(supabase, patientId, caseSheetId)
    if (!sheet) {
      return NextResponse.json({ success: false, error: 'Case sheet not found' }, { status: 404 })
    }
    if (sheet.status !== 'final') {
      return NextResponse.json(
        { success: false, error: 'This case sheet is not finalised' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('patient_case_sheets')
      .update({ status: 'draft', finalised_by: null, finalised_at: null, updated_by: user.id })
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)

    if (error) throw error

    await recordAudit(supabase, {
      entityType: 'case_sheet',
      entityId: caseSheetId,
      patientId,
      action: 'reopened',
      summary: `Reopened case sheet ${sheet.summary_no || ''} for editing`.trim(),
      actor: { id: user.id, role: user.role },
    })

    const after = await loadCaseSheet(supabase, patientId, caseSheetId)
    return NextResponse.json({ success: true, data: after })
  } catch (error: any) {
    console.error('Error reopening case sheet:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reopen case sheet' },
      { status: 500 },
    )
  }
}
