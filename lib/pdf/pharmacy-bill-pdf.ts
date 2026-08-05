/**
 * Pharmacy bill PDF — one stored SmartPharma360 invoice, on the KKR letterhead.
 *
 * Same treatment as the patient charges statement (patient-charges-pdf.ts):
 * a minimal Name/Age-Sex/Date/Id-No block, a centred title, and a bordered
 * black-and-white table of the medicine lines. This is what
 * patient-charges-download-modal.tsx appends, one bill per document, when
 * the desk ticks a pharmacy bill to attach — and because `mkLetterheadDoc`
 * always starts a fresh page, each bill lands on its own page in the merged
 * PDF regardless of how much room was left on the page before it.
 */

import { M, fmt, fmtDate } from './base'
import { formatAgeSex } from '@/lib/patients/age'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from './letterhead'
import type { LetterheadMode } from './letterhead'
import type { PatientChargesPatient } from './patient-charges-pdf'

export interface PharmacyBillItemRow {
  product_name: string
  batch_number?: string | null
  packing?: string | null
  sale_quantity: number
  mrp?: number | string | null
  gst_percent?: number | string | null
  net_amount: number | string
}

export interface PharmacyBillData {
  patient: PatientChargesPatient
  entry_number?: string | null
  external_bill_id?: number | string | null
  entry_date: string
  net_amount: number | string
  items: PharmacyBillItemRow[]
}

export function renderPharmacyBill(data: PharmacyBillData, mode: LetterheadMode = 'digital') {
  const h = mkLetterheadDoc(mode)
  const { patient, items } = data
  const label = data.entry_number || (data.external_bill_id != null ? String(data.external_bill_id) : '—')

  minimalPatientBlock(h, {
    name: patient.name || 'Patient',
    ageSex: formatAgeSex(patient) || '—',
    date: fmtDate(data.entry_date),
    idNo: patient.patient_id || '—',
  })

  letterheadSectionTitle(h, `PHARMACY BILL — ${label}`)

  if (items.length === 0) {
    h.doc.setFont('helvetica', 'normal')
    h.doc.setFontSize(9)
    h.doc.setTextColor(0, 0, 0)
    h.doc.text('No medicines recorded on this bill.', M, h.y)
    return h.doc
  }

  letterheadTable(
    h,
    [
      { label: 'Medicine', width: 34 },
      { label: 'Batch', width: 16 },
      { label: 'Unit', width: 12 },
      { label: 'Qty', width: 10, align: 'right' },
      { label: 'Rate', width: 16, align: 'right' },
      { label: 'GST %', width: 10, align: 'right' },
      { label: 'Net Amount', width: 18, align: 'right' },
    ],
    items.map(item => [
      item.product_name,
      item.batch_number || '—',
      item.packing || '—',
      String(item.sale_quantity ?? 1),
      item.mrp != null ? fmt(Number(item.mrp)) : '—',
      item.gst_percent != null ? Number(item.gst_percent).toFixed(2) : '—',
      fmt(Number(item.net_amount)),
    ]),
    { totalLabel: 'TOTAL', totalValue: fmt(Number(data.net_amount)) },
  )

  return h.doc
}

export function pharmacyBillFilename(data: PharmacyBillData): string {
  const safeLabel = String(data.entry_number || data.external_bill_id || 'bill').replace(/[^a-z0-9]/gi, '_')
  return `Pharmacy_Bill_${safeLabel}.pdf`
}

export function generatePharmacyBillPDF(data: PharmacyBillData): void {
  renderPharmacyBill(data, 'digital').save(pharmacyBillFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printPharmacyBill(data: PharmacyBillData): void {
  autoPrint(renderPharmacyBill(data, 'print'))
}
