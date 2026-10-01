/**
 * Payment receipt PDF — the desk's "Cash Receipt" (client, 1 Oct).
 *
 * A half sheet (A5 **landscape**) on plain paper, laid out as the receipt the
 * desk types by hand today: one box, the hospital on the left of the header and
 * "Bill To" on the right, the payments as numbered rows, then the total, the
 * amount in words, the signature line and who made it.
 *
 * Unlike the clinical documents this is not drawn on the letterhead artwork —
 * the client's format carries its own small header, under the hospital's name
 * rather than the diagnostic centre's.
 *
 * Everything printed is what the desk last saved, except the amounts, which
 * are the payments' own. A line the desk left empty (no address, no doctors,
 * no department) is left out rather than printed blank.
 */

import jsPDF from 'jspdf'
import { rupeesInWords } from '@/lib/format/rupees-in-words'
import { autoPrint } from './letterhead'

export interface PaymentReceiptLine {
  /** YYYY-MM-DD, or null for a blank date. */
  line_date: string | null
  payment_mode: string
  transaction_type: string
  remarks: string
  amount: number
}

export interface PaymentReceiptData {
  receipt_no: string
  heading: string
  patient_name: string
  age_sex: string
  mobile: string
  address: string
  ip_no: string
  doctors: string[]
  department: string
  created_by_label: string
  lines: PaymentReceiptLine[]
  /** The logo as a data URI (see `logo.ts`). Without one the header is text only. */
  logo?: string | null
}

/** The receipt's own header, as the desk's format has it. */
export const RECEIPT_HOSPITAL = {
  name: 'KKR Hospital',
  address: ['#18-1-34, Panchavati Complex,', '2nd Floor OPP KGH OP GATE.', 'MAHARANIPETA, VISAKHAPATNAM-530002'],
}

// ── Geometry (millimetres, A5 landscape = 210 × 148) ──────────────────────────
const BOX_X = 8
const BOX_Y = 8
const BOX_W = 194
const BOX_H = 132
const SPLIT_X = BOX_X + 90 // the header's vertical divider
const PAD = 4
const LINE = 5 // leading of the "Bill To" block
const THEAD_H = 8
const ROW_PAD = 1.3
const ROW_LINE = 4.4
const FOOTER_H = 27 // total, words, signature, created by

const COL = {
  no: BOX_X + 5,
  date: BOX_X + 17,
  mode: BOX_X + 43,
  type: BOX_X + 82,
  amount: BOX_X + 143, // right edge of the amount
  remarks: BOX_X + 152,
}
const REMARKS_W = BOX_X + BOX_W - PAD - COL.remarks

/** "8,000" — whole rupees as the desk writes them, paise only when there are any. */
export function receiptAmount(amount: number): string {
  const n = Number(amount) || 0
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/** "13.07.26", from a stored YYYY-MM-DD. */
export function receiptDate(date: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''))
  return match ? `${match[3]}.${match[2]}.${match[1].slice(2)}` : ''
}

export function receiptTotal(lines: PaymentReceiptLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
}

function drawTableHead(doc: jsPDF, top: number): number {
  doc.setLineWidth(0.3)
  doc.line(BOX_X, top, BOX_X + BOX_W, top)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const y = top + 5.4
  doc.text('*', COL.no, y)
  doc.text('Date', COL.date, y)
  doc.text('Payment Mode', COL.mode, y)
  doc.text('Transaction Type', COL.type, y)
  doc.text('Transaction Amount', COL.amount, y, { align: 'right' })
  doc.text('Remarks', COL.remarks, y)
  doc.line(BOX_X, top + THEAD_H, BOX_X + BOX_W, top + THEAD_H)
  return top + THEAD_H
}

function drawBox(doc: jsPDF): void {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.rect(BOX_X, BOX_Y, BOX_W, BOX_H)
}

