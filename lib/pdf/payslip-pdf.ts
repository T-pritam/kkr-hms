/**
 * A payslip.
 *
 * There was no per-employee document of any kind. The only employee content in
 * any PDF was a payroll table inside the finance report, which shows a summed
 * `total_advance` and nothing about which advances made it up — so an employee
 * being paid had nothing to take away and no way to check the deduction.
 *
 * Portrait, one employee, one month. Built on lib/pdf/base.ts, so it matches
 * the discharge summary a patient goes home with.
 *
 * `Rs.` rather than `₹`: jsPDF's Helvetica is WinAnsi and has no rupee glyph.
 */

import jsPDF from 'jspdf'
import { C, M, fmt, fmtDate, mkDoc, hdr, sec, thead, trow, ttotal, footers } from './base'
import type { Cell, H } from './base'
import { monthLabel } from './advance-log-pdf'

export interface PayslipData {
  month_year: string
  employee: {
    employee_code?: string | null
    name?: string | null
    designation?: string | null
    join_date?: string | null
    phone?: string | null
    bank_account_no?: string | null
    bank_ifsc?: string | null
    status?: string | null
  }
  salary_record: {
    base_salary?: number | string | null
    total_working_days?: number | null
    days_present?: number | null
    ot_days?: number | null
    calculated_salary?: number | string | null
    total_advance?: number | string | null
    final_salary?: number | string | null
    status?: string | null
    settled_on?: string | null
    settled_by_user?: { username?: string | null } | null
  } | null
  advances: {
    id: number | string
    amount: number | string
    date_given: string | null
    remarks: string | null
    given_by: string | null
    created_by_user?: { username?: string | null } | null
  }[]
}

const num = (v: unknown) => Number.parseFloat(String(v ?? 0)) || 0

// Portrait A4: pw 210, cw 182, right edge 196.
const ADV = {
  date:    M,
  givenBy: M + 34,
  by:      M + 84,
  remarks: M + 116,
  amount:  M + 182,
}

