/**
 * One doctor's visits, and what was paid for them.
 *
 * Landscape, like the advance log: nine columns of patient, purpose and payment
 * detail do not fit portrait without clipping the names, and a name clipped to
 * "Rames…" is the thing that makes a printed report useless at the desk.
 *
 * Amounts read `Rs.1,250.00`. jsPDF's Helvetica is WinAnsi-encoded and has no
 * glyph for `₹`, which comes out as a black box — so `fmt` from ./base is used
 * everywhere and the screen keeps `inr`.
 */

import type { jsPDF } from 'jspdf'
import { C, M, fmt, mkDoc, hdr, boxRow, sec, thead, trow, ttotal, footers } from './base'
import type { Col, Cell, H } from './base'
import { parseStoredInstant } from '@/lib/consultations/ist'

export interface DoctorVisitRow {
  id: string
  consultation_date: string
  patient?: { patient_id?: string | null; name?: string | null } | null
  purpose?: { name?: string | null } | null
  fee: number | null
  billed: boolean
  paid: boolean
  payment?: {
    settled_on?: string | null
    settled_by?: string | null
    payment_method?: string | null
    transaction_reference?: string | null
  } | null
}

export interface DoctorVisitPurpose {
  purpose: string
  visits: number
  paid: number
  unpaid: number
}

export interface DoctorVisitsData {
  doctor: { name: string; specialist?: string | null; department?: string | null }
  rows: DoctorVisitRow[]
  by_purpose: DoctorVisitPurpose[]
  summary: {
    visits: number
    fees_paid: number
    fees_pending: number
    unbilled_visits: number
    from?: string | null
    to?: string | null
  }
  /** What was filtered, printed under the title so the page explains itself. */
  filters?: string[]
}

// ── Geometry. Landscape A4: pw 297, cw 269, right edge 283. ──────────────────
const COL = {
  date:     M,
  patient:  M + 34,
  name:     M + 58,
  purpose:  M + 106,
  paidOn:   M + 144,
  paidBy:   M + 176,
  mode:     M + 206,
  ref:      M + 230,
  fee:      M + 269,
}

