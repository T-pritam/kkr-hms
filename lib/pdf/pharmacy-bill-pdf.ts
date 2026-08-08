/**
 * Pharmacy bill PDF — one stored SmartPharma360 invoice.
 *
 * On the house letterhead, laid out like every other document here: artwork,
 * patient block, title, table. The one difference is the name: the pharmacy is
 * a separate trader, so the letterhead's "DIAGNOSTIC CENTRE" is painted out and
 * "PHARMACY" printed in its place — see `overprintLetterheadName`.
 *
 * This is also the one document with no separate print copy. The others are
 * printed onto pre-printed stationery, but that stationery carries the wrong
 * trader's name for a pharmacy bill, so this one always draws its own header
 * and goes onto plain paper.
 *
 * There is no GST column. Every MRP the pharmacy sends is already tax-inclusive,
 * so a rate beside it invites the reader to add it on again. The rates are still
 * stored — they are part of what the pharmacy said — just not printed.
 *
 * This is what patient-charges-download-modal.tsx appends, one bill per
 * document, when the desk ticks a pharmacy bill to attach — and because
 * `mkLetterheadDoc` always starts a fresh page, each bill lands on its own page
 * in the merged PDF regardless of how much room was left on the page before it.
 */

import { M, fmt, fmtDate } from './base'
import { formatAgeSex } from '@/lib/patients/age'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from './letterhead'
import type { PatientChargesPatient } from './patient-charges-pdf'

export interface PharmacyBillItemRow {
  product_name: string
  batch_number?: string | null
  packing?: string | null
  expiry?: string | null
  sale_quantity: number
  mrp?: number | string | null
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

export function renderPharmacyBill(data: PharmacyBillData) {
  // The name rides on the doc rather than being drawn here, so a bill that runs
  // to a second page carries it there too.
  const h = mkLetterheadDoc('digital', { name: 'PHARMACY' })
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
      { label: 'Medicine', width: 32 },
      { label: 'Batch', width: 16 },
      { label: 'Pack', width: 10 },
      { label: 'Expiry', width: 12 },
      { label: 'Qty', width: 9, align: 'right' },
      { label: 'MRP', width: 15, align: 'right' },
      { label: 'Amount', width: 16, align: 'right' },
    ],
    items.map(item => [
      item.product_name,
      item.batch_number || '—',
      item.packing || '—',
      item.expiry || '—',
      String(item.sale_quantity ?? 1),
      item.mrp != null ? fmt(Number(item.mrp)) : '—',
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
  renderPharmacyBill(data).save(pharmacyBillFilename(data))
}

/** Sends the same document to the browser's print dialog. Unlike the other
 * documents there is no letterhead-less variant — see the module comment. */
export function printPharmacyBill(data: PharmacyBillData): void {
  autoPrint(renderPharmacyBill(data))
}
