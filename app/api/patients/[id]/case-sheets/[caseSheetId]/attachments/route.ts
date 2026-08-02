/**
 * Scanned case sheets attached to a discharge summary.
 *
 *   POST — upload a PDF (multipart, field `file`)
 *
 * Several files per summary, kept rather than overwritten. The old flow allowed
 * exactly one and permanently deleted the previous object on replace.
 *
 * The upload also no longer goes through the `upload-case-sheet` edge function,
 * which minted presigned URLs for anyone who sent *any* Authorization header —
 * it never verified the token (BUGS.md 🔴). The bytes go straight to R2 from
 * here, behind the same role check as everything else in the module.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME } from '@/lib/case-sheet/constants'
import { attachmentKey, publicUrl, putObject } from '@/lib/storage/r2'
import { recordAudit } from '@/lib/audit/log'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:write')
  if (auth.response) return auth.response
  const { user } = auth

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

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }
    if (file.type !== ATTACHMENT_MIME) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files can be attached' },
        { status: 400 },
      )
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File size must be less than 10MB' },
        { status: 400 },
      )
    }

    const key = attachmentKey(patientId, file.name)
    const bytes = new Uint8Array(await file.arrayBuffer())

    try {
      await putObject(key, bytes, file.type)
    } catch (uploadError) {
      console.error('Error uploading attachment to R2:', uploadError)
      return NextResponse.json(
        { success: false, error: 'Failed to upload the file. Please try again.' },
        { status: 502 },
      )
    }

    // Appended to the end of the list rather than inserted at 0, so the order
    // scans were added is preserved on the printed summary.
    const { count } = await supabase
      .from('case_sheet_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('case_sheet_id', caseSheetId)

    const { data: attachment, error } = await supabase
      .from('case_sheet_attachments')
      .insert({
        case_sheet_id: caseSheetId,
        file_url: publicUrl(key),
        file_key: key,
        filename: file.name,
        size_bytes: file.size,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
        display_order: count ?? 0,
      })
      .select()
      .single()

    if (error) throw error

    await recordAudit(supabase, {
      entityType: 'case_sheet',
      entityId: caseSheetId,
      patientId,
      action: 'updated',
      summary: `Attached ${file.name}`,
      actor: { id: user.id, role: user.role },
    })

    return NextResponse.json({ success: true, data: attachment }, { status: 201 })
  } catch (error: any) {
    console.error('Error attaching file:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to attach the file' },
      { status: 500 },
    )
  }
}
