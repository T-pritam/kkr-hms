/**
 * Laboratory report PDF.
 *
 * A4 **portrait**, on the KKR Diagnostic Centre letterhead (see
 * `letterhead.ts`) rather than a hand-drawn header — `renderLabReport`
 * takes a `mode` so callers can render either the self-contained 'digital'
 * copy (letterhead background baked in, for sharing) or the 'print' copy
 * (no background, same coordinates) meant to go onto the pre-printed paper.
 *
 * The layout is the borderless clinical style used by Indian diagnostic labs
 * and expected by NABL 112 / ISO 15189 §7.4: no cell borders, one rule under
 * the column headings, abnormal results in bold with an H or L beside them.
 * Colour is off by default (`LETTERHEAD_CONFIG.useColor`) — the clinic's
 * printer is black-and-white, so a critical result is bold rather than red;
 * the H/L letter already carries the meaning.
 *
 * Notably absent, by design:
 *   - no "Flag" column — no real lab report has one
 *   - no "Verified" anywhere
 *   - no ✓ / ⚠ / ↑ / ↓ glyphs: jsPDF's built-in Helvetica is WinAnsi-encoded
 *     and renders them as substitute characters
 */

import { M, fmt, fmtDate } from './base'
import type { H } from './base'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, autoPrint, ink,
} from './letterhead'
import type { LetterheadMode } from './letterhead'

// ── Geometry (portrait: pw 210, cw 182, right edge 196) ──────────────────────
const COL = {
  name:   M,         // 14
  result: M + 78,    // 92
  mark:   M + 106,   // 120  narrow gutter for the H / L letter
  unit:   M + 114,   // 128
  ref:    M + 146,   // 160
}
const ROW_H = 5.4
const CRITICAL: [number, number, number] = [220, 38, 38]

