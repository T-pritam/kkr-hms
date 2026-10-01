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

export interface PaymentReceiptDoctor {
  name: string
  /** Printed after the name, in brackets, when there is one. */
  designation?: string
}

export interface PaymentReceiptData {
  receipt_no: string
  heading: string
  patient_name: string
  age_sex: string
  mobile: string
  address: string
  ip_no: string
  doctors: PaymentReceiptDoctor[]
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
const ROW_PAD = 1.5
const ROW_LINE = 4.4
const FOOTER_H = 27 // total, words, signature, created by

const COL = {
  no: BOX_X + 5,
  date: BOX_X + 17,
  mode: BOX_X + 43,
  type: BOX_X + 79,
  amount: BOX_X + 146, // right edge of the amount
  remarks: BOX_X + 155,
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
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.2)
  const y = top + 5.4
  doc.text('*', COL.no, y)
  doc.text('Date', COL.date, y)
  doc.text('Payment Mode', COL.mode, y)
  doc.text('Transaction Type', COL.type, y)
  doc.text('Transaction Amount', COL.amount, y, { align: 'right' })
  doc.text('Remarks', COL.remarks, y)
  doc.line(BOX_X, top + THEAD_H, BOX_X + BOX_W, top + THEAD_H)
  doc.setFont('helvetica', 'normal')
  return top + THEAD_H + 1
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
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', right, y)
  // "Receipt No:" plain, the number itself bold — it is what the desk looks up.
  const numberW = doc.getTextWidth(data.receipt_no)
  doc.text(data.receipt_no, rightEdge, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text('Receipt No: ', rightEdge - numberW, y, { align: 'right' })
  y += LINE + 1.5

  const write = (text: string) => {
    for (const line of doc.splitTextToSize(text, rightW) as string[]) {
      doc.text(line, right, y)
      y += LINE
    }
  }

  // The name stands out; age and sex follow it on the same line when they fit.
  if (data.patient_name) {
    doc.setFont('helvetica', 'bold')
    const nameLines = doc.splitTextToSize(data.patient_name, rightW) as string[]
    nameLines.forEach((line, index) => {
      doc.text(line, right, y)
      if (index < nameLines.length - 1) y += LINE
    })
    const lastW = doc.getTextWidth(nameLines[nameLines.length - 1])
    doc.setFont('helvetica', 'normal')
    if (data.age_sex) {
      if (lastW + 1.5 + doc.getTextWidth(data.age_sex) <= rightW) {
        doc.text(data.age_sex, right + lastW + 1.5, y)
      } else {
        y += LINE
        doc.text(data.age_sex, right, y)
      }
    }
    y += LINE
  } else if (data.age_sex) {
    write(data.age_sex)
  }
  if (data.mobile) write(`Mobile no: ${data.mobile}`)
  if (data.address) write(data.address)
  if (data.ip_no) write(`Ip no: ${data.ip_no}`)

  if (data.doctors.length > 0) {
    const label = 'Consultant doctor: '
    doc.text(label, right, y)
    const indent = right + doc.getTextWidth(label)
    const width = rightEdge - indent
    for (const doctor of data.doctors) {
      // The name in bold; the designation after it in brackets, on the same
      // line when it fits and on the next when it does not.
      doc.setFont('helvetica', 'bold')
      const nameLines = doc.splitTextToSize(doctor.name, width) as string[]
      nameLines.forEach((line, index) => {
        doc.text(line, indent, y)
        if (index < nameLines.length - 1) y += LINE
      })
      const lastW = doc.getTextWidth(nameLines[nameLines.length - 1])
      doc.setFont('helvetica', 'normal')

      const designation = doctor.designation ? `(${doctor.designation})` : ''
      if (designation) {
        if (lastW + 1.5 + doc.getTextWidth(designation) <= width) {
          doc.text(designation, indent + lastW + 1.5, y)
        } else {
          for (const line of doc.splitTextToSize(designation, width) as string[]) {
            y += LINE
            doc.text(line, indent, y)
          }
        }
      }
      y += LINE
    }
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
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.text(heading, headingX, headingY, { align: 'center' })
  const headingW = doc.getTextWidth(heading)
  doc.setLineWidth(0.25)
  doc.line(headingX - headingW / 2, headingY + 0.9, headingX + headingW / 2, headingY + 0.9)
  doc.setFont('helvetica', 'normal')

  doc.setLineWidth(0.3)
  doc.line(SPLIT_X, BOX_Y, SPLIT_X, bottom)
  return bottom
}

function drawFooter(doc: jsPDF, data: PaymentReceiptData): void {
  const bottom = BOX_Y + BOX_H
  const total = receiptTotal(data.lines)
  const rightEdge = BOX_X + BOX_W - PAD

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Total Amount : ${receiptAmount(total)}/-`, BOX_X + PAD, bottom - 21)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(70, 70, 70)
  const words = doc.splitTextToSize(`Rupees: ${rupeesInWords(total)}.`, 120) as string[]
  words.slice(0, 2).forEach((line, index) => doc.text(line, BOX_X + PAD, bottom - 16 + index * 4.2))
  doc.setTextColor(0, 0, 0)

  // A line to sign on, with the caption under it.
  const signW = 46
  doc.setLineWidth(0.25)
  doc.line(rightEdge - signW, bottom - 13.5, rightEdge, bottom - 13.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Authorized Signature', rightEdge - signW / 2, bottom - 9, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  if (data.created_by_label) doc.text(`Created by: ${data.created_by_label}`, BOX_X + PAD, bottom - 4.5)
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

    // A hairline under each row keeps several payments apart; one row needs none.
    if (data.lines.length > 1) {
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.1)
      doc.line(BOX_X + PAD, y, BOX_X + BOX_W - PAD, y)
      doc.setDrawColor(0, 0, 0)
    }
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

/** Opens the receipt in a new tab to look at, without saving or printing anything. */
export function previewPaymentReceipt(data: PaymentReceiptData): void {
  window.open(renderPaymentReceipt(data).output('bloburl'), '_blank')
}

/** Sends the receipt straight to the browser's print dialog. */
export function printPaymentReceipt(data: PaymentReceiptData): void {
  autoPrint(renderPaymentReceipt(data))
}
