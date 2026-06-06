import { apiFetch } from '@/lib/api'
import jsPDF from 'jspdf'

const HOSPITAL_NAME = 'KKR Hospital & Medical Services'
const M = 14            // page margin
const GAP = 4           // gap between metric boxes
const HDR_H = 30        // header banner height
const BOX_H = 26        // metric box height
const ROW_H = 7         // table data row height
const TH_H  = 9         // table header row height
const TTL_H = 9         // total row height
const SEC_H = 10        // section title bar height
const FTR_H = 16        // footer reserved height

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  navy:    [26,  54,  93]  as [number, number, number],
  blue:    [59,  130, 246] as [number, number, number],
  green:   [22,  163, 74]  as [number, number, number],
  orange:  [234, 88,  12]  as [number, number, number],
  red:     [220, 38,  38]  as [number, number, number],
  purple:  [124, 58,  237] as [number, number, number],
  teal:    [20,  150, 140] as [number, number, number],
  muted:   [107, 114, 128] as [number, number, number],
  tblHead: [30,  58,  138] as [number, number, number],
  tblAlt:  [241, 245, 249] as [number, number, number],
  border:  [226, 232, 240] as [number, number, number],
  dark:    [17,  24,  39]  as [number, number, number],
  white:   [255, 255, 255] as [number, number, number],
  hdrSub:  [186, 211, 245] as [number, number, number],
  secBg:   [235, 243, 255] as [number, number, number],
}

