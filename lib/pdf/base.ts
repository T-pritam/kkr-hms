/**
 * Shared jsPDF toolkit.
 *
 * This was previously duplicated byte-for-byte at the top of `patient-pdf.ts`
 * and `finance-pdf.ts` (~170 lines each), with a third from-scratch variant
 * inline in the lab report component. All three now build on this.
 *
 * The house style is: A4 in millimetres, navy header banner, KPI boxes, section
 * bars, banded tables with absolute column x-positions, and a footer band on
 * every page. `Rs.` rather than `₹` — jsPDF's built-in Helvetica is WinAnsi and
 * has no rupee glyph. Same reason there are no ✓ / ⚠ / ↑ / ↓ anywhere.
 */

import jsPDF from 'jspdf'
import { BRANDING } from './branding'

// ── Geometry ──────────────────────────────────────────────────────────────────
export const M      = 14   // page margin
export const GAP    = 4    // gap between metric boxes
export const HDR_H  = 30   // header banner height
export const BOX_H  = 26   // metric box height
export const ROW_H  = 7    // table data row height
export const TH_H   = 9    // table header row height
export const TTL_H  = 9    // total row height
export const SEC_H  = 10   // section title bar height
export const FTR_H  = 16   // footer reserved height

// ── Colour palette ────────────────────────────────────────────────────────────
export const C = {
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

// ── Formatters ────────────────────────────────────────────────────────────────
export function fmt(amount: number | string): string {
  return `Rs.${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN')
}

export function fmtDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Document handle ───────────────────────────────────────────────────────────
export interface H {
  doc: jsPDF
  y: number
  pw: number   // page width
  ph: number   // page height
  cw: number   // content width (pw - 2*M)
  re: number   // right edge of content (M + cw)
  bold:      (size: number) => void
  normal:    (size: number) => void
  checkPage: (needed?: number) => void
}

export function mkDoc(orientation: 'portrait' | 'landscape' = 'landscape'): H {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const cw = pw - M * 2
  let y = M

  const bold   = (s: number) => { doc.setFont('helvetica', 'bold');   doc.setFontSize(s) }
  const normal = (s: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(s) }
  const checkPage = (needed = ROW_H + 4) => {
    if (y + needed > ph - FTR_H) { doc.addPage(); y = M }
  }

  return { doc, get y() { return y }, set y(v) { y = v }, pw, ph, cw, re: M + cw, bold, normal, checkPage }
}

// ── Header banner ─────────────────────────────────────────────────────────────
export function hdr(h: H, title: string, sub?: string): void {
  h.doc.setFillColor(...C.navy)
  h.doc.rect(0, 0, h.pw, HDR_H, 'F')
  // Blue accent strip along the bottom of the banner
  h.doc.setFillColor(...C.blue)
  h.doc.rect(0, HDR_H - 3, h.pw, 3, 'F')

  h.bold(13)
  h.doc.setTextColor(...C.white)
  h.doc.text(BRANDING.name, h.pw / 2, 11, { align: 'center' })

  h.normal(9)
  h.doc.setTextColor(...C.hdrSub)
  h.doc.text(title, h.pw / 2, 19, { align: 'center' })

  if (sub) {
    h.normal(7.5)
    h.doc.setTextColor(200, 220, 245)
    h.doc.text(sub, h.pw / 2, 25, { align: 'center' })
  }

  h.doc.setTextColor(...C.dark)
  h.y = HDR_H + 8
}

// ── KPI card ──────────────────────────────────────────────────────────────────
export function box(
  h: H,
  x: number, y: number, w: number,
  label: string, value: string,
  accent: [number, number, number] = C.blue,
  sub?: string,
): void {
  const bh = sub ? BOX_H + 5 : BOX_H
  h.doc.setFillColor(248, 250, 253)
  h.doc.setDrawColor(...C.border)
  h.doc.setLineWidth(0.35)
  h.doc.rect(x, y, w, bh, 'FD')

  h.doc.setFillColor(...accent)
  h.doc.rect(x, y, w, 4, 'F')

  h.normal(7)
  h.doc.setTextColor(...C.muted)
  h.doc.text(label, x + w / 2, y + 12, { align: 'center' })

  h.bold(11)
  h.doc.setTextColor(...C.navy)
  h.doc.text(value, x + w / 2, y + 21, { align: 'center' })

  if (sub) {
    h.normal(6.5)
    h.doc.setTextColor(...C.muted)
    h.doc.text(sub, x + w / 2, y + 27, { align: 'center' })
  }

  h.doc.setTextColor(...C.dark)
}

export function boxRow(
  h: H,
  items: { label: string; value: string; accent?: [number, number, number]; sub?: string }[],
): void {
  const n = items.length
  const w = (h.cw - GAP * (n - 1)) / n
  items.forEach((it, i) => {
    box(h, M + i * (w + GAP), h.y, w, it.label, it.value, it.accent || C.blue, it.sub)
  })
  h.y += BOX_H + 8
}

// ── Section title bar ─────────────────────────────────────────────────────────
export function sec(h: H, title: string, color: [number, number, number] = C.blue): void {
  h.checkPage(SEC_H + TH_H + ROW_H * 3)
  h.doc.setFillColor(...color)
  h.doc.rect(M, h.y, 4, SEC_H, 'F')
  h.doc.setFillColor(...C.secBg)
  h.doc.rect(M + 4, h.y, h.cw - 4, SEC_H, 'F')
  h.bold(9.5)
  h.doc.setTextColor(...C.navy)
  h.doc.text(title, M + 9, h.y + 6.8)
  h.doc.setTextColor(...C.dark)
  h.y += SEC_H + 2
}

// ── Tables ────────────────────────────────────────────────────────────────────
export type Col  = { label: string; x: number; align?: 'left' | 'right' | 'center' }
export type Cell = { text: string;  x: number; align?: 'left' | 'right' | 'center' }

export function thead(h: H, cols: Col[]): void {
  h.doc.setFillColor(...C.tblHead)
  h.doc.rect(M, h.y, h.cw, TH_H, 'F')
  h.bold(7.5)
  h.doc.setTextColor(...C.white)
  cols.forEach(c => h.doc.text(c.label, c.x, h.y + 6.5, { align: c.align || 'left' }))
  h.doc.setTextColor(...C.dark)
  h.y += TH_H
}

export function trow(h: H, cells: Cell[], idx: number): void {
  h.checkPage(ROW_H + 2)
  h.doc.setFillColor(...(idx % 2 === 1 ? C.tblAlt : C.white))
  h.doc.rect(M, h.y, h.cw, ROW_H, 'F')
  h.doc.setDrawColor(...C.border)
  h.doc.setLineWidth(0.2)
  h.doc.line(M, h.y + ROW_H, M + h.cw, h.y + ROW_H)
  h.normal(7.5)
  h.doc.setTextColor(...C.dark)
  cells.forEach(c => h.doc.text(c.text, c.x, h.y + 5, { align: c.align || 'left' }))
  h.y += ROW_H
}

export function ttotal(h: H, cells: Cell[]): void {
  h.doc.setFillColor(...C.navy)
  h.doc.rect(M, h.y, h.cw, TTL_H, 'F')
  h.bold(8.5)
  h.doc.setTextColor(...C.white)
  cells.forEach(c => h.doc.text(c.text, c.x, h.y + 6.5, { align: c.align || 'left' }))
  h.doc.setTextColor(...C.dark)
  h.y += TTL_H + 4
}

// ── Per-page footers ──────────────────────────────────────────────────────────
/** Call once, last: it walks every page that ended up in the document. */
export function footers(h: H, opts: { showGenerated?: boolean } = {}): void {
  const { showGenerated = true } = opts
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
    if (showGenerated) h.doc.text(`Generated: ${now}`, M, ph - 6)
    h.doc.text(BRANDING.name, pw / 2, ph - 6, { align: 'center' })
    h.doc.text(`Page ${i} of ${total}`, pw - M, ph - 6, { align: 'right' })
  }
  h.doc.setTextColor(...C.dark)
}
