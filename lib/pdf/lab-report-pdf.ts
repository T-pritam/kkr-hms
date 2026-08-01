/**
 * Laboratory report PDF.
 *
 * A4 **portrait**, deliberately unlike the landscape billing and finance
 * reports — pathology reports are always portrait.
 *
 * The layout is the borderless clinical style used by Indian diagnostic labs
 * and expected by NABL 112 / ISO 15189 §7.4: no cell borders, one rule under
 * the column headings, abnormal results in bold with an H or L beside them, and
 * every timestamp in the sample's journey printed in the patient block.
 *
 * Notably absent, by design:
 *   - no "Flag" column — no real lab report has one
 *   - no "Verified" anywhere
 *   - no ✓ / ⚠ / ↑ / ↓ glyphs: jsPDF's built-in Helvetica is WinAnsi-encoded
 *     and renders them as substitute characters
 */

import { C, M, fmt, mkDoc, footers } from './base'
import { BRANDING } from './branding'
import type { H } from './base'

// ── Geometry (portrait: pw 210, cw 182, right edge 196) ──────────────────────
const COL = {
  name:   M,         // 14
  result: M + 78,    // 92
  mark:   M + 106,   // 120  narrow gutter for the H / L letter
  unit:   M + 114,   // 128
  ref:    M + 146,   // 160
}
const ROW_H = 5.4

const grey = (h: H, on: boolean) => h.doc.setTextColor(...(on ? C.muted : C.dark))

function rule(h: H, weight = 0.3, colour: [number, number, number] = C.border): void {
  h.doc.setDrawColor(...colour)
  h.doc.setLineWidth(weight)
  h.doc.line(M, h.y, h.re, h.y)
}

function dateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Public types ─────────────────────────────────────────────────────────────
export interface LabReportValue {
  parameter_id: string
  value: number | null
  text_value: string | null
  unit: string | null
  ref_display: string | null
  abnormal: 'H' | 'L' | 'A' | null
  is_critical: boolean
}

export interface LabReportParameter {
  id: string
  name: string
  group_name: string | null
  method: string | null
  decimals: number
}

export interface LabReportItem {
  id: string
  test_name: string
  test_code: string
  specimen: string | null
  method: string | null
  status: string
  interpretation: string | null
  interpretation_by_name: string | null
  entered_by_name: string | null
  authorised_by_name: string | null
  authorised_at: string | null
  parameters: LabReportParameter[]
  values: LabReportValue[]
}

export interface LabReportData {
  order_no: string
  patient_name: string
  patient_display_id: string | null
  patient_age: number | null
  patient_gender: string | null
  patient_phone: string | null
  referring_doctor_name: string | null
  registered_at: string | null
  collected_at: string | null
  received_at: string | null
  reported_at: string | null
  net_amount?: number
  items: LabReportItem[]
}

/** Fetches everything the report needs. Split out so the renderer is testable. */
export async function fetchLabReportData(orderId: string): Promise<LabReportData> {
  const res = await fetch(`/api/lab/orders/${orderId}`)
  const json = await res.json()
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the report')
  return json.data as LabReportData
}

// ── Sections ─────────────────────────────────────────────────────────────────

function reportHeader(h: H): void {
  const logo = BRANDING.logo
  let textLeft = M
  let centre = h.pw / 2

  if (logo) {
    try {
      h.doc.addImage(logo.dataUri, logo.format, M, h.y, logo.widthMm, logo.heightMm)
      textLeft = M + logo.widthMm + 4
      centre = textLeft + (h.re - textLeft) / 2
    } catch {
      // A bad data URI must not stop the report printing.
    }
  }

  const top = h.y
  h.bold(14)
  h.doc.setTextColor(...C.navy)
  h.doc.text(BRANDING.name, centre, top + 5, { align: 'center' })

  h.normal(7.5)
  h.doc.setTextColor(...C.muted)
  h.doc.text(BRANDING.address, centre, top + 10, { align: 'center' })
  h.doc.text(
    [BRANDING.phone && `Ph: ${BRANDING.phone}`, BRANDING.email].filter(Boolean).join('   |   '),
    centre, top + 14.5, { align: 'center' },
  )

  h.doc.setTextColor(...C.dark)
  h.y = Math.max(top + 18, logo ? top + logo.heightMm + 2 : 0)
  rule(h, 0.6, C.navy)
  h.y += 5
}