// ── Utility formatters ─────────────────────────────────────────────────────────
function fmt(amount: number): string {
  return `Rs.${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN')
}
function getMonthLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number)
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}
function pct(val: number, total: number): string {
  if (!total) return '0.0%'
  return `${((val / total) * 100).toFixed(1)}%`
}

// ── PDF helpers interface ──────────────────────────────────────────────────────
interface H {
  doc: jsPDF
  y: number
  pw: number   // page width
  ph: number   // page height
  cw: number   // content width  (pw - 2*M)
  bold:      (size: number) => void
  normal:    (size: number) => void
  checkPage: (needed?: number) => void
}

function mkDoc(): H {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pw = doc.internal.pageSize.getWidth()    // 297
  const ph = doc.internal.pageSize.getHeight()   // 210
  const cw = pw - M * 2                          // 269
  let y = M

  const bold   = (s: number) => { doc.setFont('helvetica', 'bold');   doc.setFontSize(s) }
  const normal = (s: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(s) }
  const checkPage = (needed = ROW_H + 4) => {
    if (y + needed > ph - FTR_H) { doc.addPage(); y = M }
  }

  return { doc, get y() { return y }, set y(v) { y = v }, pw, ph, cw, bold, normal, checkPage }
}

// ── Header banner ─────────────────────────────────────────────────────────────
// Returns y after the banner
function hdr(h: H, title: string, sub?: string): void {
  // Navy background
  h.doc.setFillColor(...C.navy)
  h.doc.rect(0, 0, h.pw, HDR_H, 'F')
  // Blue accent strip at bottom of banner
  h.doc.setFillColor(...C.blue)
  h.doc.rect(0, HDR_H - 3, h.pw, 3, 'F')
  // Hospital name
  h.bold(13)
  h.doc.setTextColor(...C.white)
  h.doc.text(HOSPITAL_NAME, h.pw / 2, 11, { align: 'center' })
  // Report title
  h.normal(9)
  h.doc.setTextColor(...C.hdrSub)
  h.doc.text(title, h.pw / 2, 19, { align: 'center' })
  // Subtitle / month
  if (sub) {
    h.normal(7.5)
    h.doc.setTextColor(200, 220, 245)
    h.doc.text(sub, h.pw / 2, 25, { align: 'center' })
  }
  h.doc.setTextColor(...C.dark)
  h.y = HDR_H + 8
}

// ── Metric box: KPI card with colored top accent, centered text ───────────────
function box(
  h: H,
  x: number, y: number, w: number,
  label: string, value: string,
  accent: [number, number, number] = C.blue,
  sub?: string,
) {
  const bh = sub ? BOX_H + 5 : BOX_H
  // Card fill + border
  h.doc.setFillColor(248, 250, 253)
  h.doc.setDrawColor(...C.border)
  h.doc.setLineWidth(0.35)
  h.doc.rect(x, y, w, bh, 'FD')
  // Colored accent bar
  h.doc.setFillColor(...accent)
  h.doc.rect(x, y, w, 4, 'F')
  // Label
  h.normal(7)
  h.doc.setTextColor(...C.muted)
  h.doc.text(label, x + w / 2, y + 12, { align: 'center' })
  // Value
  h.bold(11)
  h.doc.setTextColor(...C.navy)
  h.doc.text(value, x + w / 2, y + 21, { align: 'center' })
  // Sub-label
  if (sub) {
    h.normal(6.5)
    h.doc.setTextColor(...C.muted)
    h.doc.text(sub, x + w / 2, y + 27, { align: 'center' })
  }
  h.doc.setTextColor(...C.dark)
}

// Layout N metric boxes across content width, return row height (BOX_H + gap)
function boxRow(h: H, items: { label: string; value: string; accent?: [number,number,number]; sub?: string }[]): void {
  const n = items.length
  const w = (h.cw - GAP * (n - 1)) / n
  items.forEach((it, i) => {
    box(h, M + i * (w + GAP), h.y, w, it.label, it.value, it.accent || C.blue, it.sub)
  })
  h.y += BOX_H + 8
}

// ── Section title bar ──────────────────────────────────────────────────────────
function sec(h: H, title: string, color: [number,number,number] = C.blue): void {
  h.checkPage(SEC_H + TH_H + ROW_H * 3)
  // Left accent bar
  h.doc.setFillColor(...color)
  h.doc.rect(M, h.y, 4, SEC_H, 'F')
  // Light bg
  h.doc.setFillColor(...C.secBg)
  h.doc.rect(M + 4, h.y, h.cw - 4, SEC_H, 'F')
  h.bold(9.5)
  h.doc.setTextColor(...C.navy)
  h.doc.text(title, M + 9, h.y + 6.8)
  h.doc.setTextColor(...C.dark)
  h.y += SEC_H + 2
}

// ── Table header ───────────────────────────────────────────────────────────────
type Col = { label: string; x: number; align?: 'left' | 'right' | 'center' }

function thead(h: H, cols: Col[]): void {
  h.doc.setFillColor(...C.tblHead)
  h.doc.rect(M, h.y, h.cw, TH_H, 'F')
  h.bold(7.5)
  h.doc.setTextColor(...C.white)
  cols.forEach(c => h.doc.text(c.label, c.x, h.y + 6.5, { align: c.align || 'left' }))
  h.doc.setTextColor(...C.dark)
  h.y += TH_H
}

// ── Table data row ─────────────────────────────────────────────────────────────
type Cell = { text: string; x: number; align?: 'left' | 'right' | 'center' }

function trow(h: H, cells: Cell[], idx: number): void {
  h.checkPage(ROW_H + 2)
  if (idx % 2 === 1) {
    h.doc.setFillColor(...C.tblAlt)
    h.doc.rect(M, h.y, h.cw, ROW_H, 'F')
  } else {
    h.doc.setFillColor(...C.white)
    h.doc.rect(M, h.y, h.cw, ROW_H, 'F')
  }
  // Bottom separator
  h.doc.setDrawColor(...C.border)
  h.doc.setLineWidth(0.2)
  h.doc.line(M, h.y + ROW_H, M + h.cw, h.y + ROW_H)
  h.normal(7.5)
  h.doc.setTextColor(...C.dark)
  cells.forEach(c => h.doc.text(c.text, c.x, h.y + 5, { align: c.align || 'left' }))
  h.y += ROW_H
}

// ── Total row ──────────────────────────────────────────────────────────────────
function ttotal(h: H, cells: Cell[]): void {
  h.doc.setFillColor(...C.navy)
  h.doc.rect(M, h.y, h.cw, TTL_H, 'F')
  h.bold(8.5)
  h.doc.setTextColor(...C.white)
  cells.forEach(c => h.doc.text(c.text, c.x, h.y + 6.5, { align: c.align || 'left' }))
  h.doc.setTextColor(...C.dark)
  h.y += TTL_H + 4
}

// ── Per-page footers ───────────────────────────────────────────────────────────
function footers(h: H): void {
  const total = h.doc.getNumberOfPages()
  const now = new Date().toLocaleString('en-IN')
  for (let i = 1; i <= total; i++) {
    h.doc.setPage(i)
    const ph = h.doc.internal.pageSize.getHeight()
    const pw = h.doc.internal.pageSize.getWidth()
    h.doc.setDrawColor(...C.border)
    h.doc.setLineWidth(0.4)
    h.doc.line(M, ph - 11, pw - M, ph - 11)
    h.normal(6.5)
    h.doc.setTextColor(...C.muted)
    h.doc.text(`Generated: ${now}`, M, ph - 6)
    h.doc.text(HOSPITAL_NAME, pw / 2, ph - 6, { align: 'center' })
    h.doc.text(`Page ${i} of ${total}`, pw - M, ph - 6, { align: 'right' })
  }
  h.doc.setTextColor(...C.dark)
}

// Column x positions (landscape, cw=269, M=14)
// Right-edge of content = M + cw = 283
const RE = M + 269  // right edge = 283

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTED PDF GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Salary PDF ────────────────────────────────────────────────────────────────
export async function generateSalaryPDF(monthYear: string) {
  const res = await apiFetch(`/api/employees/salary?month_year=${monthYear}`)
  const result = await res.json()
  if (!result.success) throw new Error('Failed to fetch salary data')

  const employees: any[] = result.data || []
  const s = result.summary
  const h = mkDoc()
  hdr(h, 'Salary Report', getMonthLabel(monthYear))

  boxRow(h, [
    { label: 'Total Settled',   value: fmt(s?.settled_amount || 0),       accent: C.green },
    { label: 'Pending Payout',  value: fmt(s?.need_to_settle || 0),       accent: C.orange },
    { label: 'Total Advances',  value: fmt(s?.total_advances_paid || 0),  accent: C.purple },
    { label: 'Employee Count',  value: String(employees.length),          accent: C.teal },
  ])

  sec(h, 'EMPLOYEE SALARY DETAILS')
  // Columns: # | Employee | Base | Days | OT | Calculated | Advances | Final | Status
  // Widths:  6 | 60       | 30   | 18   | 14 | 33         | 33       | 33    | remaining
  // Start x: M+2, M+11, M+74(R), M+93(C), M+111(C), M+132(R), M+168(R), M+204(R), M+214
  thead(h, [
    { label: '#',           x: M + 2 },
    { label: 'Employee',    x: M + 11 },
    { label: 'Base Salary', x: M + 74,  align: 'right' },
    { label: 'Days',        x: M + 93,  align: 'center' },
    { label: 'OT',          x: M + 111, align: 'center' },
    { label: 'Calculated',  x: M + 145, align: 'right' },
    { label: 'Advances',    x: M + 181, align: 'right' },
    { label: 'Final Salary',x: M + 217, align: 'right' },
    { label: 'Status',      x: M + 230 },
  ])

  employees.forEach((emp: any, i: number) => {
    const r = emp.salary_record
    trow(h, [
      { text: String(i + 1),                                    x: M + 2 },
      { text: (emp.name || '—').substring(0, 26),               x: M + 11 },
      { text: fmt(emp.base_salary || 0),                        x: M + 74,  align: 'right' },
      { text: String(r?.days_present ?? '—'),                   x: M + 93,  align: 'center' },
      { text: String(r?.ot_days ?? 0),                          x: M + 111, align: 'center' },
      { text: fmt(r?.calculated_salary || 0),                   x: M + 145, align: 'right' },
      { text: fmt(emp.total_advance || 0),                      x: M + 181, align: 'right' },
      { text: fmt(r?.final_salary || 0),                        x: M + 217, align: 'right' },
      { text: r?.status === 'settled' ? 'Settled' : 'Pending',  x: M + 230 },
    ], i)
  })

  ttotal(h, [
    { text: 'GRAND TOTAL',           x: M + 11 },
    { text: fmt(s?.grand_total || 0), x: M + 217, align: 'right' },
  ])

  footers(h)
  h.doc.save(`Salary_Report_${monthYear}.pdf`)
}

// ── General Expenses PDF ───────────────────────────────────────────────────────
export async function generateExpensesPDF(monthYear: string) {
  const res = await apiFetch(`/api/finances/expenses?month_year=${monthYear}`)
  const result = await res.json()
  if (!result.success) throw new Error('Failed to fetch expenses')

  const expenses: any[] = result.data || []
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const h = mkDoc()
  hdr(h, 'General Expenses Report', getMonthLabel(monthYear))

  boxRow(h, [
    { label: 'Total Expenses', value: fmt(total),              accent: C.red },
    { label: 'No. of Entries', value: String(expenses.length), accent: C.navy },
  ])

  sec(h, 'EXPENSE TRANSACTIONS')
  // # | Date | Type | Remarks | Amount
  thead(h, [
    { label: '#',       x: M + 2 },
    { label: 'Date',    x: M + 11 },
    { label: 'Type',    x: M + 45 },
    { label: 'Remarks', x: M + 115 },
    { label: 'Amount',  x: RE, align: 'right' },
  ])

  let run = 0
  expenses.forEach((exp: any, i: number) => {
    const amt = Number(exp.amount) || 0
    run += amt
    trow(h, [
      { text: String(i + 1),                                  x: M + 2 },
      { text: formatDate(exp.expense_date),                   x: M + 11 },
      { text: (exp.expense_type || '—').substring(0, 35),     x: M + 45 },
      { text: (exp.remarks || '—').substring(0, 55),          x: M + 115 },
      { text: fmt(amt),                                       x: RE, align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: 'TOTAL', x: M + 11 },
    { text: fmt(run), x: RE, align: 'right' },
  ])

  footers(h)
  h.doc.save(`General_Expenses_${monthYear}.pdf`)
}

// ── Ledger Expenses PDF ────────────────────────────────────────────────────────
export async function generateLedgerExpensesPDF(monthYear: string) {
  const [year, month] = monthYear.split('-').map(Number)
  const startDate = `${monthYear}-01`
  const endDate   = `${monthYear}-${new Date(year, month, 0).getDate()}`
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, transaction_type: 'debit', source: 'expense' })
  const res = await apiFetch(`/api/ledger/transactions?${params}`)
  const result = await res.json()
  const txns: any[] = result.success ? result.data : (Array.isArray(result) ? result : [])

  const total = txns.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const h = mkDoc()
  hdr(h, 'Ledger Expenses Report', getMonthLabel(monthYear))

  boxRow(h, [
    { label: 'Total Debit',   value: fmt(total),            accent: C.red },
    { label: 'Transactions',  value: String(txns.length),   accent: C.navy },
    { label: 'Period Start',  value: formatDate(startDate), accent: C.teal },
    { label: 'Period End',    value: formatDate(endDate),   accent: C.teal },
  ])

  sec(h, 'LEDGER DEBIT TRANSACTIONS')
  // # | Date | Created By | Description | Patient | Mode | Ref | Status | Amount
  thead(h, [
    { label: '#',           x: M + 2 },
    { label: 'Date',        x: M + 11 },
    { label: 'Created By',  x: M + 42 },
    { label: 'Description', x: M + 84 },
    { label: 'Patient',     x: M + 158 },
    { label: 'Mode',        x: M + 195 },
    { label: 'Ref No.',     x: M + 222 },
    { label: 'Amount',      x: RE,      align: 'right' },
  ])

  let run = 0
  txns.forEach((t: any, i: number) => {
    const amt = Number(t.amount) || 0
    run += amt
    trow(h, [
      { text: String(i + 1),                                         x: M + 2 },
      { text: formatDate(t.transaction_date),                        x: M + 11 },
      { text: (t.created_by_user?.username || '—').substring(0, 16), x: M + 42 },
      { text: (t.description || '—').substring(0, 40),               x: M + 84 },
      { text: (t.patient?.name || '—').substring(0, 20),             x: M + 158 },
      { text: (t.payment_mode || '—').replace('_', ' '),             x: M + 195 },
      { text: (t.reference_number || '—').substring(0, 14),          x: M + 222 },
      { text: fmt(amt),                                               x: RE, align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: 'TOTAL', x: M + 11 },
    { text: fmt(run), x: RE, align: 'right' },
  ])

  footers(h)
  h.doc.save(`Ledger_Expenses_${monthYear}.pdf`)
}

// ── Referral Commissions PDF ───────────────────────────────────────────────────
export async function generateReferralPDF(monthYear: string) {
  const res = await apiFetch('/api/finances/referral-commissions')
  const result = await res.json()
  const commissions: any[] = result.success ? result.data : (Array.isArray(result) ? result : [])

  const totalComm    = commissions.reduce((s, c) => s + (Number(c.referral_commission_amount) || 0), 0)
  const totalSettled = commissions.filter(c => c.referral_settled).reduce((s, c) => s + (Number(c.referral_commission_amount) || 0), 0)
  const totalPending = totalComm - totalSettled

  const h = mkDoc()
  hdr(h, 'Referral Commissions Report', getMonthLabel(monthYear))

  boxRow(h, [
    { label: 'Total Commission', value: fmt(totalComm),    accent: C.navy },
    { label: 'Settled',          value: fmt(totalSettled), accent: C.green },
    { label: 'Pending',          value: fmt(totalPending), accent: C.orange },
    { label: 'Total Referrals',  value: String(commissions.length), accent: C.teal },
  ])

  sec(h, 'REFERRAL COMMISSION DETAILS')
  // # | Patient | Patient ID | Referral Name | Commission | In Pkg | Settled | Settlement Date
  thead(h, [
    { label: '#',              x: M + 2 },
    { label: 'Patient',        x: M + 11 },
    { label: 'Referral Agent', x: M + 88 },
    { label: 'Commission',     x: M + 160, align: 'right' },
    { label: 'In Package',     x: M + 185 },
    { label: 'Settled',        x: M + 215 },
    { label: 'Settled On',     x: M + 240 },
  ])

  commissions.forEach((c: any, i: number) => {
    trow(h, [
      { text: String(i + 1),                                      x: M + 2 },
      { text: (c.patient?.name || '—').substring(0, 36),          x: M + 11 },
      { text: (c.referral?.name || '—').substring(0, 36),         x: M + 88 },
      { text: fmt(Number(c.referral_commission_amount) || 0),     x: M + 160, align: 'right' },
      { text: c.referral_commission_included_in_package ? 'Yes' : 'No', x: M + 185 },
      { text: c.referral_settled ? 'Yes' : 'No',                  x: M + 215 },
      { text: c.referral_settled ? formatDate(c.referral_settlement_date) : '—', x: M + 240 },
    ], i)
  })

  ttotal(h, [
    { text: 'TOTAL', x: M + 11 },
    { text: fmt(totalComm), x: M + 160, align: 'right' },
  ])

  footers(h)
  h.doc.save(`Referral_Commissions_${monthYear}.pdf`)
}

// ── Income Report PDF ──────────────────────────────────────────────────────────
export async function generateIncomePDF(monthYear: string, summary: any) {
  const [year, month] = monthYear.split('-').map(Number)
  const startDate = `${monthYear}-01`
  const endDate   = `${monthYear}-${new Date(year, month, 0).getDate()}`
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, transaction_type: 'credit', source: 'patient' })
  const res = await apiFetch(`/api/ledger/transactions?${params}`)
  const result = await res.json()
  const txns: any[] = result.success ? result.data : (Array.isArray(result) ? result : [])

  const h = mkDoc()
  hdr(h, 'Income Report', getMonthLabel(monthYear))

  boxRow(h, [
    { label: 'Amount Received',     value: fmt(summary.income.total_paid),          accent: C.green },
    { label: 'Total Charges',       value: fmt(summary.income.total_charges),       accent: C.navy },
    { label: 'Pending Receivables', value: fmt(summary.income.pending_receivables), accent: C.orange },
    { label: 'Billing Records',     value: String(summary.income.billing_count),   accent: C.teal },
  ])

  sec(h, 'PATIENT PAYMENT TRANSACTIONS')
  // # | Date | Patient | Description | Ref No. | Mode | Amount
  thead(h, [
    { label: '#',           x: M + 2 },
    { label: 'Date',        x: M + 11 },
    { label: 'Patient',     x: M + 45 },
    { label: 'Description', x: M + 120 },
    { label: 'Reference',   x: M + 196 },
    { label: 'Mode',        x: M + 233 },
    { label: 'Amount',      x: RE,     align: 'right' },
  ])

  let total = 0
  txns.forEach((t: any, i: number) => {
    const amt = Number(t.amount) || 0
    total += amt
    trow(h, [
      { text: String(i + 1),                                  x: M + 2 },
      { text: formatDate(t.transaction_date),                 x: M + 11 },
      { text: (t.patient?.name || '—').substring(0, 36),     x: M + 45 },
      { text: (t.description || '—').substring(0, 38),       x: M + 120 },
      { text: (t.reference_number || '—').substring(0, 16),  x: M + 196 },
      { text: (t.payment_mode || '—').replace('_', ' '),     x: M + 233 },
      { text: fmt(amt),                                       x: RE, align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: 'TOTAL RECEIVED', x: M + 11 },
    { text: fmt(total),       x: RE, align: 'right' },
  ])

  footers(h)
  h.doc.save(`Income_Report_${monthYear}.pdf`)
}

// ── Expense Breakdown PDF ──────────────────────────────────────────────────────
export async function generateExpenseBreakdownPDF(monthYear: string, summary: any) {
  const exp = summary.expenses
  const total = exp.total_expenses || 0
  const h = mkDoc()
  hdr(h, 'Expense Breakdown Report', getMonthLabel(monthYear))

  // Row 1: 3 boxes
  boxRow(h, [
    { label: 'Salary Payments',  value: fmt(exp.salary_expenses),   accent: C.navy },
    { label: 'General Expenses', value: fmt(exp.general_expenses),  accent: C.orange },
    { label: 'Ledger Expenses',  value: fmt(exp.ledger_expenses),   accent: C.teal },
  ])

  // Row 2: 3 boxes
  boxRow(h, [
    { label: 'Doctor Fees',          value: fmt(exp.doctor_fees || 0),     accent: C.purple },
    { label: 'Referral Commissions', value: fmt(exp.referral_commissions), accent: C.blue },
    { label: 'Total Expenses',       value: fmt(total),                    accent: C.red },
  ])

  sec(h, 'EXPENSE CATEGORY BREAKDOWN')
  // # | Category | Amount | % of Total
  thead(h, [
    { label: '#',          x: M + 2 },
    { label: 'Category',   x: M + 14 },
    { label: 'Amount',     x: M + 170, align: 'right' },
    { label: '% of Total', x: RE,      align: 'right' },
  ])

  const rows: [string, number][] = [
    ['Salary Payments',      exp.salary_expenses],
    ['General Expenses',     exp.general_expenses],
    ['Ledger Expenses',      exp.ledger_expenses],
    ['Doctor Fees',          exp.doctor_fees || 0],
    ['Referral Commissions', exp.referral_commissions],
  ]
  rows.forEach(([label, val], i) => {
    trow(h, [
      { text: String(i + 1),  x: M + 2 },
      { text: label,          x: M + 14 },
      { text: fmt(val),       x: M + 170, align: 'right' },
      { text: pct(val, total), x: RE,     align: 'right' },
    ], i)
  })

  ttotal(h, [
    { text: 'TOTAL EXPENSES', x: M + 14 },
    { text: fmt(total),       x: M + 170, align: 'right' },
    { text: '100.0%',         x: RE,      align: 'right' },
  ])

  footers(h)
  h.doc.save(`Expense_Breakdown_${monthYear}.pdf`)
}

// ── Comprehensive Monthly Finance PDF ─────────────────────────────────────────
export async function generateMonthlyFinancePDF(monthYear: string, summary: any) {
  const [year, month] = monthYear.split('-').map(Number)
  const startDate  = `${monthYear}-01`
  const endDate    = `${monthYear}-${new Date(year, month, 0).getDate()}`
  const monthLabel = getMonthLabel(monthYear)

  const [salaryRes, expensesRes, ledgerRes, referralRes] = await Promise.all([
    apiFetch(`/api/employees/salary?month_year=${monthYear}`),
    apiFetch(`/api/finances/expenses?month_year=${monthYear}`),
    apiFetch(`/api/ledger/transactions?${new URLSearchParams({ start_date: startDate, end_date: endDate, transaction_type: 'debit', source: 'expense' })}`),
    apiFetch('/api/finances/referral-commissions'),
  ])
  const salaryData   = await salaryRes.json()
  const expensesData = await expensesRes.json()
  const ledgerData   = await ledgerRes.json()
  const referralData = await referralRes.json()

  const h = mkDoc()

  // ── Page 1: Overview ────────────────────────────────────────────────────────
  hdr(h, 'Monthly Financial Report', monthLabel)

  const isProfit = summary.profit.is_profit
  boxRow(h, [
    { label: 'Net Revenue',    value: fmt(summary.income.net_income),                               accent: C.green },
    { label: 'Total Expenses', value: fmt(summary.expenses.total_expenses),                         accent: C.red },
    { label: isProfit ? 'Net Profit' : 'Net Loss', value: fmt(Math.abs(summary.profit.net_profit)), accent: isProfit ? C.green : C.orange },
    { label: 'Profit Margin',  value: `${summary.profit.profit_margin.toFixed(1)}%`,                accent: C.teal },
  ])

  boxRow(h, [
    { label: 'Pending Receivables',      value: fmt(summary.income.pending_receivables),         accent: C.orange },
    { label: 'Pending Dr. Settlements',  value: fmt(summary.pending_settlements.doctor_fees),    accent: C.purple },
    { label: 'Pending Ref. Commissions', value: fmt(summary.pending_settlements.referral_commissions || 0), accent: C.blue },
    { label: 'Billing Records',          value: String(summary.income.billing_count),            accent: C.navy },
  ])

  // Income + Expense tables side by side (half content each)
  const halfW = (h.cw - 8) / 2

  // Income section (left half)
  h.doc.setFillColor(...C.blue)
  h.doc.rect(M, h.y, 4, SEC_H, 'F')
  h.doc.setFillColor(...C.secBg)
  h.doc.rect(M + 4, h.y, halfW - 4, SEC_H, 'F')
  h.bold(9.5); h.doc.setTextColor(...C.navy)
  h.doc.text('INCOME BREAKDOWN', M + 9, h.y + 6.8)

  // Expense section (right half)
  const rx = M + halfW + 8
  h.doc.setFillColor(...C.red)
  h.doc.rect(rx, h.y, 4, SEC_H, 'F')
  h.doc.setFillColor(...C.secBg)
  h.doc.rect(rx + 4, h.y, halfW - 4, SEC_H, 'F')
  h.bold(9.5); h.doc.setTextColor(...C.navy)
  h.doc.text('EXPENSE BREAKDOWN', rx + 9, h.y + 6.8)
  h.doc.setTextColor(...C.dark)
  h.y += SEC_H + 2

  // Income table header
  const lRE = M + halfW  // left table right edge
  h.doc.setFillColor(...C.tblHead); h.doc.rect(M, h.y, halfW, TH_H, 'F')
  h.bold(7.5); h.doc.setTextColor(...C.white)
  h.doc.text('Category', M + 4, h.y + 6.5)
  h.doc.text('Amount', lRE, h.y + 6.5, { align: 'right' })

  // Expense table header
  const rRE = rx + halfW
  h.doc.setFillColor(...C.tblHead); h.doc.rect(rx, h.y, halfW, TH_H, 'F')
  h.doc.text('Category', rx + 4, h.y + 6.5)
  h.doc.text('Amount', rRE, h.y + 6.5, { align: 'right' })
  h.doc.setTextColor(...C.dark)
  h.y += TH_H

  const incRows = [
    ['Total Charges',       fmt(summary.income.total_charges)],
    ['Amount Received',     fmt(summary.income.total_paid)],
    ['Pending Receivables', fmt(summary.income.pending_receivables)],
  ]
  const expRows = [
    ['Salary',      fmt(summary.expenses.salary_expenses)],
    ['General',     fmt(summary.expenses.general_expenses)],
    ['Ledger',      fmt(summary.expenses.ledger_expenses)],
    ['Doctor Fees', fmt(summary.expenses.doctor_fees || 0)],
    ['Referral',    fmt(summary.expenses.referral_commissions)],
  ]
  const maxRows = Math.max(incRows.length, expRows.length)
  for (let i = 0; i < maxRows; i++) {
    const bg = i % 2 === 1 ? C.tblAlt : C.white
    h.doc.setFillColor(...bg); h.doc.rect(M, h.y, halfW, ROW_H, 'F')
    h.doc.setFillColor(...bg); h.doc.rect(rx, h.y, halfW, ROW_H, 'F')
    h.doc.setDrawColor(...C.border); h.doc.setLineWidth(0.2)
    h.doc.line(M, h.y + ROW_H, lRE, h.y + ROW_H)
    h.doc.line(rx, h.y + ROW_H, rRE, h.y + ROW_H)
    h.normal(7.5); h.doc.setTextColor(...C.dark)
    if (incRows[i]) {
      h.doc.text(incRows[i][0], M + 4, h.y + 5)
      h.doc.text(incRows[i][1], lRE, h.y + 5, { align: 'right' })
    }
    if (expRows[i]) {
      h.doc.text(expRows[i][0], rx + 4, h.y + 5)
      h.doc.text(expRows[i][1], rRE, h.y + 5, { align: 'right' })
    }
    h.y += ROW_H
  }
  // Total rows
  h.doc.setFillColor(...C.navy); h.doc.rect(M, h.y, halfW, TTL_H, 'F')
  h.doc.setFillColor(...C.navy); h.doc.rect(rx, h.y, halfW, TTL_H, 'F')
  h.bold(8.5); h.doc.setTextColor(...C.white)
  h.doc.text('NET INCOME', M + 4, h.y + 6.5)
  h.doc.text(fmt(summary.income.net_income), lRE, h.y + 6.5, { align: 'right' })
  h.doc.text('TOTAL EXPENSES', rx + 4, h.y + 6.5)
  h.doc.text(fmt(summary.expenses.total_expenses), rRE, h.y + 6.5, { align: 'right' })
  h.doc.setTextColor(...C.dark)
  h.y += TTL_H + 4

  // ── Page 2: Salary ──────────────────────────────────────────────────────────
  h.doc.addPage(); h.y = M
  hdr(h, 'Salary Details', monthLabel)

  const salaryEmps: any[] = salaryData.success ? salaryData.data : []
  const ss = salaryData.summary
  boxRow(h, [
    { label: 'Total Settled',  value: fmt(ss?.settled_amount || 0),      accent: C.green },
    { label: 'Pending Payout', value: fmt(ss?.need_to_settle || 0),      accent: C.orange },
    { label: 'Total Advances', value: fmt(ss?.total_advances_paid || 0), accent: C.purple },
  ])

  sec(h, 'EMPLOYEE SALARY DETAILS')
  thead(h, [
    { label: '#',            x: M + 2 },
    { label: 'Employee',     x: M + 11 },
    { label: 'Base Salary',  x: M + 74,  align: 'right' },
    { label: 'Days',         x: M + 93,  align: 'center' },
    { label: 'OT',           x: M + 111, align: 'center' },
    { label: 'Calculated',   x: M + 145, align: 'right' },
    { label: 'Advances',     x: M + 181, align: 'right' },
    { label: 'Final Salary', x: M + 217, align: 'right' },
    { label: 'Status',       x: M + 230 },
  ])
  salaryEmps.forEach((emp: any, i: number) => {
    const r = emp.salary_record
    trow(h, [
      { text: String(i + 1),                                    x: M + 2 },
      { text: (emp.name || '—').substring(0, 26),               x: M + 11 },
      { text: fmt(emp.base_salary || 0),                        x: M + 74,  align: 'right' },
      { text: String(r?.days_present ?? '—'),                   x: M + 93,  align: 'center' },
      { text: String(r?.ot_days ?? 0),                          x: M + 111, align: 'center' },
      { text: fmt(r?.calculated_salary || 0),                   x: M + 145, align: 'right' },
      { text: fmt(emp.total_advance || 0),                      x: M + 181, align: 'right' },
      { text: fmt(r?.final_salary || 0),                        x: M + 217, align: 'right' },
      { text: r?.status === 'settled' ? 'Settled' : 'Pending',  x: M + 230 },
    ], i)
  })
  ttotal(h, [
    { text: 'GRAND TOTAL', x: M + 11 },
    { text: fmt(ss?.grand_total || 0), x: M + 217, align: 'right' },
  ])

  // ── Page 3: General Expenses ────────────────────────────────────────────────
  h.doc.addPage(); h.y = M
  hdr(h, 'General Expenses', monthLabel)
  const expList: any[] = expensesData.success ? expensesData.data : []
  sec(h, 'GENERAL EXPENSE TRANSACTIONS')
  thead(h, [
    { label: '#',       x: M + 2 },
    { label: 'Date',    x: M + 11 },
    { label: 'Type',    x: M + 45 },
    { label: 'Remarks', x: M + 115 },
    { label: 'Amount',  x: RE, align: 'right' },
  ])
  let expTotal = 0
  expList.forEach((exp: any, i: number) => {
    const amt = Number(exp.amount) || 0; expTotal += amt
    trow(h, [
      { text: String(i + 1),                               x: M + 2 },
      { text: formatDate(exp.expense_date),                x: M + 11 },
      { text: (exp.expense_type || '—').substring(0, 35), x: M + 45 },
      { text: (exp.remarks || '—').substring(0, 55),      x: M + 115 },
      { text: fmt(amt),                                    x: RE, align: 'right' },
    ], i)
  })
  ttotal(h, [{ text: 'TOTAL', x: M + 11 }, { text: fmt(expTotal), x: RE, align: 'right' }])

  // ── Page 4: Ledger Expenses ─────────────────────────────────────────────────
  h.doc.addPage(); h.y = M
  hdr(h, 'Ledger Expenses', monthLabel)
  const ledgTxns: any[] = ledgerData.success ? ledgerData.data : (Array.isArray(ledgerData) ? ledgerData : [])
  sec(h, 'LEDGER DEBIT TRANSACTIONS')
  thead(h, [
    { label: '#',           x: M + 2 },
    { label: 'Date',        x: M + 11 },
    { label: 'Created By',  x: M + 42 },
    { label: 'Description', x: M + 84 },
    { label: 'Patient',     x: M + 158 },
    { label: 'Mode',        x: M + 195 },
    { label: 'Ref No.',     x: M + 222 },
    { label: 'Amount',      x: RE,      align: 'right' },
  ])
  let ledgTotal = 0
  ledgTxns.forEach((t: any, i: number) => {
    const amt = Number(t.amount) || 0; ledgTotal += amt
    trow(h, [
      { text: String(i + 1),                                          x: M + 2 },
      { text: formatDate(t.transaction_date),                         x: M + 11 },
      { text: (t.created_by_user?.username || '—').substring(0, 16), x: M + 42 },
      { text: (t.description || '—').substring(0, 40),               x: M + 84 },
      { text: (t.patient?.name || '—').substring(0, 20),             x: M + 158 },
      { text: (t.payment_mode || '—').replace('_', ' '),             x: M + 195 },
      { text: (t.reference_number || '—').substring(0, 14),          x: M + 222 },
      { text: fmt(amt),                                               x: RE, align: 'right' },
    ], i)
  })
  ttotal(h, [{ text: 'TOTAL', x: M + 11 }, { text: fmt(ledgTotal), x: RE, align: 'right' }])

  // ── Page 5: Referral Commissions ────────────────────────────────────────────
  h.doc.addPage(); h.y = M
  hdr(h, 'Referral Commissions', monthLabel)
  const refs: any[] = referralData.success ? referralData.data : (Array.isArray(referralData) ? referralData : [])
  sec(h, 'REFERRAL COMMISSION DETAILS')
  thead(h, [
    { label: '#',              x: M + 2 },
    { label: 'Patient',        x: M + 11 },
    { label: 'Referral Agent', x: M + 88 },
    { label: 'Commission',     x: M + 160, align: 'right' },
    { label: 'In Package',     x: M + 185 },
    { label: 'Settled',        x: M + 215 },
    { label: 'Settled On',     x: M + 240 },
  ])
  refs.forEach((c: any, i: number) => {
    trow(h, [
      { text: String(i + 1),                                           x: M + 2 },
      { text: (c.patient?.name || '—').substring(0, 36),               x: M + 11 },
      { text: (c.referral?.name || '—').substring(0, 36),              x: M + 88 },
      { text: fmt(Number(c.referral_commission_amount) || 0),          x: M + 160, align: 'right' },
      { text: c.referral_commission_included_in_package ? 'Yes' : 'No', x: M + 185 },
      { text: c.referral_settled ? 'Yes' : 'No',                       x: M + 215 },
      { text: c.referral_settled ? formatDate(c.referral_settlement_date) : '—', x: M + 240 },
    ], i)
  })

  footers(h)
  h.doc.save(`Monthly_Finance_Report_${monthYear}.pdf`)
}
