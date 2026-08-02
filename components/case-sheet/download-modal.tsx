'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { docBytes, downloadPdf, mergePdfs, type MergePart } from '@/lib/pdf/merge'
import {
  dischargeSummaryFilename,
  fetchDischargeSummaryData,
  renderDischargeSummary,
} from '@/lib/pdf/discharge-summary-pdf'
import { fetchLabReportData, renderLabReport } from '@/lib/pdf/lab-report-pdf'
import type { CaseSheet } from '@/lib/case-sheet/types'
import { AlertCircle, Download, FileText, FlaskConical } from 'lucide-react'

/**
 * Choosing what goes into the downloaded discharge pack.
 *
 * The summary is always included. Lab reports and scanned case sheets are
 * ticked individually — any combination, or none — and everything selected is
 * merged into a single PDF in a fixed order: summary, then lab reports, then
 * scans.
 *
 * Merging needs `pdf-lib`: jsPDF can write a PDF but cannot read one, so
 * neither an uploaded scan nor a separately generated lab report could
 * otherwise be appended.
 */

interface LabOrder {
  id: string
  order_no: string
  status: string
  registered_at: string | null
  reported_at: string | null
}

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  caseSheet: CaseSheet
}

const dateOnly = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN') : '—'

export function DownloadModal({ isOpen, onClose, patientId, caseSheet }: DownloadModalProps) {
  const [labOrders, setLabOrders] = useState<LabOrder[]>([])
  const [pickedLabs, setPickedLabs] = useState<Set<string>>(new Set())
  const [pickedFiles, setPickedFiles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const loadLabOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/lab-orders?pageSize=50`)
      const json = await res.json()
      if (res.ok && json.success) {
        // Only orders with results are worth attaching; a registered-but-empty
        // order would print "no results have been entered yet".
        setLabOrders(
          (json.data.data || []).filter((o: LabOrder) =>
            ['in_progress', 'reported'].includes(o.status),
          ),
        )
      }
    } catch {
      // A lab fetch failure must not block downloading the summary itself.
      setLabOrders([])
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setWarning('')
    setPickedLabs(new Set())
    setPickedFiles(new Set())
    void loadLabOrders()
  }, [isOpen, loadLabOrders])

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }

  const download = async () => {
    setBuilding(true)
    setError('')
    setWarning('')

    try {
      const data = await fetchDischargeSummaryData(patientId, caseSheet.id)
      const parts: MergePart[] = [
        { label: 'Discharge summary', bytes: docBytes(renderDischargeSummary(data)) },
      ]

      for (const order of labOrders.filter(o => pickedLabs.has(o.id))) {
        try {
          const report = await fetchLabReportData(order.id)
          parts.push({ label: `Lab report ${order.order_no}`, bytes: docBytes(renderLabReport(report)) })
        } catch {
          parts.push({ label: `Lab report ${order.order_no}`, bytes: new Uint8Array() })
        }
      }

      for (const attachment of caseSheet.attachments.filter(a => pickedFiles.has(a.id))) {
        const label = attachment.filename || 'Attachment'
        try {
          const res = await fetch(
            `/api/patients/${patientId}/case-sheets/${caseSheet.id}/attachments/${attachment.id}/file`,
          )
          if (!res.ok) throw new Error('unreadable')
          parts.push({ label, bytes: new Uint8Array(await res.arrayBuffer()) })
        } catch {
          parts.push({ label, bytes: new Uint8Array() })
        }
      }

      // A single-part download needs no merge pass at all.
      if (parts.length === 1) {
        renderDischargeSummary(data).save(dischargeSummaryFilename(data))
        onClose()
        return
      }

      const { bytes, skipped } = await mergePdfs(parts)
      downloadPdf(bytes, dischargeSummaryFilename(data))

      if (skipped.length > 0) {
        setWarning(`Downloaded, but these could not be read and were left out: ${skipped.join(', ')}`)
      } else {
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to build the download')
    } finally {
      setBuilding(false)
    }
  }

  const selectedCount = 1 + pickedLabs.size + pickedFiles.size

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Download discharge summary"
      description="Tick anything else to append. Everything selected comes down as one PDF."
      size="lg"
    >
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {warning && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-warning-subtle border border-warning/30 text-warning-text text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-inset p-3">
          <FileText size={18} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Discharge summary {caseSheet.summary_no && `— ${caseSheet.summary_no}`}
            </p>
            <p className="text-xs text-muted">Always included</p>
          </div>
          {caseSheet.status === 'draft' && <Badge variant="warning">Draft</Badge>}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Lab reports</h4>
          {loading ? (
            <p className="text-sm text-muted">Loading lab history…</p>
          ) : labOrders.length === 0 ? (
            <p className="text-sm text-muted">No lab reports with results for this patient.</p>
          ) : (
            <ul className="space-y-2">
              {labOrders.map(order => (
                <li key={order.id}>
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-inset">
                    <input
                      type="checkbox"
                      checked={pickedLabs.has(order.id)}
                      onChange={() => toggle(pickedLabs, order.id, setPickedLabs)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <FlaskConical size={16} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                      {order.order_no}
                      <span className="text-muted ml-2 text-xs">
                        {dateOnly(order.reported_at || order.registered_at)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Raw case sheet & scans</h4>
          {caseSheet.attachments.length === 0 ? (
            <p className="text-sm text-muted">No scans attached to this case sheet.</p>
          ) : (
            <ul className="space-y-2">
              {caseSheet.attachments.map(attachment => (
                <li key={attachment.id}>
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-inset">
                    <input
                      type="checkbox"
                      checked={pickedFiles.has(attachment.id)}
                      onChange={() => toggle(pickedFiles, attachment.id, setPickedFiles)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <FileText size={16} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                      {attachment.filename || 'Case sheet'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={building}>
            Cancel
          </Button>
          <Button type="button" className="sm:ml-auto" onClick={download} disabled={building}>
            <Download size={16} className="mr-1.5" />
            {building
              ? 'Building the PDF…'
              : selectedCount > 1
                ? `Download ${selectedCount} documents as one PDF`
                : 'Download'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
