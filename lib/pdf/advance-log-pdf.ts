/**
 * The month-wise salary advance log, as a document.
 *
 * Built on lib/pdf/base.ts so it matches the lab report, the discharge summary
 * and the finance report. Landscape, because the row carries a date, a name, a
 * designation, an amount, who gave it, who recorded it and a remark.
 *
 * As everywhere in this toolkit: `Rs.` rather than `₹`, and no ✓ / ⚠ / ↑ / ↓.
 * jsPDF's built-in Helvetica is WinAnsi-encoded and renders them as substitute
 * characters.
 */

import jsPDF from 'jspdf'
import { C, M, fmt, fmtDate, mkDoc, hdr, boxRow, sec, thead, trow, ttotal, footers } from './base'
import type { Col, Cell, H } from './base'

export interface AdvanceLogRow {
  id: number | string
  amount: number | string
  date_given: string | null
  remarks: string | null
  given_by: string | null
  employee?: {
    employee_code?: string | null
    name?: string | null
    designation?: string | null
    base_salary?: number | string | null
  } | null
  created_by_user?: { username?: string | null } | null
}

export interface AdvanceLogEmployee {
  employee_id: string
  employee_code: string | null
  name: string
  designation: string | null
  base_salary: number
  total: number
  count: number
}

export interface AdvanceLogData {
  month_year: string
  rows: AdvanceLogRow[]
  by_employee: AdvanceLogEmployee[]
  summary: {
    total_amount: number
    advance_count: number
    employee_count: number
    largest_advance: number
    previous_month: string
    previous_total: number
  }
  /** Any filters that were active, printed under the title so the page is self-explaining. */
  filters?: string[]
}

// ── Geometry. Landscape A4: pw 297, cw 269, right edge 283. ──────────────────
const COL = {
  date:       M,
  code:       M + 22,
  name:       M + 48,
  role:       M + 100,
  givenBy:    M + 140,
  recordedBy: M + 178,
  remarks:    M + 210,
  amount:     M + 269,
}

const num = (v: unknown) => Number.parseFloat(String(v ?? 0)) || 0

