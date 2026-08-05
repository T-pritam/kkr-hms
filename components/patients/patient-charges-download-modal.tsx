'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Download, FileText, Pill } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { docBytes, downloadPdf, mergePdfs, type MergePart } from '@/lib/pdf/merge'
import {
  patientChargesFilename, renderPatientCharges, type PatientChargesPatient,
} from '@/lib/pdf/patient-charges-pdf'
import { renderPharmacyBill, type PharmacyBillData } from '@/lib/pdf/pharmacy-bill-pdf'

/**
 * Choosing what goes into the downloaded charges statement.
 *
 * The patient charges statement is always included. Any pharmacy bills on
 * this patient's charges are ticked individually — same "always included
 * primary + optional checklist, merged into one PDF" pattern as the
 * discharge summary's download modal (components/case-sheet/download-modal.tsx).
 *
 * Each ticked bill is fetched in full (with its medicine lines) only at
 * download time, and only for the bills actually picked — this never re-hits
 * SmartPharma360, it reads the copy already stored from when the bill was
 * added.
 */

interface ChargeRow {
  charge_date: string
  charge_type: string
  description?: string | null
  qty: number
  amount: number
  pharmacy_bill?: { id: string; entry_number: string | null; entry_date: string } | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  patientId: string
  patient?: PatientChargesPatient | null
  charges: ChargeRow[]
}

const lineTotal = (c: ChargeRow) => Number(c.amount || 0) * (Number(c.qty) || 1)

export function PatientChargesDownloadModal({ isOpen, onClose, patientId, patient, charges }: Props) {
  const [pickedBills, setPickedBills] = useState<Set<string>>(new Set())
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setWarning('')
    setPickedBills(new Set())
  }, [isOpen])

  const pharmacyRows = charges.filter(c => c.pharmacy_bill)

  const toggle = (id: string) => {
    setPickedBills(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const download = async () => {
    setBuilding(true)
    setError('')
    setWarning('')

    try {
      const patientForPdf = patient ?? { name: 'Patient', patient_id: null }
      const pdfData = {
        patient: patientForPdf,
        charges: charges.map(c => ({
          charge_date: c.charge_date,
          charge_type: c.charge_type || 'Charge',
          description: c.description,
          qty: c.qty || 1,
          amount: lineTotal(c),
        })),
      }

      const parts: MergePart[] = [
        { label: 'Patient charges', bytes: docBytes(renderPatientCharges(pdfData)) },
      ]

      for (const row of pharmacyRows.filter(c => pickedBills.has(c.pharmacy_bill!.id))) {
        const billId = row.pharmacy_bill!.id
        const label = `Pharmacy bill ${row.pharmacy_bill!.entry_number || billId}`
        try {
          const res = await fetch(`/api/patients/${patientId}/pharmacy-bills/${billId}`)
          const detail = await res.json()
          if (!res.ok) throw new Error('unreadable')

          const billData: PharmacyBillData = {
            patient: patientForPdf,
            entry_number: detail.entry_number,
            external_bill_id: detail.external_bill_id,
            entry_date: detail.entry_date,
            net_amount: detail.net_amount,
            items: detail.items || [],
          }
          parts.push({ label, bytes: docBytes(renderPharmacyBill(billData)) })
        } catch {
          parts.push({ label, bytes: new Uint8Array() })
        }
      }

      if (parts.length === 1) {
        renderPatientCharges(pdfData).save(patientChargesFilename(pdfData))
        onClose()
        return
      }

      const { bytes, skipped } = await mergePdfs(parts)
      downloadPdf(bytes, patientChargesFilename(pdfData))

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

  const selectedCount = 1 + pickedBills.size

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Download patient charges"
      description="Tick any pharmacy bills to append. Everything selected comes down as one PDF."
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
            <p className="text-sm font-medium text-foreground">Patient charges statement</p>
            <p className="text-xs text-muted">Always included</p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Pharmacy bills</h4>
          {pharmacyRows.length === 0 ? (
            <p className="text-sm text-muted">No pharmacy bills on this patient&apos;s charges.</p>
          ) : (
            <ul className="space-y-2">
              {pharmacyRows.map(row => (
                <li key={row.pharmacy_bill!.id}>
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-inset">
                    <input
                      type="checkbox"
                      checked={pickedBills.has(row.pharmacy_bill!.id)}
                      onChange={() => toggle(row.pharmacy_bill!.id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <Pill size={16} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                      {row.pharmacy_bill!.entry_number || row.pharmacy_bill!.id}
                      <span className="text-muted ml-2 text-xs">
                        {new Date(row.pharmacy_bill!.entry_date).toLocaleDateString('en-IN')}
                      </span>
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
