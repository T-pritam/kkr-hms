'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME } from '@/lib/case-sheet/constants'
import type { CaseSheetAttachment } from '@/lib/case-sheet/types'
import { AlertCircle, Download, Eye, FileText, Trash2, Upload } from 'lucide-react'

/**
 * Scanned case sheets attached to a summary.
 *
 * Several files, kept rather than overwritten — the old flow allowed exactly
 * one and permanently deleted the previous scan on replace. Each file can be
 * ticked individually when downloading the summary.
 */

interface AttachmentListProps {
  patientId: string
  caseSheetId: string
  attachments: CaseSheetAttachment[]
  onChanged: () => void
  canEdit: boolean
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function AttachmentList({
  patientId,
  caseSheetId,
  attachments,
  onChanged,
  canEdit,
}: AttachmentListProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const base = `/api/patients/${patientId}/case-sheets/${caseSheetId}/attachments`

  const upload = async (file: File) => {
    setError('')

    if (file.type !== ATTACHMENT_MIME) {
      setError('Only PDF files can be attached')
      return
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError('File size must be less than 10MB')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(base, { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to upload the file')

      onChanged()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const open = async (attachment: CaseSheetAttachment, download: boolean) => {
    setError('')
    try {
      const res = await fetch(`${base}/${attachment.id}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get the file')

      if (download) {
        const link = document.createElement('a')
        link.href = json.downloadUrl
        link.download = json.filename || 'case-sheet.pdf'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        window.open(json.downloadUrl, '_blank', 'noopener')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const remove = async (attachment: CaseSheetAttachment) => {
    if (!confirm(`Remove "${attachment.filename || 'this file'}"? This cannot be undone.`)) return

    setError('')
    try {
      const res = await fetch(`${base}/${attachment.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to remove the file')
      onChanged()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-muted">No scans attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map(attachment => (
            <li
              key={attachment.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <FileText size={18} className="text-muted shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {attachment.filename || 'Case sheet'}
                  {attachment.size_bytes && (
                    <span className="text-muted ml-2 text-xs">{sizeLabel(attachment.size_bytes)}</span>
                  )}
                </p>
                <UpdatedStamp
                  by={attachment.uploaded_by_name}
                  at={attachment.uploaded_at}
                  action="Uploaded"
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => open(attachment, false)}>
                  <Eye size={14} className="mr-1.5" />
                  View
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => open(attachment, true)}>
                  <Download size={14} />
                </Button>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(attachment)}
                    className="text-muted hover:text-destructive"
                    aria-label="Remove attachment"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} className="mr-1.5" />
            {uploading ? 'Uploading…' : 'Attach a scan (PDF)'}
          </Button>
        </>
      )}
    </div>
  )
}