function patientBlock(h: H, data: LabReportData): void {
  const left: [string, string][] = [
    ['Name', data.patient_name || '—'],
    ['Age / Sex', `${data.patient_age !== null && data.patient_age !== undefined ? `${data.patient_age} Y` : '—'} / ${data.patient_gender || '—'}`],
    ['Patient ID', data.patient_display_id || 'Walk-in'],
    ['Referred By', data.referring_doctor_name || 'Self'],
  ]
  const right: [string, string][] = [
    ['Order No', data.order_no],
    ['Registered', dateTime(data.registered_at)],
    ['Collected', dateTime(data.collected_at)],
    ['Received', dateTime(data.received_at)],
    ['Reported', dateTime(data.reported_at)],
  ]

  const top = h.y
  const rightX = M + 96

  const column = (rows: [string, string][], labelX: number, valueX: number) => {
    let y = top
    for (const [label, value] of rows) {
      h.normal(8)
      h.doc.setTextColor(...C.muted)
      h.doc.text(label, labelX, y)
      h.doc.text(':', valueX - 3, y)
      h.bold(8)
      h.doc.setTextColor(...C.dark)
      h.doc.text(String(value), valueX, y)
      y += 5
    }
    return y
  }

  const leftEnd = column(left, M, M + 26)
  const rightEnd = column(right, rightX, rightX + 24)

  h.doc.setTextColor(...C.dark)
  h.y = Math.max(leftEnd, rightEnd) + 1
  rule(h, 0.4)
  h.y += 6
}

function columnHeadings(h: H): void {
  h.bold(8)
  h.doc.setTextColor(...C.navy)
  h.doc.text('Investigation', COL.name, h.y)
  h.doc.text('Result', COL.result, h.y)
  h.doc.text('Unit', COL.unit, h.y)
  h.doc.text('Biological Ref. Interval', COL.ref, h.y)
  h.doc.setTextColor(...C.dark)
  h.y += 2
  rule(h, 0.4, C.navy)
  h.y += 4.5
}

