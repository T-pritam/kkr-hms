'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Download, FileText, Pill } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { docBytes, downloadPdf, mergePdfs, type MergePart } from '@/lib/pdf/merge'
import {
  chargeSheetFilename, renderChargeSheet, type ChargeSheetData,
} from '@/lib/pdf/charge-sheet-pdf'
import { pharmacyBillParts, type PharmacyBillRef } from '@/lib/pdf/pharmacy-attachments'

/**
 * Choosing what goes into the downloaded charge sheet.
 *
 * The patient-side twin is components/patients/patient-charges-download-modal.tsx,
 * and the two work the same way: the primary document is always included, any
 * pharmacy bills on it are ticked individually, and everything comes down as one
 * merged PDF. Both build their attachment parts with `pharmacyBillParts`.
 *
 * A walk-in sheet has no patient record, so the bill PDF is headed with whatever
 * the sheet knows about the person instead.
 */

interface SheetItem {
  pharmacy_bill?: PharmacyBillRef | PharmacyBillRef[] | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** The full sheet, lines included — the list rows do not carry them. */
  sheet: (ChargeSheetData & { id: string; items?: SheetItem[] }) | null
}

/** PostgREST hands an embed back as an array unless it can prove it is to-one. */
function billsOf(items: SheetItem[] = []): PharmacyBillRef[] {
  return items.flatMap(item => {
    const bill = Array.isArray(item.pharmacy_bill) ? item.pharmacy_bill[0] : item.pharmacy_bill
    return bill ? [bill] : []
  })
}

export function ChargeSheetDownloadModal({ isOpen, onClose, sheet }: Props) {
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

  if (!sheet) return null

  const pharmacyBills = billsOf(sheet.items)

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
      const subject =
        sheet.subject_type === 'patient'
          ? { name: sheet.patient?.name || 'Patient', patient_id: sheet.patient?.patient_id ?? null }
          : { name: sheet.opd_name || 'Walk-in', patient_id: null }

      const parts: MergePart[] = [
        { label: 'Charge sheet', bytes: docBytes(renderChargeSheet(sheet)) },
      ]

      parts.push(
        ...(await pharmacyBillParts(
          pharmacyBills.filter(b => pickedBills.has(b.id)),
          billId => `/api/charge-sheets/${sheet.id}/pharmacy-bills/${billId}`,
          subject,
        )),
      )

      // Nothing ticked: no merge pass needed at all.
      if (parts.length === 1) {
        renderChargeSheet(sheet).save(chargeSheetFilename(sheet))
        onClose()
        return
      }

      const { bytes, skipped } = await mergePdfs(parts)
      downloadPdf(bytes, chargeSheetFilename(sheet))

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
      title={`Download ${sheet.sheet_no}`}
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
            <p className="text-sm font-medium text-foreground">Charge sheet {sheet.sheet_no}</p>
            <p className="text-xs text-muted">Always included</p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Pharmacy bills</h4>
          {pharmacyBills.length === 0 ? (
            <p className="text-sm text-muted">No pharmacy bills on this sheet.</p>
          ) : (
            <ul className="space-y-2">
              {pharmacyBills.map(bill => (
                <li key={bill.id}>
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-inset">
                    <input
                      type="checkbox"
                      checked={pickedBills.has(bill.id)}
                      onChange={() => toggle(bill.id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <Pill size={16} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                      {bill.entry_number || bill.id}
                      <span className="text-muted ml-2 text-xs">
                        {new Date(bill.entry_date).toLocaleDateString('en-IN')}
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