/** IST, day and month only — the time belongs on screen, not in a column. */
function visitDay(value: string): string {
  const date = parseStoredInstant(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(date)
}

function payDay(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(date)
}

/** Truncate to fit a column rather than letting text run under the next one. */
function clip(text: string | null | undefined, max: number): string {
  const value = (text ?? '').trim()
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * By purpose, first: "how many consultations, how many rounds, and what is
 * still owed on each" is what the page gets opened for.
 */
function purposeSection(h: H, data: DoctorVisitsData): void {
  if (data.by_purpose.length === 0) return

  sec(h, 'BY VISIT TYPE', C.teal)

  const cols: Col[] = [
    { label: 'Visit type',   x: COL.date },
    { label: 'Visits',       x: COL.purpose, align: 'center' },
    { label: 'Paid',         x: COL.paidBy,  align: 'right' },
    { label: 'Still to pay', x: COL.fee,     align: 'right' },
  ]

  thead(h, cols)

  data.by_purpose.forEach((row, i) => {
    trow(h, [
      { text: clip(row.purpose, 40),   x: COL.date },
      { text: String(row.visits),      x: COL.purpose, align: 'center' },
      { text: fmt(row.paid),           x: COL.paidBy,  align: 'right' },
      { text: fmt(row.unpaid),         x: COL.fee,     align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: `TOTAL — ${data.by_purpose.length} visit types`, x: COL.date },
    { text: String(data.summary.visits),                     x: COL.purpose, align: 'center' },
    { text: fmt(data.summary.fees_paid),                     x: COL.paidBy,  align: 'right' },
    { text: fmt(data.summary.fees_pending),                  x: COL.fee,     align: 'right' },
  ])
}

function detailSection(h: H, data: DoctorVisitsData): void {
  sec(h, 'EVERY VISIT', C.blue)

  if (data.rows.length === 0) {
    h.normal(8)
    h.doc.setTextColor(...C.muted)
    h.doc.text('No visits in this period.', M, h.y + 5)
    h.doc.setTextColor(...C.dark)
    h.y += 12
    return
  }

  const cols: Col[] = [
    { label: 'Date',     x: COL.date },
    { label: 'Patient',  x: COL.patient },
    { label: 'Name',     x: COL.name },
    { label: 'Purpose',  x: COL.purpose },
    { label: 'Paid on',  x: COL.paidOn },
    { label: 'Paid by',  x: COL.paidBy },
    { label: 'Mode',     x: COL.mode },
    { label: 'Ref',      x: COL.ref },
    { label: 'Fee',      x: COL.fee, align: 'right' },
  ]

  thead(h, cols)

  let page = h.doc.getNumberOfPages()

  data.rows.forEach((row, i) => {
    const before = h.doc.getNumberOfPages()
    h.checkPage()

    // Repeat the headings after a page break: page two as an unlabelled list is
    // the failure the other reports already had to fix.
    if (h.doc.getNumberOfPages() > before || h.doc.getNumberOfPages() > page) {
      thead(h, cols)
      page = h.doc.getNumberOfPages()
    }

    // An unbilled visit has no fee yet, and that is worth saying rather than
    // printing a confident Rs.0.00.
    const fee = !row.billed ? 'not billed' : row.fee === null ? '—' : fmt(row.fee)

    trow(h, [
      { text: visitDay(row.consultation_date),              x: COL.date },
      { text: clip(row.patient?.patient_id, 12),            x: COL.patient },
      { text: clip(row.patient?.name, 26),                  x: COL.name },
      { text: clip(row.purpose?.name, 20),                  x: COL.purpose },
      { text: row.paid ? payDay(row.payment?.settled_on) : 'unpaid', x: COL.paidOn },
      { text: clip(row.payment?.settled_by, 16),            x: COL.paidBy },
      { text: clip(row.payment?.payment_method, 12),        x: COL.mode },
      { text: clip(row.payment?.transaction_reference, 18), x: COL.ref },
      { text: fee,                                          x: COL.fee, align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: 'PAID IN THIS PERIOD',       x: COL.date },
    { text: fmt(data.summary.fees_paid), x: COL.fee, align: 'right' },
  ])
}

export function renderDoctorVisits(data: DoctorVisitsData): jsPDF {
  const h = mkDoc('landscape')

  const period =
    data.summary.from || data.summary.to
      ? `${data.summary.from || 'the beginning'} to ${data.summary.to || 'today'}`
      : 'All visits'

  const who = [data.doctor.specialist, data.doctor.department].filter(Boolean).join(' · ')
  hdr(h, `Doctor Visits — ${data.doctor.name}`, [period, who, ...(data.filters ?? [])].filter(Boolean).join('  ·  '))

  boxRow(h, [
    { label: 'Visits',        value: String(data.summary.visits),          accent: C.navy },
    { label: 'Fees Paid',     value: fmt(data.summary.fees_paid),          accent: C.green },
    { label: 'Still To Pay',  value: fmt(data.summary.fees_pending),       accent: C.orange },
    { label: 'Not Billed',    value: String(data.summary.unbilled_visits), accent: C.teal },
  ])

  purposeSection(h, data)
  detailSection(h, data)

  // Last, so it walks every page the sections ended up creating.
  footers(h)

  return h.doc
}

export function doctorVisitsFilename(doctorName: string, from?: string | null, to?: string | null): string {
  const who = doctorName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Doctor'
  const period = [from, to].filter(Boolean).join('_to_')
  return `Doctor_Visits_${who}${period ? `_${period}` : ''}.pdf`
}

export function generateDoctorVisitsPDF(data: DoctorVisitsData): void {
  renderDoctorVisits(data).save(
    doctorVisitsFilename(data.doctor.name, data.summary.from, data.summary.to),
  )
}
