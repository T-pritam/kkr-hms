/**
 * KKR Diagnostic Centre letterhead.
 *
 * First attempt hand-drew the logo/name/watermark/footer with jsPDF
 * primitives, approximating the client's artwork. That drifted in ways that
 * mattered: wrong logo crop, wrong name font, phone numbers too small, and a
 * yellowish tint the transparency compositing introduced that isn't in the
 * source at all. The fix: stop approximating — the full letterhead
 * ("demo sheet.jpeg") is embedded as the page background and only the
 * variable content (patient block, results, tables) is drawn on top.
 *
 * Two render modes, because the clinic already has this letterhead
 * physically pre-printed on paper stock:
 *   - 'digital' draws the background image, for a self-contained PDF to
 *     share/download online.
 *   - 'print' skips the background image — the exact same text at the same
 *     coordinates — meant to be printed onto the pre-printed paper so the
 *     two line up. See `LETTERHEAD_CONFIG.print` for calibration.
 *
 * Not usable through `mkDoc()`/`base.ts`'s `checkPage` as-is: that resets a
 * new page's cursor to the top margin, which would put content on top of
 * the header artwork (digital mode) or above the printable area (print
 * mode). `mkLetterheadDoc()` is a parallel constructor whose `checkPage`
 * resets below the header rule and redraws the background (digital only)
 * on every new page instead.
 *
 * Colour: the clinic's office printer is black-and-white, so every helper
 * here reads `LETTERHEAD_CONFIG.useColor` and falls back to black text /
 * black-ruled borders instead of fills when it's off — which is the
 * default. The letterhead artwork itself stays in colour (digital mode
 * only); that's a fixed background image, not something these helpers draw.
 */

import jsPDF from 'jspdf'
import { M, C } from './base'
import type { H } from './base'
import {
  KKR_LETTERHEAD_BG_DATA_URI,
  LETTERHEAD_NAME_PX,
  LETTERHEAD_NAME_SIZE_PT,
  LETTERHEAD_NAME_TEAL,
  LETTERHEAD_PX,
} from './kkr-letterhead-bg'
import { LETTERHEAD_CONFIG } from './letterhead-config'

export type LetterheadMode = 'digital' | 'print'

const PAGE_W = 210
const PAGE_H = 297
const PX_TO_MM = PAGE_H / LETTERHEAD_PX.imageHeight

/** Just below the header rule in the artwork. */
export const LETTERHEAD_TOP = LETTERHEAD_PX.headerRuleY * PX_TO_MM + 6
/** Just above the teal footer band in the artwork. */
export const LETTERHEAD_BOTTOM = LETTERHEAD_PX.footerBandStartY * PX_TO_MM - 4

const BLACK: [number, number, number] = [0, 0, 0]

/** A colour when `useColor` is on, black otherwise. Every renderer that used
 * to reach for C.navy/C.red/C.muted goes through this instead, so flipping
 * the one config flag is enough to take colour back out (or, someday, put
 * it back in for a colour printer) without touching each call site. */
export function ink(colourful: [number, number, number]): [number, number, number] {
  return LETTERHEAD_CONFIG.useColor ? colourful : BLACK
}

function drawBackground(doc: jsPDF): void {
  try {
    doc.addImage(KKR_LETTERHEAD_BG_DATA_URI, 'JPEG', 0, 0, PAGE_W, PAGE_H)
  } catch {
    // A bad asset must not stop the document printing.
  }
}

export interface LetterheadDocOptions {
  /**
   * Printed in place of the artwork's own name — "PHARMACY" on a pharmacy bill.
   *
   * Passed here rather than drawn by the caller because the artwork is repainted
   * on every page break, and only this constructor sees those.
   */
  name?: string
}

/** Portrait A4 doc handle. `mode: 'print'` omits the letterhead background —
 * see the module doc comment. */
export function mkLetterheadDoc(
  mode: LetterheadMode = 'digital',
  { name }: LetterheadDocOptions = {},
): H {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const cw = pw - M * 2

  const printCfg = LETTERHEAD_CONFIG.print
  const top = mode === 'print' ? LETTERHEAD_TOP + printCfg.topOffsetMm : LETTERHEAD_TOP
  const bottom = mode === 'print' ? LETTERHEAD_BOTTOM + printCfg.bottomOffsetMm : LETTERHEAD_BOTTOM
  let y = top

  const bold = (s: number) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(s) }
  const normal = (s: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(s) }
  const paintBackground = () => {
    if (mode !== 'digital') return
    drawBackground(doc)
    if (name) drawLetterheadName(doc, name)
  }
  const checkPage = (needed = 10) => {
    if (y + needed > bottom) {
      doc.addPage()
      paintBackground()
      y = top
    }
  }

  paintBackground()

  return { doc, get y() { return y }, set y(v) { y = v }, pw, ph, cw, re: M + cw, bold, normal, checkPage }
}

