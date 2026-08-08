/**
 * Pharmacy bill PDF — one stored SmartPharma360 invoice.
 *
 * On the house letterhead, laid out like every other document here: artwork,
 * patient block, title, table. The pharmacy is a separate trader, so its name,
 * GSTIN and drug licences print in their own block under the title — the tax
 * details a bill has to carry, without the page pretending to be a different
 * business's stationery.
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
import { PHARMACY_BRANDING } from './branding'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from './letterhead'
import type { LetterheadMode } from './letterhead'
import type { PatientChargesPatient } from './patient-charges-pdf'
import type { H } from './base'

export interface PharmacyBillItemRow {
  product_name: string
  batch_number?: string | null
  packing?: string | null
  expiry?: string | null
  sale_quantity: number
  mrp?: number | string | null
  net_amount: number | string
}

/**
 * Who sold the medicines, under the title.
 *
 * The letterhead above names the clinic; these are the pharmacy's own
 * registration details, which a tax document has to carry. Deliberately small
 * and boxed off — reference matter, not a second letterhead competing with the
 * first.
 */
function pharmacyDetails(h: H): void {
  const b = PHARMACY_BRANDING

  h.checkPage(20)
  h.doc.setTextColor(0, 0, 0)

  h.bold(9)
  h.doc.text(b.name, M, h.y)
  h.y += 4

  h.normal(7.5)
  for (const line of b.addressLines) {
    h.doc.text(line, M, h.y)
    h.y += 3.4
  }
  h.doc.text(`Email : ${b.email}`, M, h.y)
  h.y += 3.4

  h.doc.text(`GSTIN : ${b.gstin}`, M, h.y)
  const licences = b.drugLicences.join('    ')
  if (licences) h.doc.text(licences, h.re, h.y, { align: 'right' })
  h.y += 6
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

  pharmacyDetails(h)

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
  renderPharmacyBill(data, 'digital').save(pharmacyBillFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printPharmacyBill(data: PharmacyBillData): void {
  autoPrint(renderPharmacyBill(data, 'print'))
}