/** The header: hospital on the left, "Bill To" on the right. Returns its bottom. */
function drawHeader(doc: jsPDF, data: PaymentReceiptData): number {
  const right = SPLIT_X + PAD
  const rightEdge = BOX_X + BOX_W - PAD
  const rightW = rightEdge - right

  // ── Right: who the receipt is for ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  let y = BOX_Y + 8
  doc.text('Bill To:', right, y)
  doc.text(`Receipt No: ${data.receipt_no}`, rightEdge, y + 1.5, { align: 'right' })
  y += LINE + 1

  const write = (text: string) => {
    for (const line of doc.splitTextToSize(text, rightW) as string[]) {
      doc.text(line, right, y)
      y += LINE
    }
  }

  const who = [data.patient_name, data.age_sex].filter(Boolean).join(' ')
  if (who) write(who)
  if (data.mobile) write(`Mobile no: ${data.mobile}`)
  if (data.address) write(data.address)
  if (data.ip_no) write(`Ip no: ${data.ip_no}`)

  if (data.doctors.length > 0) {
    const label = 'Consultant doctor: '
    doc.text(label, right, y)
    const indent = right + doc.getTextWidth(label)
    doc.setFont('helvetica', 'bold')
    for (const doctor of data.doctors) {
      for (const line of doc.splitTextToSize(doctor, rightEdge - indent) as string[]) {
        doc.text(line, indent, y)
        y += LINE
      }
    }
    doc.setFont('helvetica', 'normal')
  }
  if (data.department) write(`Department : ${data.department}`)

  // ── Left: the hospital ──
  const logoSize = 15
  const textX = data.logo ? BOX_X + PAD + logoSize + 3 : BOX_X + PAD + 2
  if (data.logo) {
    try {
      doc.addImage(data.logo, 'PNG', BOX_X + PAD, BOX_Y + 3.5, logoSize, logoSize)
    } catch {
      // A logo that cannot be drawn must not cost the desk its receipt.
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(RECEIPT_HOSPITAL.name, textX, BOX_Y + 12.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  RECEIPT_HOSPITAL.address.forEach((line, index) => doc.text(line, textX, BOX_Y + 18.5 + index * 4.6))

  const bottom = Math.max(y + 1, BOX_Y + 48)

  // The heading, underlined, centred in the left half above the table.
  const heading = data.heading || 'Cash Receipt'
  const headingX = (BOX_X + SPLIT_X) / 2
  const headingY = Math.max(BOX_Y + 39, bottom - 8)
  doc.setFontSize(11)
  doc.text(heading, headingX, headingY, { align: 'center' })
  const headingW = doc.getTextWidth(heading)
  doc.setLineWidth(0.25)
  doc.line(headingX - headingW / 2, headingY + 0.9, headingX + headingW / 2, headingY + 0.9)

  doc.setLineWidth(0.3)
  doc.line(SPLIT_X, BOX_Y, SPLIT_X, bottom)
  return bottom
}

function drawFooter(doc: jsPDF, data: PaymentReceiptData): void {
  const bottom = BOX_Y + BOX_H
  const total = receiptTotal(data.lines)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.text(`Total Amount : ${receiptAmount(total)}/-`, BOX_X + PAD, bottom - 21)

  doc.setFontSize(9.5)
  doc.setTextColor(70, 70, 70)
  const words = doc.splitTextToSize(`Rupees: ${rupeesInWords(total)}.`, 125) as string[]
  words.slice(0, 2).forEach((line, index) => doc.text(line, BOX_X + PAD, bottom - 16 + index * 4.2))
  doc.setTextColor(0, 0, 0)

  doc.setFont('helvetica', 'bold')
  doc.text('Authorized Signature', BOX_X + BOX_W - PAD - 4, bottom - 17, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (data.created_by_label) doc.text(`Created by: ${data.created_by_label}`, BOX_X + PAD - 1, bottom - 4.5)
}

export function renderPaymentReceipt(data: PaymentReceiptData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' })
  doc.setTextColor(0, 0, 0)

  drawBox(doc)
  let y = drawTableHead(doc, drawHeader(doc, data))
  // The total and the signature sit at the foot of the last page only. A page
  // that another follows uses its whole height for rows; the last row always
  // lands where the footer still fits beneath it.
  const footerTop = BOX_Y + BOX_H - FOOTER_H
  const pageBottom = BOX_Y + BOX_H - 3

  data.lines.forEach((line, index) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const remarks = (doc.splitTextToSize(line.remarks || '', REMARKS_W) as string[]).slice(0, 3)
    const height = Math.max(1, remarks.length) * ROW_LINE + ROW_PAD * 2

    const isLast = index === data.lines.length - 1
    if (y + height > (isLast ? footerTop : pageBottom)) {
      doc.addPage()
      drawBox(doc)
      y = drawTableHead(doc, BOX_Y)
    }

    const baseline = y + ROW_PAD + 3.4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.text(String(index + 1), COL.no, baseline)
    doc.text(receiptDate(line.line_date), COL.date, baseline)
    doc.text(fit(doc, line.payment_mode, COL.type - COL.mode - 2), COL.mode, baseline)
    doc.text(fit(doc, line.transaction_type, 34), COL.type, baseline)
    doc.text(receiptAmount(line.amount), COL.amount, baseline, { align: 'right' })
    remarks.forEach((text, i) => doc.text(text, COL.remarks, baseline + i * ROW_LINE))
    y += height
  })

  drawFooter(doc, data)

  return doc
}

/** One line of a column, cut short rather than run into the next. */
function fit(doc: jsPDF, text: string, width: number): string {
  const value = String(text || '')
  if (doc.getTextWidth(value) <= width) return value
  let cut = value
  while (cut.length > 1 && doc.getTextWidth(`${cut}..`) > width) cut = cut.slice(0, -1)
  return `${cut}..`
}

export function paymentReceiptFilename(data: PaymentReceiptData): string {
  const safe = (value: string) => value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
  return `Receipt_${safe(data.receipt_no) || 'no'}_${safe(data.patient_name) || 'patient'}.pdf`
}

export function generatePaymentReceiptPDF(data: PaymentReceiptData): void {
  renderPaymentReceipt(data).save(paymentReceiptFilename(data))
}

/** Sends the receipt straight to the browser's print dialog. */
export function printPaymentReceipt(data: PaymentReceiptData): void {
  autoPrint(renderPaymentReceipt(data))
}