/** `2026-08` → `August 2026`. */
export function monthLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number)
  if (!y || !m) return monthYear
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Truncate to fit a column rather than letting text run under the next one. */
function clip(text: string | null | undefined, max: number): string {
  const value = (text ?? '').trim()
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function detailColumns(): Col[] {
  return [
    { label: 'Date',        x: COL.date },
    { label: 'Code',        x: COL.code },
    { label: 'Employee',    x: COL.name },
    { label: 'Designation', x: COL.role },
    { label: 'Given By',    x: COL.givenBy },
    { label: 'Recorded By', x: COL.recordedBy },
    { label: 'Remarks',     x: COL.remarks },
    { label: 'Amount',      x: COL.amount, align: 'right' },
  ]
}

/**
 * The per-employee summary.
 *
 * Deliberately first: "who took how much this month" is the question the log
 * gets opened for, and it should not need scrolling past forty detail rows.
 */
function employeeSection(h: H, data: AdvanceLogData): void {
  if (data.by_employee.length === 0) return

  sec(h, 'BY EMPLOYEE', C.teal)

  const cols: Col[] = [
    { label: 'Code',        x: COL.date },
    { label: 'Employee',    x: COL.code },
    { label: 'Designation', x: COL.role },
    { label: 'Advances',    x: COL.givenBy, align: 'center' },
    { label: 'Base Salary', x: COL.remarks, align: 'right' },
    { label: 'Total Drawn', x: COL.amount,  align: 'right' },
  ]

  thead(h, cols)

  data.by_employee.forEach((emp, i) => {
    // Share of the month's salary already drawn — the number that turns a list
    // into something you can act on.
    const share = emp.base_salary > 0
      ? ` (${Math.round((emp.total / emp.base_salary) * 100)}%)`
      : ''

    const cells: Cell[] = [
      { text: clip(emp.employee_code, 14),  x: COL.date },
      { text: clip(emp.name, 30),           x: COL.code },
      { text: clip(emp.designation, 22),    x: COL.role },
      { text: String(emp.count),            x: COL.givenBy, align: 'center' },
      { text: fmt(emp.base_salary),         x: COL.remarks, align: 'right' },
      { text: `${fmt(emp.total)}${share}`,  x: COL.amount,  align: 'right' },
    ]
    trow(h, cells, i)
  })

  ttotal(h, [
    { text: `TOTAL — ${data.by_employee.length} employees`, x: COL.date },
    { text: String(data.summary.advance_count),             x: COL.givenBy, align: 'center' },
    { text: fmt(data.summary.total_amount),                 x: COL.amount,  align: 'right' },
  ])
}

function detailSection(h: H, data: AdvanceLogData): void {
  sec(h, 'EVERY ADVANCE', C.blue)

  if (data.rows.length === 0) {
    h.normal(8)
    h.doc.setTextColor(...C.muted)
    h.doc.text('No advances were paid in this period.', M, h.y + 5)
    h.doc.setTextColor(...C.dark)
    h.y += 12
    return
  }

  const cols = detailColumns()
  thead(h, cols)

  let page = h.doc.getNumberOfPages()

  data.rows.forEach((row, i) => {
    const before = h.doc.getNumberOfPages()
    h.checkPage()

    // Repeat the column headings after a page break — page two arriving as an
    // unlabelled list is the failure the lab report already had to fix.
    if (h.doc.getNumberOfPages() > before || h.doc.getNumberOfPages() > page) {
      thead(h, cols)
      page = h.doc.getNumberOfPages()
    }

    const emp = row.employee ?? {}

    trow(h, [
      { text: fmtDate(row.date_given),                       x: COL.date },
      { text: clip(emp.employee_code, 14),                   x: COL.code },
      { text: clip(emp.name, 28),                            x: COL.name },
      { text: clip(emp.designation, 20),                     x: COL.role },
      { text: clip(row.given_by, 20),                        x: COL.givenBy },
      { text: clip(row.created_by_user?.username, 16),       x: COL.recordedBy },
      { text: clip(row.remarks, 28),                         x: COL.remarks },
      { text: fmt(num(row.amount)),                          x: COL.amount, align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: 'GRAND TOTAL',                   x: COL.date },
    { text: fmt(data.summary.total_amount),  x: COL.amount, align: 'right' },
  ])
}

export function renderAdvanceLog(data: AdvanceLogData): jsPDF {
  const h = mkDoc('landscape')

  const subtitle = [monthLabel(data.month_year), ...(data.filters ?? [])].join('  ·  ')
  hdr(h, 'Salary Advance Log', subtitle)

  const change = data.summary.previous_total > 0
    ? `${data.summary.total_amount >= data.summary.previous_total ? '+' : '-'}${Math.abs(
        Math.round(
          ((data.summary.total_amount - data.summary.previous_total) / data.summary.previous_total) * 100
        )
      )}% vs ${monthLabel(data.summary.previous_month)}`
    : `Nothing advanced in ${monthLabel(data.summary.previous_month)}`

  boxRow(h, [
    { label: 'Total Advanced', value: fmt(data.summary.total_amount),      accent: C.navy,  sub: change },
    { label: 'Advances',       value: String(data.summary.advance_count),  accent: C.blue },
    { label: 'Employees',      value: String(data.summary.employee_count), accent: C.teal },
    { label: 'Largest Single', value: fmt(data.summary.largest_advance),   accent: C.orange },
  ])

  employeeSection(h, data)
  detailSection(h, data)

  // Last, so it walks every page the sections ended up creating.
  footers(h)

  return h.doc
}

export function advanceLogFilename(monthYear: string): string {
  return `Advance_Log_${monthYear.replace(/[^0-9-]/g, '')}.pdf`
}

export function generateAdvanceLogPDF(data: AdvanceLogData): void {
  renderAdvanceLog(data).save(advanceLogFilename(data.month_year))
}
