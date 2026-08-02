/**
 * One attachment.
 *
 *   GET    — a time-limited URL the browser can open or download
 *   DELETE — removes the object and the row
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'
import { deleteObject, keyFromUrl, signedGetUrl } from '@/lib/storage/r2'
import { recordAudit } from '@/lib/audit/log'

type Params = { params: Promise<{ id: string; caseSheetId: string; attachmentId: string }> }

/**
 * Loads the attachment, scoped by both the case sheet and the patient.
 *
 * All three ids are checked. Without the patient filter, a valid attachment id
 * would resolve through any patient's URL.
 */
async function findAttachment(
  supabase: any,
  patientId: string,
  caseSheetId: string,
  attachmentId: string,
) {
  const { data: sheet } = await supabase
    .from('patient_case_sheets')
    .select('id')
    .eq('id', caseSheetId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (!sheet) return null

  const { data: attachment } = await supabase
    .from('case_sheet_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('case_sheet_id', caseSheetId)
    .maybeSingle()

  return attachment ?? null
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireCaseSheet(request, 'casesheet:read')
  if (auth.response) return auth.response

  try {
    const { id: patientId, caseSheetId, attachmentId } = await params
    const supabase = await createClient()

    const attachment = await findAttachment(supabase, patientId, caseSheetId, attachmentId)
    if (!attachment) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 })
    }

    // Rows written before file_key existed fall back to deriving it from the
    // stored URL, which is what the backfill could not always do.
    const key = attachment.file_key || keyFromUrl(attachment.file_url)
    if (!key) {
      return NextResponse.json(
        { success: false, error: 'This file is missing its storage reference' },
        { status: 400 },
      )
    }

    const downloadUrl = await signedGetUrl(key)
    return NextResponse.json({
      success: true,
      downloadUrl,
      filename: attachment.filename || 'case-sheet.pdf',
    })
  } catch (error: any) {
    console.error('Error getting attachment URL:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get the download link' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireCaseSheet(request, 'casesheet:write')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id: patientId, caseSheetId, attachmentId } = await params
    const supabase = await createClient()

    const attachment = await findAttachment(supabase, patientId, caseSheetId, attachmentId)
    if (!attachment) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 })
    }

    const key = attachment.file_key || keyFromUrl(attachment.file_url)
    if (key) await deleteObject(key)

    const { error } = await supabase
      .from('case_sheet_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('case_sheet_id', caseSheetId)

    if (error) throw error

    await recordAudit(supabase, {
      entityType: 'case_sheet',
      entityId: caseSheetId,
      patientId,
      action: 'updated',
      summary: `Removed attachment ${attachment.filename || ''}`.trim(),
      actor: { id: user.id, role: user.role },
    })

    return NextResponse.json({ success: true, message: 'Attachment removed' })
  } catch (error: any) {
    console.error('Error deleting attachment:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove the attachment' },
      { status: 500 },
    )
  }
}
