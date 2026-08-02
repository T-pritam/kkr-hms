/**
 * Raw bytes of an attachment.
 *
 * Exists for one reason: merging. To append a scanned case sheet to the
 * generated discharge summary the browser has to read the PDF, and it cannot
 * fetch the R2 URL directly — the bucket sends no CORS headers, so the request
 * is blocked before it starts. Proxying through our own origin sidesteps that
 * and keeps the presigned URL off the wire.
 *
 * The signed-URL route next door is still the right one for "view" and
 * "download"; this one is only for reading bytes into memory.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'
import { getObjectBytes, keyFromUrl } from '@/lib/storage/r2'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string; attachmentId: string }> },
) {
  const auth = await requireCaseSheet(request, 'casesheet:read')
  if (auth.response) return auth.response

  try {
    const { id: patientId, caseSheetId, attachmentId } = await params
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

    const { data: attachment } = await supabase
      .from('case_sheet_attachments')
      .select('*')
      .eq('id', attachmentId)
      .eq('case_sheet_id', caseSheetId)
      .maybeSingle()

    if (!attachment) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 })
    }

    const key = attachment.file_key || keyFromUrl(attachment.file_url)
    if (!key) {
      return NextResponse.json(
        { success: false, error: 'This file is missing its storage reference' },
        { status: 400 },
      )
    }

    const bytes = await getObjectBytes(key)

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${(attachment.filename || 'attachment.pdf').replace(/"/g, '')}"`,
        // Patient documents must never sit in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: any) {
    console.error('Error streaming attachment:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to read the file' },
      { status: 500 },
    )
  }
}
