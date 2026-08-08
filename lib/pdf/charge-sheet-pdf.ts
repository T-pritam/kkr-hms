/**
 * The printable charge sheet.
 *
 * A4 **portrait**, on the KKR Diagnostic Centre letterhead (see
 * `letterhead.ts`) — `renderChargeSheet` takes a `mode` so callers can
 * render either the self-contained 'digital' copy (letterhead background
 * baked in) or the 'print' copy (no background, same coordinates) meant to
 * go onto the pre-printed paper.
 *
 * The one thing this document must never do is read as an invoice. A sheet is
 * an estimate — the money is not owed, and for a walk-in there is not even an
 * account for it to be owed on — so the status is stated under the title and
 * an unforwarded sheet carries an explicit "not a bill" note above the total.
 * A forwarded one says so instead, because by then the amount *is* on a bill.
 */

import { M, fmt, fmtDate } from './base'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from './letterhead'
import type { LetterheadMode } from './letterhead'
import { qtyCell } from './patient-charges-pdf'

export interface ChargeSheetLineData {
  description: string
  /** Decides whether the quantity is a count, an hours figure, or nothing. */
  billing_mode?: string | null
  /** Snapshotted catalogue name, split out from the free-text description. */
  charge_name?: string | null
  unit_price: number | string
  qty: number
  service_date?: string | null
}

const lineTotal = (item: ChargeSheetLineData) =>
  (Number(item.unit_price) || 0) * (Number(item.qty) || 1)

/**
 * Sheet lines in date order, with the date said once per day.
 *
 * A per-day charge on a sheet is written as one line per day, so without this a
 * five-night stay reprints the same date five times. Same treatment as the
 * patient charges statement: an ordinary Date column filled on the first line of
 * each day, and one total at the bottom rather than a subtotal per day.
 *
 * Undated lines sort last, under a blank date rather than a heading of their own.
 */
function sheetRowsByDate(items: ChargeSheetLineData[]): string[][] {
  const days = new Map<string, ChargeSheetLineData[]>()

  for (const item of items) {
    const day = item.service_date ? String(item.service_date).slice(0, 10) : ''
    const bucket = days.get(day)
    if (bucket) bucket.push(item)
    else days.set(day, [item])
  }

  // Undated last; dated oldest-first, matching the patient charges statement.
  const sorted = [...days.entries()].sort((a, b) => {
    if (!a[0]) return 1
    if (!b[0]) return -1
    return a[0].localeCompare(b[0])
  })

  return sorted.flatMap(([day, rows]) =>
    rows.map((item, index) => [
      index === 0 && day ? fmtDate(day) : '',
      String(item.charge_name || item.description || '—'),
      String(item.charge_name ? (item.description || '—') : '—'),
      qtyCell(item.qty, item.billing_mode),
      fmt(Number(item.unit_price) || 0),
      fmt(lineTotal(item)),
    ]),
  )
}

export interface ChargeSheetData {
  sheet_no: string
  subject_type: 'patient' | 'opd'
  patient?: { name?: string; patient_id?: string; phone?: string | null } | null
  opd_name?: string | null
  opd_phone?: string | null
  opd_age?: number | null
  opd_gender?: string | null
  status: string
  total_amount: number | string
  notes?: string | null
  created_at?: string | null
  items?: ChargeSheetLineData[]
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Estimate — not billed',
  forwarded: 'Forwarded to patient billing',
  cancelled: 'Cancelled',
}

export function renderChargeSheet(data: ChargeSheetData, mode: LetterheadMode = 'digital') {
  const h = mkLetterheadDoc(mode)
  const items = data.items ?? []

  const who =
    data.subject_type === 'patient'
      ? data.patient?.name || 'Unknown patient'
      : data.opd_name || 'Walk-in'

  const ageSex = data.subject_type === 'opd'
    ? [data.opd_age != null ? `${data.opd_age} Y` : null, data.opd_gender || null].filter(Boolean).join(' / ') || '—'
    : '—'

  minimalPatientBlock(h, {
    name: who,
    ageSex,
    date: fmtDate(data.created_at),
    idNo: data.subject_type === 'patient' ? (data.patient?.patient_id || '—') : '—',
  })

  letterheadSectionTitle(h, `CHARGE SHEET ${data.sheet_no}`)

  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(9)
  h.doc.setTextColor(0, 0, 0)
  const statusLine = [
    STATUS_LABEL[data.status] ?? data.status,
    data.subject_type === 'patient' ? data.patient?.phone : data.opd_phone,
  ].filter(Boolean).join('   •   ')
  h.doc.text(statusLine, h.pw / 2, h.y, { align: 'center' })
  h.y += 9

  letterheadTable(
    h,
    [
      { label: 'Date', width: 20 },
      { label: 'Charge', width: 28 },
      { label: 'Description', width: 28 },
      { label: 'Qty', width: 10, align: 'right' },
      { label: 'Rate', width: 17, align: 'right' },
      { label: 'Amount', width: 17, align: 'right' },
    ],
    sheetRowsByDate(items),
    { totalLabel: 'TOTAL', totalValue: fmt(data.total_amount) },
  )

  h.checkPage(20)
  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(8)
  h.doc.setTextColor(0, 0, 0)

  const disclaimer =
    data.status === 'forwarded'
      ? 'These charges have been added to the patient\'s bill and are payable there.'
      : 'This is an estimate, not a bill. No amount is due and no payment is being requested. Charges are payable only once added to a patient account.'

  h.doc.text(h.doc.splitTextToSize(disclaimer, h.cw), M, h.y)
  h.y += 12

  if (data.notes) {
    h.checkPage(20)
    h.doc.setFont('helvetica', 'bold')
    h.doc.setFontSize(9)
    h.doc.text('Notes', M, h.y)
    h.y += 5
    h.doc.setFont('helvetica', 'normal')
    h.doc.setFontSize(8)
    h.doc.text(h.doc.splitTextToSize(data.notes, h.cw), M, h.y)
  }

  return h.doc
}

export function chargeSheetFilename(data: ChargeSheetData): string {
  return `${data.sheet_no}.pdf`
}

/** Downloads the self-contained digital copy. */
export function printChargeSheet(data: ChargeSheetData): void {
  const doc = renderChargeSheet(data, 'digital')
  doc.save(chargeSheetFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printChargeSheetToPrinter(data: ChargeSheetData): void {
  autoPrint(renderChargeSheet(data, 'print'))
}
