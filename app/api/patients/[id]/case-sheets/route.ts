/**
 * Case sheets for one patient.
 *
 *   GET  — every case sheet, newest first, with doctors, medication and scans
 *   POST — creates a draft
 *
 * The old handlers authenticated and then never read the role, so a
 * receptionist could write a discharge summary (see lib/case-sheet/authz.ts).
 * The old POST also validated nothing at all.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'
import { loadCaseSheets } from '@/lib/case-sheet/detail'
import {
  normaliseCaseSheetBody,
  normaliseDoctors,
  normaliseMedications,
  validateCaseSheet,
} from '@/lib/case-sheet/validate'
import { recordAudit } from '@/lib/audit/log'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:read')
  if (auth.response) return auth.response

  try {
    const { id: patientId } = await params
    const supabase = await createClient()

    const sheets = await loadCaseSheets(supabase, patientId)
    return NextResponse.json({ success: true, data: sheets })
  } catch (error: any) {
    console.error('Error loading case sheets:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load case sheets' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:write')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id: patientId } = await params
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))

    // The patient must exist — a case sheet with no patient is unprintable.
    // `date_of_join` comes back too: it is what the admission date defaults to.
    const { data: patient } = await supabase
      .from('patients')
      .select('id, date_of_join')
      .eq('id', patientId)
      .maybeSingle()

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 })
    }

    const values = normaliseCaseSheetBody(body)

    // The admission date printed blank on every discharge summary because
    // nothing ever connected it to the date captured at registration. It stays
    // editable — a readmission is a new admission, not the original one — but
    // it starts from the only date the hospital actually has.
    if (values.admission_date == null && patient.date_of_join) {
      values.admission_date = patient.date_of_join
    }

    const check = validateCaseSheet(values)
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

    const { data: summaryNo, error: numberError } = await supabase.rpc('next_discharge_summary_no')
    if (numberError) throw numberError

    const { data: sheet, error } = await supabase
      .from('patient_case_sheets')
      .insert({
        ...values,
        patient_id: patientId,
        summary_no: summaryNo,
        // Always a draft. Under the old code, creating a case sheet immediately
        // marked the patient Discharged — even one saved to jot a note down.
        status: 'draft',
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    if (doctors.rows.length > 0) {
      const { error: doctorError } = await supabase.from('case_sheet_doctors').insert(
        doctors.rows.map((d, i) => ({ ...d, case_sheet_id: sheet.id, display_order: i })),
      )
      if (doctorError) throw doctorError
    }

    if (medications.rows.length > 0) {
      const { error: medError } = await supabase.from('case_sheet_medications').insert(
        medications.rows.map((m, i) => ({ ...m, case_sheet_id: sheet.id, display_order: i })),
      )
      if (medError) throw medError
    }

    await recordAudit(supabase, {
      entityType: 'case_sheet',
      entityId: sheet.id,
      patientId,
      action: 'created',
      summary: `Created case sheet ${sheet.summary_no}`,
      actor: { id: user.id, role: user.role },
    })

    return NextResponse.json({ success: true, data: sheet }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating case sheet:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create case sheet' },
      { status: 500 },
    )
  }
}
