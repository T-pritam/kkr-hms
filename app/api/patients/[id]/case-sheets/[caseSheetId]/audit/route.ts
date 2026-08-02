/**
 * The change log for one case sheet.
 *
 * Read-only by design — there is no POST, PATCH or DELETE here, and the table
 * is granted only SELECT and INSERT. An audit trail that can be edited through
 * the API it audits is not an audit trail.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:read')
  if (auth.response) return auth.response

  try {
    const { id: patientId, caseSheetId } = await params
    const supabase = await createClient()

    const { data: sheet } = await supabase
      .from('patient_case_sheets')
      .select('id')
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (!sheet) {
      return NextResponse.json({ success: false, error: 'Case sheet not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('record_audit_log')
      .select('*')
      .eq('entity_type', 'case_sheet')
      .eq('entity_id', caseSheetId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error loading change log:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load the change log' },
      { status: 500 },
    )
  }
}