function testSection(h: H, item: LabReportItem): boolean {
  const byId = new Map(item.parameters.map(p => [p.id, p]))
  const printable = item.values.filter(v => byId.has(v.parameter_id))
  if (printable.length === 0) return false

  h.checkPage(34)

  // Test heading
  h.bold(9.5)
  h.doc.setTextColor(...C.navy)
  h.doc.text(item.test_name.toUpperCase(), COL.name, h.y)
  h.doc.setTextColor(...C.dark)
  h.y += 4.5

  const meta = [
    item.specimen && `Specimen: ${item.specimen}`,
    item.method && `Method: ${item.method}`,
  ].filter(Boolean).join('        ')

  if (meta) {
    h.normal(7.5)
    h.doc.setTextColor(...C.muted)
    h.doc.text(meta, COL.name, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 5
  } else {
    h.y += 1
  }

  columnHeadings(h)

  let lastGroup: string | null = null
  let anyAbnormal = false

  for (const value of printable) {
    const parameter = byId.get(value.parameter_id)!

    // Repeat the column headings after a page break — the old report did not,
    // so page two arrived as an unlabelled column of numbers.
    if (h.y + ROW_H > h.ph - 22) {
      h.doc.addPage()
      h.y = M
      columnHeadings(h)
      lastGroup = null
    }

    if (parameter.group_name && parameter.group_name !== lastGroup) {
      h.y += 2
      h.bold(7.5)
      h.doc.setTextColor(...C.muted)
      h.doc.text(parameter.group_name.toUpperCase(), COL.name + 2, h.y)
      h.doc.setTextColor(...C.dark)
      h.y += 4.5
      lastGroup = parameter.group_name
    }

    const abnormal = value.abnormal
    if (abnormal) anyAbnormal = true

    // Long names wrap rather than running into the Result column.
    h.normal(8)
    const nameLines: string[] = h.doc.splitTextToSize(parameter.name, COL.result - COL.name - 4)

    const resultText = value.value !== null && value.value !== undefined
      ? Number(value.value).toFixed(parameter.decimals ?? 2)
      : (value.text_value || '—')

    if (abnormal) h.bold(8); else h.normal(8)
    h.doc.setTextColor(...(value.is_critical ? C.red : C.dark))
    h.doc.text(resultText, COL.result, h.y)

    if (abnormal) {
      h.bold(8)
      h.doc.setTextColor(...(value.is_critical ? C.red : C.dark))
      h.doc.text(abnormal, COL.mark, h.y)
    }

    h.normal(8)
    h.doc.setTextColor(...C.dark)
    h.doc.text(nameLines[0], COL.name, h.y)
    grey(h, true)
    h.doc.text(value.unit || '—', COL.unit, h.y)
    h.doc.text(value.ref_display || '—', COL.ref, h.y)
    h.doc.setTextColor(...C.dark)

    h.y += ROW_H

    for (const extra of nameLines.slice(1)) {
      h.normal(8)
      h.doc.text(extra, COL.name, h.y)
      h.y += ROW_H - 1
    }

    if (parameter.method) {
      h.normal(6.5)
      grey(h, true)
      h.doc.text(parameter.method, COL.name + 2, h.y - 1.4)
      h.doc.setTextColor(...C.dark)
      h.y += 2.4
    }
  }

  h.y += 1
  rule(h, 0.4)
  h.y += 4

  if (anyAbnormal) {
    h.normal(7)
    h.doc.setTextColor(...C.muted)
    h.doc.text('H = above reference interval          L = below reference interval', COL.name, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 5
  }

  if (item.interpretation?.trim()) {
    h.checkPage(20)
    h.bold(8)
    h.doc.setTextColor(...C.navy)
    h.doc.text('INTERPRETATION', COL.name, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 4.5

    h.normal(8)
    const lines: string[] = h.doc.splitTextToSize(item.interpretation.trim(), h.cw - 4)
    for (const line of lines) {
      if (h.y > h.ph - 24) { h.doc.addPage(); h.y = M }
      h.doc.text(line, COL.name, h.y)
      h.y += 4.4
    }
    h.y += 3
  }

  return true
}

function signOff(h: H, items: LabReportItem[]): void {
  h.checkPage(30)
  h.y += 4

  h.normal(8)
  h.doc.setTextColor(...C.muted)
  h.doc.text('- -   End of Report   - -', h.pw / 2, h.y, { align: 'center' })
  h.doc.setTextColor(...C.dark)
  h.y += 12

  const enteredBy = [...new Set(items.map(i => i.entered_by_name).filter(Boolean))].join(', ')
  const authorisedBy = [...new Set(items.map(i => i.authorised_by_name).filter(Boolean))].join(', ')

  const top = h.y
  h.normal(7.5)
  h.doc.setTextColor(...C.muted)
  if (enteredBy) { h.doc.text(`Entered by: ${enteredBy}`, M, top); h.y += 4.5 }
  if (authorisedBy) { h.doc.text(`Authorised by: ${authorisedBy}`, M, h.y); h.y += 4.5 }
  h.doc.setTextColor(...C.dark)

  // Signature rule on the right, level with the attribution.
  const sigRight = h.re
  const sigLeft = sigRight - 50
  const sigY = top + 8
  h.doc.setDrawColor(...C.muted)
  h.doc.setLineWidth(0.3)
  h.doc.line(sigLeft, sigY, sigRight, sigY)
  h.normal(7)
  h.doc.setTextColor(...C.muted)
  h.doc.text('Authorised Signatory', sigRight, sigY + 4, { align: 'right' })
  h.doc.setTextColor(...C.dark)

  h.y = Math.max(h.y, sigY + 8)
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function generateLabReportPDF(data: LabReportData): void {
  const h = mkDoc('portrait')

  reportHeader(h)
  patientBlock(h, data)

  const reportable = (data.items || []).filter(i => i.status !== 'cancelled')
  let printedAny = false

  for (const item of reportable) {
    if (testSection(h, item)) {
      printedAny = true
      h.y += 3
    }
  }

  if (!printedAny) {
    h.normal(9)
    h.doc.setTextColor(...C.muted)
    h.doc.text('No results have been entered for this order yet.', M, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 8
  }

  signOff(h, reportable)
  footers(h)

  const safeName = (data.patient_name || 'patient').replace(/[^a-z0-9]/gi, '_')
  const safeOrder = (data.order_no || 'order').replace(/[^a-z0-9]/gi, '_')
  h.doc.save(`Lab_Report_${safeName}_${safeOrder}.pdf`)
}

/** Exported for the totals line some labs print on the patient copy. */
export function formatAmount(amount: number): string {
  return fmt(amount)
}
