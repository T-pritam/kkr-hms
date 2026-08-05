'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { useUser } from '@/hooks/use-user'
import { CaseSheetEditorModal } from '@/components/case-sheet/case-sheet-editor-modal'
import { CaseSheetViewModal } from '@/components/case-sheet/case-sheet-view-modal'
import { DownloadModal } from '@/components/case-sheet/download-modal'
import { AuditTrail } from '@/components/case-sheet/audit-trail'
import { hasCapability } from '@/lib/case-sheet/authz'
import { STATUS_LABELS } from '@/lib/case-sheet/constants'
import type { CaseSheet } from '@/lib/case-sheet/types'
import { fetchDischargeSummaryData, printDischargeSummary } from '@/lib/pdf/discharge-summary-pdf'
import {
  AlertCircle, Download, Eye, FileText, History, Paperclip, Pencil, Plus, Printer, RotateCcw, Trash2,
} from 'lucide-react'

/**
 * Case sheets and discharge summaries for one patient.
 *
 * Replaces a screen that held one record per patient — `data[0]`, with the Add
 * button hidden once it existed, so a readmission had nowhere to go. Each
 * admission now gets its own summary and the older ones stay readable.
 */

interface CaseSheetTabProps {
  patientId: string
  billing: any
  patientName?: string
  /** Seeds the admission date on a new draft. */
  patientJoinDate?: string | null
  onStatusChange?: (status: string) => void
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'warning',
  final: 'success',
}

const date = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function CaseSheetTab({
  patientId,
  billing,
  patientName,
  patientJoinDate,
  onStatusChange,
}: CaseSheetTabProps) {
  const { user } = useUser()
  const [sheets, setSheets] = useState<CaseSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [editing, setEditing] = useState<CaseSheet | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [viewing, setViewing] = useState<CaseSheet | null>(null)
  const [downloading, setDownloading] = useState<CaseSheet | null>(null)
  const [historyFor, setHistoryFor] = useState<CaseSheet | null>(null)

  const canWrite = hasCapability(user?.role, 'casesheet:write')
  const canDelete = hasCapability(user?.role, 'casesheet:delete')

  const fetchSheets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/case-sheets`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load case sheets')
      setSheets(json.data || [])
    } catch (err: any) {
      setError(err.message)
      setSheets([])
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void fetchSheets() }, [fetchSheets])
  useRealtimeRefetch(
    ['patient_case_sheets', 'case_sheet_doctors', 'case_sheet_medications', 'case_sheet_attachments'],
    fetchSheets,
  )

  // The open modals hold a snapshot; refresh them so an edit or an upload is
  // reflected without the user closing and reopening.
  useEffect(() => {
    const sync = (sheet: CaseSheet | null) =>
      sheet ? sheets.find(s => s.id === sheet.id) ?? null : null

    setEditing(prev => sync(prev))
    setViewing(prev => sync(prev))
    setDownloading(prev => sync(prev))
  }, [sheets])

  const reopen = async (sheet: CaseSheet) => {
    if (!confirm('Reopen this summary for editing? The patient stays discharged.')) return

    setBusyId(sheet.id)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/case-sheets/${sheet.id}/finalise`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to reopen the summary')
      await fetchSheets()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const printSheet = async (sheet: CaseSheet) => {
    setBusyId(sheet.id)
    setError('')
    try {
      const data = await fetchDischargeSummaryData(patientId, sheet.id)
      printDischargeSummary(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (sheet: CaseSheet) => {
    if (!confirm(`Delete case sheet ${sheet.summary_no || ''}? This cannot be undone.`)) return

    setBusyId(sheet.id)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/case-sheets/${sheet.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete the case sheet')
      await fetchSheets()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const onSaved = async (finalised?: boolean) => {
    await fetchSheets()
    // Only finalising discharges the patient — saving a draft deliberately does
    // not, which is the whole reason the draft stage exists.
    if (finalised) onStatusChange?.('Discharged')
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="mt-2 text-muted">Loading case sheets…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">Case Sheet &amp; Discharge</h3>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => { setEditing(null); setShowEditor(true) }}
          >
            <Plus size={14} className="mr-1.5" />
            New Case Sheet
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sheets.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-border">
          <FileText size={28} className="mx-auto text-muted" />
          <p className="mt-2 text-muted">
            No case sheet yet.{canWrite ? ' Create one when the patient is ready for discharge.' : ''}
          </p>
        </div>
      ) : (
        sheets.map(sheet => (
          <div key={sheet.id} className="bg-surface rounded-lg border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {sheet.summary_no || 'Discharge summary'}
                  </span>
                  <Badge variant={STATUS_VARIANT[sheet.status] ?? 'outline'}>
                    {STATUS_LABELS[sheet.status] ?? sheet.status}
                  </Badge>
                  {sheet.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Paperclip size={12} />
                      {sheet.attachments.length}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted mt-1">
                  {date(sheet.admission_date)} — {date(sheet.discharge_date)}
                </p>
              </div>

              <UpdatedStamp by={sheet.updated_by_name} at={sheet.updated_at} className="shrink-0" />
            </div>

            {sheet.diagnosis && (
              <p className="text-sm text-foreground line-clamp-2">
                <span className="text-muted">Diagnosis: </span>
                {sheet.diagnosis}
              </p>
            )}

            {sheet.doctors.length > 0 && (
              <p className="text-sm text-muted">
                {sheet.doctors.map(d => d.doctor_name).join(', ')}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setViewing(sheet)}>
                <Eye size={14} className="mr-1.5" />
                View
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDownloading(sheet)}>
                <Download size={14} className="mr-1.5" />
                Download PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printSheet(sheet)}
                disabled={busyId === sheet.id}
              >
                <Printer size={14} className="mr-1.5" />
                Print
              </Button>

              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditing(sheet); setShowEditor(true) }}
                >
                  <Pencil size={14} className="mr-1.5" />
                  Edit
                </Button>
              )}

              {canWrite && sheet.status === 'final' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reopen(sheet)}
                  disabled={busyId === sheet.id}
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  Reopen
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={() => setHistoryFor(sheet)}>
                <History size={14} className="mr-1.5" />
                History
              </Button>

              {canDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(sheet)}
                  disabled={busyId === sheet.id}
                  className="text-muted hover:text-destructive"
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))
      )}

      {showEditor && (
        <CaseSheetEditorModal
          isOpen
          onClose={() => { setShowEditor(false); setEditing(null) }}
          patientId={patientId}
          billingId={billing?.id ?? null}
          patientJoinDate={patientJoinDate}
          caseSheet={editing}
          onSaved={onSaved}
        />
      )}

      {viewing && (
        <CaseSheetViewModal
          isOpen
          onClose={() => setViewing(null)}
          caseSheet={viewing}
          patientName={patientName}
          onDownload={() => { setDownloading(viewing); setViewing(null) }}
        />
      )}

      {downloading && (
        <DownloadModal
          isOpen
          onClose={() => setDownloading(null)}
          patientId={patientId}
          caseSheet={downloading}
        />
      )}

      {historyFor && (
        <AuditTrail
          isOpen
          onClose={() => setHistoryFor(null)}
          patientId={patientId}
          caseSheetId={historyFor.id}
          summaryNo={historyFor.summary_no}
        />
      )}
    </div>
  )
}