const clip = (text: string | null | undefined, max: number): string => {
  const value = (text ?? '').trim()
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** Two-column label/value block, the same shape as the discharge summary cover. */
function detailsBlock(h: H, rows: [string, string][]): void {
  const colW = h.cw / 2
  const lineH = 6

  rows.forEach((row, i) => {
    const col = i % 2
    const line = Math.floor(i / 2)
    const x = M + col * colW
    const y = h.y + line * lineH

    h.normal(7.5)
    h.doc.setTextColor(...C.muted)
    h.doc.text(row[0], x, y)

    h.bold(8.5)
    h.doc.setTextColor(...C.dark)
    h.doc.text(row[1], x + 38, y)
  })

  h.normal(9)
  h.doc.setTextColor(...C.dark)
  h.y += Math.ceil(rows.length / 2) * lineH + 6
}

/** A right-aligned figure with its label, for the earnings breakdown. */
function figure(h: H, label: string, value: string, opts: { bold?: boolean; accent?: [number, number, number] } = {}): void {
  h.checkPage(8)

  if (opts.bold) h.bold(10)
  else h.normal(9)

  h.doc.setTextColor(...(opts.accent ?? C.dark))
  h.doc.text(label, M + 2, h.y + 5)
  h.doc.text(value, h.re - 2, h.y + 5, { align: 'right' })
  h.doc.setTextColor(...C.dark)

  h.y += 7.5
}

function rule(h: H): void {
  h.doc.setDrawColor(...C.border)
  h.doc.setLineWidth(0.3)
  h.doc.line(M, h.y, h.re, h.y)
  h.y += 3
}

function advanceSection(h: H, data: PayslipData): void {
  sec(h, 'ADVANCES DRAWN', C.orange)

  if (data.advances.length === 0) {
    h.normal(8)
    h.doc.setTextColor(...C.muted)
    h.doc.text('No advances were drawn against this month.', M, h.y + 5)
    h.doc.setTextColor(...C.dark)
    h.y += 12
    return
  }

  const cols = [
    { label: 'Date',        x: ADV.date },
    { label: 'Given By',    x: ADV.givenBy },
    { label: 'Recorded By', x: ADV.by },
    { label: 'Remarks',     x: ADV.remarks },
    { label: 'Amount',      x: ADV.amount, align: 'right' as const },
  ]

  thead(h, cols)

  let page = h.doc.getNumberOfPages()
  let total = 0

  data.advances.forEach((adv, i) => {
    const before = h.doc.getNumberOfPages()
    h.checkPage()
    if (h.doc.getNumberOfPages() > before || h.doc.getNumberOfPages() > page) {
      thead(h, cols)
      page = h.doc.getNumberOfPages()
    }

    total += num(adv.amount)

    const cells: Cell[] = [
      { text: fmtDate(adv.date_given),                   x: ADV.date },
      { text: clip(adv.given_by, 22),                    x: ADV.givenBy },
      { text: clip(adv.created_by_user?.username, 14),   x: ADV.by },
      { text: clip(adv.remarks, 28),                     x: ADV.remarks },
      { text: fmt(num(adv.amount)),                      x: ADV.amount, align: 'right' },
    ]
    trow(h, cells, i)
  })

  ttotal(h, [
    { text: 'TOTAL ADVANCES', x: ADV.date },
    { text: fmt(total),       x: ADV.amount, align: 'right' },
  ])
}

function signOff(h: H, data: PayslipData): void {
  h.checkPage(34)
  h.y += 6

  const record = data.salary_record
  const settled = record?.status === 'settled'

  h.normal(7.5)
  h.doc.setTextColor(...C.muted)
  h.doc.text(
    settled
      ? `Settled on ${fmtDate(record?.settled_on)}` +
        (record?.settled_by_user?.username ? ` by ${record.settled_by_user.username}` : '')
      : 'Not yet settled — this is a statement, not a receipt.',
    M,
    h.y,
  )
  h.y += 16

  const half = h.cw / 2 - 10
  h.doc.setDrawColor(...C.border)
  h.doc.setLineWidth(0.4)
  h.doc.line(M, h.y, M + half, h.y)
  h.doc.line(h.re - half, h.y, h.re, h.y)

  h.y += 4
  h.normal(7)
  h.doc.setTextColor(...C.muted)
  h.doc.text('Employee signature', M, h.y)
  h.doc.text('Authorised signatory', h.re, h.y, { align: 'right' })
  h.doc.setTextColor(...C.dark)
}

export function renderPayslip(data: PayslipData): jsPDF {
  const h = mkDoc('portrait')
  const emp = data.employee
  const record = data.salary_record

  hdr(h, 'Salary Slip', monthLabel(data.month_year))

  sec(h, 'EMPLOYEE', C.navy)
  detailsBlock(h, [
    ['Name',        emp.name || '—'],
    ['Code',        emp.employee_code || '—'],
    ['Designation', emp.designation || '—'],
    ['Joined',      fmtDate(emp.join_date)],
    ['Phone',       emp.phone || '—'],
    ['Bank A/C',    emp.bank_account_no ? `${emp.bank_account_no}${emp.bank_ifsc ? ` · ${emp.bank_ifsc}` : ''}` : '—'],
  ])

  sec(h, 'EARNINGS', C.green)

  if (!record) {
    h.normal(8)
    h.doc.setTextColor(...C.muted)
    h.doc.text(
      'No salary has been calculated for this month yet. Advances drawn so far are listed below.',
      M,
      h.y + 5,
    )
    h.doc.setTextColor(...C.dark)
    h.y += 12
  } else {
    const totalAdvance = num(record.total_advance)

    figure(h, 'Base salary', fmt(num(record.base_salary)))
    figure(
      h,
      `Days present (of ${record.total_working_days ?? 27})`,
      String(record.days_present ?? '—'),
    )
    figure(h, 'Overtime days', String(record.ot_days ?? 0))
    rule(h)
    figure(h, 'Calculated salary', fmt(num(record.calculated_salary)))
    figure(h, 'Less: advances drawn', `- ${fmt(totalAdvance)}`, { accent: C.orange })
    rule(h)
    figure(
      h,
      record.status === 'settled' ? 'Net paid' : 'Net payable',
      fmt(num(record.final_salary)),
      { bold: true, accent: C.navy },
    )
    h.y += 4
  }

  advanceSection(h, data)
  signOff(h, data)

  footers(h)

  return h.doc
}

export function payslipFilename(data: PayslipData): string {
  const name = (data.employee.name || 'employee').replace(/[^a-z0-9]/gi, '_')
  return `Payslip_${name}_${data.month_year}.pdf`
}

export function generatePayslipPDF(data: PayslipData): void {
  renderPayslip(data).save(payslipFilename(data))
}

/** Fetches and renders in one call — what the download buttons use. */
export async function downloadPayslip(employeeId: string, monthYear: string): Promise<void> {
  const res = await fetch(
    `/api/employees/${employeeId}/payslip?month_year=${monthYear}`,
    { credentials: 'include' },
  )
  const body = await res.json().catch(() => ({}))

  if (!res.ok || !body?.success) {
    throw new Error(body?.error || 'Failed to build the payslip')
  }

  generatePayslipPDF(body.data as PayslipData)
}
