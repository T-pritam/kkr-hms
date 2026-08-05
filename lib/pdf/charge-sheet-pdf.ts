import {
  M, ROW_H, C,
  mkDoc, hdr, sec, thead, trow, ttotal, footers,
  fmt, fmtDate,
} from './base'

/**
 * The printable charge sheet.
 *
 * Portrait rather than the landscape the billing reports use: this is a short
 * itemised list handed across a desk, not a wide financial table.
 *
 * The one thing this document must never do is read as an invoice. A sheet is an
 * estimate — the money is not owed, and for a walk-in there is not even an
 * account for it to be owed on — so the status is stated in the header and an
 * unforwarded sheet carries an explicit "not a bill" note above the total. A
 * forwarded one says so instead, because by then the amount *is* on a bill.
 */

export interface ChargeSheetLineData {
  description: string
  unit_price: number | string
  qty: number
  service_date?: string | null
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

export function renderChargeSheet(data: ChargeSheetData) {
  const h = mkDoc('portrait')
  const items = data.items ?? []

  const who =
    data.subject_type === 'patient'
      ? data.patient?.name || 'Unknown patient'
      : data.opd_name || 'Walk-in'

  hdr(
    h,
    `Charge Sheet ${data.sheet_no}`,
    `${who}  •  ${STATUS_LABEL[data.status] ?? data.status}  •  ${fmtDate(data.created_at)}`,
  )

  // ── Who it is for ──────────────────────────────────────────────────────────
  sec(h, 'DETAILS', C.blue)

  const details: [string, string][] =
    data.subject_type === 'patient'
      ? [
          ['Name', data.patient?.name || '—'],
          ['Patient ID', data.patient?.patient_id || '—'],
          ['Phone', data.patient?.phone || '—'],
        ]
      : [
          ['Name', data.opd_name || '—'],
          ['Phone', data.opd_phone || '—'],
          ['Age', data.opd_age != null ? String(data.opd_age) : '—'],
          ['Gender', data.opd_gender || '—'],
          ['Type', 'OPD / walk-in (not registered)'],
        ]

  h.normal(9)
  details.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      h.doc.setFillColor(...C.tblAlt)
      h.doc.rect(M, h.y, h.cw, ROW_H, 'F')
    }
    h.bold(9)
    h.doc.text(label, M + 3, h.y + 5)
    h.normal(9)
    h.doc.text(value, M + 45, h.y + 5)
    h.y += ROW_H
  })

  h.y += 6

  // ── The lines ──────────────────────────────────────────────────────────────
  sec(h, 'CHARGES', C.blue)

  // Right edge of the portrait content area, for the money columns.
  const re = M + h.cw

  thead(h, [
    { label: 'Date', x: M + 3 },
    { label: 'Description', x: M + 32 },
    { label: 'Qty', x: re - 58, align: 'right' },
    { label: 'Rate', x: re - 33, align: 'right' },
    { label: 'Amount', x: re - 3, align: 'right' },
  ])

  items.forEach((item, index) => {
    h.checkPage()
    const qty = Number(item.qty) || 1
    const rate = Number(item.unit_price) || 0

    trow(
      h,
      [
        { text: item.service_date ? fmtDate(item.service_date) : '—', x: M + 3 },
        { text: String(item.description || '—').substring(0, 48), x: M + 32 },
        { text: String(qty), x: re - 58, align: 'right' },
        { text: fmt(rate), x: re - 33, align: 'right' },
        { text: fmt(rate * qty), x: re - 3, align: 'right' },
      ],
      index,
    )
  })

  if (items.length === 0) {
    h.normal(9)
    h.doc.setTextColor(...C.dark)
    h.doc.text('No charges on this sheet.', M + 3, h.y + 5)
    h.y += ROW_H
  }

  ttotal(h, [
    { text: 'TOTAL', x: M + 3 },
    { text: fmt(data.total_amount), x: re - 3, align: 'right' },
  ])

  h.y += 6

  // ── What this document is, and is not ──────────────────────────────────────
  h.checkPage(20)
  h.normal(8)
  h.doc.setTextColor(...C.dark)

  const disclaimer =
    data.status === 'forwarded'
      ? 'These charges have been added to the patient\'s bill and are payable there.'
      : 'This is an estimate, not a bill. No amount is due and no payment is being requested. Charges are payable only once added to a patient account.'

  h.doc.text(h.doc.splitTextToSize(disclaimer, h.cw - 6), M + 3, h.y + 4)
  h.y += 12

  if (data.notes) {
    h.checkPage(20)
    h.bold(9)
    h.doc.text('Notes', M + 3, h.y + 4)
    h.normal(8)
    h.doc.text(h.doc.splitTextToSize(data.notes, h.cw - 6), M + 3, h.y + 10)
  }

  footers(h, { showGenerated: true })
  return h.doc
}

export function chargeSheetFilename(data: ChargeSheetData): string {
  return `${data.sheet_no}.pdf`
}

/** Opens the document in a new tab for printing. */
export function printChargeSheet(data: ChargeSheetData): void {
  const doc = renderChargeSheet(data)
  doc.save(chargeSheetFilename(data))
}