function rule(h: H, weight = 0.3): void {
  h.doc.setDrawColor(0, 0, 0)
  h.doc.setLineWidth(weight)
  h.doc.line(M, h.y, h.re, h.y)
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

function columnHeadings(h: H): void {
  h.bold(8)
  h.doc.setTextColor(0, 0, 0)
  h.doc.text('Investigation', COL.name, h.y)
  h.doc.text('Result', COL.result, h.y)
  h.doc.text('Unit', COL.unit, h.y)
  h.doc.text('Biological Ref. Interval', COL.ref, h.y)
  h.y += 2
  rule(h, 0.4)
  h.y += 4.5
}

function testSection(h: H, item: LabReportItem): boolean {
  const byId = new Map(item.parameters.map(p => [p.id, p]))
  const printable = item.values.filter(v => byId.has(v.parameter_id))
  if (printable.length === 0) return false

  letterheadSectionTitle(h, item.test_name.toUpperCase())

  const meta = [
    item.specimen && `Specimen: ${item.specimen}`,
    item.method && `Method: ${item.method}`,
  ].filter(Boolean).join('        ')

  if (meta) {
    h.normal(7.5)
    h.doc.setTextColor(0, 0, 0)
    h.doc.text(meta, COL.name, h.y)
    h.y += 5
  }

  columnHeadings(h)

  let lastGroup: string | null = null
  let anyAbnormal = false

  for (const value of printable) {
    const parameter = byId.get(value.parameter_id)!

    // Repeat the column headings after a page break — page two used to
    // arrive as an unlabelled column of numbers. checkPage resets h.y to the
    // top of the new page when it breaks, which is how a break is detected
    // here: y ends up somewhere other than where it started.
    const yBefore = h.y
    h.checkPage(ROW_H + 2)
    if (h.y !== yBefore) {
      columnHeadings(h)
      lastGroup = null
    }

    if (parameter.group_name && parameter.group_name !== lastGroup) {
      h.y += 2
      h.bold(7.5)
      h.doc.setTextColor(0, 0, 0)
      h.doc.text(parameter.group_name.toUpperCase(), COL.name + 2, h.y)
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
    h.doc.setTextColor(...(value.is_critical ? ink(CRITICAL) : ([0, 0, 0] as [number, number, number])))
    h.doc.text(resultText, COL.result, h.y)

    if (abnormal) {
      h.bold(8)
      h.doc.text(abnormal, COL.mark, h.y)
    }

    h.normal(8)
    h.doc.setTextColor(0, 0, 0)
    h.doc.text(nameLines[0], COL.name, h.y)
    h.doc.text(value.unit || '—', COL.unit, h.y)
    h.doc.text(value.ref_display || '—', COL.ref, h.y)

    h.y += ROW_H

    for (const extra of nameLines.slice(1)) {
      h.normal(8)
      h.doc.text(extra, COL.name, h.y)
      h.y += ROW_H - 1
    }

    if (parameter.method) {
      h.normal(6.5)
      h.doc.text(parameter.method, COL.name + 2, h.y - 1.4)
      h.y += 2.4
    }
  }

  h.y += 1
  rule(h, 0.4)
  h.y += 4

  if (anyAbnormal) {
    h.normal(7)
    h.doc.text('H = above reference interval          L = below reference interval', COL.name, h.y)
    h.y += 5
  }

  if (item.interpretation?.trim()) {
    h.checkPage(20)
    h.bold(8)
    h.doc.text('INTERPRETATION', COL.name, h.y)
    h.y += 4.5

    h.normal(8)
    const lines: string[] = h.doc.splitTextToSize(item.interpretation.trim(), h.cw - 4)
    for (const line of lines) {
      h.checkPage(5)
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
  h.doc.setTextColor(0, 0, 0)
  h.doc.text('- -   End of Report   - -', h.pw / 2, h.y, { align: 'center' })
  h.y += 12

  const authorisedBy = [...new Set(items.map(i => i.authorised_by_name).filter(Boolean))].join(', ')

  const top = h.y
  h.normal(7.5)
  if (authorisedBy) { h.doc.text(`Authorised by: ${authorisedBy}`, M, h.y); h.y += 4.5 }

  const sigRight = h.re
  const sigLeft = sigRight - 50
  const sigY = top + 8
  h.doc.setDrawColor(0, 0, 0)
  h.doc.setLineWidth(0.3)
  h.doc.line(sigLeft, sigY, sigRight, sigY)
  h.normal(7)
  h.doc.text('Authorised Signatory', sigRight, sigY + 4, { align: 'right' })

  h.y = Math.max(h.y, sigY + 8)
}

// ── Entry point ──────────────────────────────────────────────────────────────

/** Filename used for both the direct download and the merged discharge pack. */
export function labReportFilename(data: LabReportData): string {
  const safeName = (data.patient_name || 'patient').replace(/[^a-z0-9]/gi, '_')
  const safeOrder = (data.order_no || 'order').replace(/[^a-z0-9]/gi, '_')
  return `Lab_Report_${safeName}_${safeOrder}.pdf`
}

/**
 * Renders the report and hands back the document without saving it.
 *
 * Split out so the discharge summary can append lab reports: merging needs the
 * bytes, and calling `save()` would trigger a download of each report as a
 * side effect of building the combined file. `mode` defaults to 'digital'
 * since that's what a merged discharge pack always wants.
 */
export function renderLabReport(data: LabReportData, mode: LetterheadMode = 'digital') {
  const h = mkLetterheadDoc(mode)

  minimalPatientBlock(h, {
    name: data.patient_name || 'Patient',
    ageSex: `${data.patient_age !== null && data.patient_age !== undefined ? `${data.patient_age} Y` : '—'} / ${data.patient_gender || '—'}`,
    date: fmtDate(data.reported_at || data.registered_at),
    idNo: data.patient_display_id || 'Walk-in',
  })

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
    h.doc.setTextColor(0, 0, 0)
    h.doc.text('No results have been entered for this order yet.', M, h.y)
    h.y += 8
  }

  signOff(h, reportable)

  return h.doc
}

export function generateLabReportPDF(data: LabReportData): void {
  renderLabReport(data, 'digital').save(labReportFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printLabReport(data: LabReportData): void {
  autoPrint(renderLabReport(data, 'print'))
}

/** Exported for the totals line some labs print on the patient copy. */
export function formatAmount(amount: number): string {
  return fmt(amount)
}