/**
 * Prints `name` where the artwork says "DIAGNOSTIC CENTRE".
 *
 * The pharmacy is a separate trader, and its bill is a tax document, so it must
 * not go out under the diagnostic centre's name. The name is baked into the
 * letterhead JPEG, so the only way to change it is to paint the phrase out and
 * write over it — see LETTERHEAD_NAME_PX for why that is safe to do.
 *
 * Private, and applied by `paintBackground` rather than by the caller: the
 * artwork is redrawn on every page break, so a name applied once would be
 * correct on page one and wrong on every page after it.
 */
function drawLetterheadName(doc: jsPDF, name: string): void {
  const g = LETTERHEAD_NAME_PX
  const sx = PAGE_W / LETTERHEAD_PX.imageWidth

  doc.setFillColor(255, 255, 255)
  doc.rect(
    g.maskLeft * sx,
    g.maskTop * PX_TO_MM,
    (g.maskRight - g.maskLeft) * sx,
    (g.maskBottom - g.maskTop) * PX_TO_MM,
    'F',
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(LETTERHEAD_NAME_SIZE_PT)
  doc.setTextColor(...LETTERHEAD_NAME_TEAL)
  doc.text(name, g.textLeft * sx, g.baseline * PX_TO_MM)

  // Left as the letterhead found it, so callers need not know it was touched.
  doc.setTextColor(0, 0, 0)
}

/** Hands the browser straight to its print dialog. Most documents pass the
 * 'print' copy, drawn without artwork for the pre-printed paper stock. */
export function autoPrint(doc: jsPDF): void {
  doc.autoPrint()
  const url = doc.output('bloburl')
  window.open(url, '_blank')
}

// ── Minimal patient block (Name / Age-Sex / Date / Id no only) ────────────────
export interface MinimalPatientInfo {
  name: string
  ageSex: string
  date: string
  idNo: string
}

/** Matches the two-line, four-field block on the client's sample reports. */
export function minimalPatientBlock(h: H, info: MinimalPatientInfo): void {
  const cfg = LETTERHEAD_CONFIG.patientBlock
  const col2 = M + cfg.col2Fraction * h.cw
  const top = h.y
  const textColor = LETTERHEAD_CONFIG.useColor ? C.dark : BLACK
  const name = cfg.uppercaseName ? (info.name || '').toLocaleUpperCase() : info.name

  const field = (label: string, value: string, x: number, y: number) => {
    h.doc.setFont(cfg.fontFamily, cfg.bold ? 'bold' : 'normal')
    h.doc.setFontSize(cfg.fontSize)
    h.doc.setTextColor(...textColor)
    const labelText = `${label}:-`
    h.doc.text(labelText, x, y)
    const labelWidth = h.doc.getTextWidth(labelText)
    h.doc.text(value || '—', x + labelWidth + cfg.labelValueGapMm, y)
  }

  field('Pt.Name', name, M, top)
  field('Date', info.date, col2, top)
  field('Age/Sex', info.ageSex, M, top + cfg.rowGap)
  field('Id no', info.idNo, col2, top + cfg.rowGap)

  h.y = top + cfg.rowGap * 2 + cfg.paddingBeforeRuleMm
  h.doc.setDrawColor(...BLACK)
  h.doc.setLineWidth(0.4)
  h.doc.line(M, h.y, h.re, h.y)
  h.y += cfg.paddingAfterRuleMm

  h.doc.setFont('helvetica', 'normal')
}

// ── Centred, underlined section heading ────────────────────────────────────────
export function letterheadSectionTitle(h: H, title: string): void {
  const cfg = LETTERHEAD_CONFIG.sectionTitle
  h.checkPage(20)
  h.doc.setFont('helvetica', cfg.bold ? 'bold' : 'normal')
  h.doc.setFontSize(cfg.fontSize)
  h.doc.setTextColor(...BLACK)
  const centerX = h.pw / 2
  const textWidth = h.doc.getTextWidth(title)
  const x = cfg.centered ? centerX : M
  h.doc.text(title, x, h.y, { align: cfg.centered ? 'center' : 'left' })
  h.y += 2.5
  h.doc.setDrawColor(...BLACK)
  h.doc.setLineWidth(0.3)
  if (cfg.centered) {
    h.doc.line(centerX - textWidth / 2, h.y, centerX + textWidth / 2, h.y)
  } else {
    h.doc.line(M, h.y, M + textWidth, h.y)
  }
  h.y += 8
}

// ── Bordered black-and-white table (charges, medications) ─────────────────────
export interface LetterheadTableColumn {
  label: string
  /** Relative width — only the ratio between columns matters. */
  width: number
  align?: 'left' | 'right' | 'center'
}

const TABLE_FONT_SIZE = 9
const TABLE_LINE_H = 4.2

export function letterheadTable(
  h: H,
  columns: LetterheadTableColumn[],
  rows: string[][],
  opts: { totalLabel?: string; totalValue?: string } = {},
): void {
  const cfg = LETTERHEAD_CONFIG.table
  const totalWidth = columns.reduce((s, c) => s + c.width, 0)
  const scale = h.cw / totalWidth
  const colX: number[] = []
  let x = M
  for (const c of columns) { colX.push(x); x += c.width * scale }
  const tableRight = x
  const colWidth = (i: number) => (colX[i + 1] ?? tableRight) - colX[i]

  /** Wraps every cell to its column width and returns the row height needed
   * for the tallest one — a medicine usage note or a long description
   * shouldn't run into its neighbour or get silently clipped. */
  const wrapRow = (texts: string[], minHeight: number): { lines: string[][]; height: number } => {
    h.doc.setFontSize(TABLE_FONT_SIZE)
    const lines = texts.map((text, i) => {
      const w = colWidth(i) - cfg.cellPaddingMm * 2
      return h.doc.splitTextToSize(text, w) as string[]
    })
    const maxLines = Math.max(1, ...lines.map(l => l.length))
    const height = Math.max(minHeight, maxLines * TABLE_LINE_H + cfg.cellPaddingMm)
    return { lines, height }
  }

  const drawRow = (lines: string[][], top: number, height: number, bold: boolean) => {
    h.doc.setDrawColor(...BLACK)
    h.doc.setLineWidth(cfg.borderWeightMm)
    h.doc.rect(M, top, tableRight - M, height)
    for (let i = 1; i < columns.length; i++) {
      h.doc.line(colX[i], top, colX[i], top + height)
    }
    h.doc.setFont('helvetica', bold ? 'bold' : 'normal')
    h.doc.setFontSize(TABLE_FONT_SIZE)
    h.doc.setTextColor(...BLACK)
    lines.forEach((cellLines, i) => {
      const col = columns[i]
      const w = colWidth(i)
      const align = col.align || 'left'
      const tx = align === 'right' ? colX[i] + w - cfg.cellPaddingMm
        : align === 'center' ? colX[i] + w / 2
        : colX[i] + cfg.cellPaddingMm
      const blockH = cellLines.length * TABLE_LINE_H
      let ty = top + (height - blockH) / 2 + TABLE_LINE_H - 1.4
      for (const line of cellLines) {
        h.doc.text(line, tx, ty, { align })
        ty += TABLE_LINE_H
      }
    })
  }

  const headerCells = wrapRow(columns.map(c => c.label), cfg.headerHeightMm)
  h.checkPage(headerCells.height + cfg.rowHeightMm * 2)
  drawRow(headerCells.lines, h.y, headerCells.height, cfg.headerBold)
  h.y += headerCells.height

  for (const row of rows) {
    const cells = wrapRow(row, cfg.rowHeightMm)
    h.checkPage(cells.height + 2)
    drawRow(cells.lines, h.y, cells.height, false)
    h.y += cells.height
  }

  if (opts.totalLabel) {
    const totalTexts = columns.map((_, i) =>
      i === 0 ? opts.totalLabel! : i === columns.length - 1 ? (opts.totalValue || '') : '',
    )
    const cells = wrapRow(totalTexts, cfg.rowHeightMm)
    h.checkPage(cells.height + 2)
    drawRow(cells.lines, h.y, cells.height, true)
    h.y += cells.height
  }

  h.y += 6
}
