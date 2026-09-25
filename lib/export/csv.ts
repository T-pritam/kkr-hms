/**
 * CSV export.
 *
 * Deliberately not a spreadsheet library. A `.csv` opens directly in Excel,
 * Google Sheets and LibreOffice, and the alternative was a new dependency to
 * keep patched for the sake of bold header cells.
 *
 * The quoting matters more than it looks. The app's CSV *importer*
 * (`app/api/employees/import/route.ts`) splits on `,` with no quote handling,
 * which is a known defect — a remark reading "Advance, festival" shifts every
 * column after it. Writing correct RFC 4180 here means nothing this app exports
 * can trip that up, and gives the importer something to be fixed against later.
 */

export interface CsvColumn<T> {
  /** Header cell. */
  header: string
  /** Cell value. Return a plain string — formatting is the caller's business. */
  value: (row: T) => string | number | null | undefined
}

/**
 * A field needs quoting if it contains the delimiter, a quote, or a line break.
 * Inner quotes are doubled — `"` becomes `""` — which is the whole of RFC 4180's
 * escaping rule.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''

  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

export interface CsvOptions {
  /**
   * Rows appended after the data, e.g. a totals line. Given as raw cell values
   * in the same column order; they go through the same quoting.
   */
  footer?: (string | number | null | undefined)[][]
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], options: CsvOptions = {}): string {
  const lines: string[] = [columns.map(c => cell(c.header)).join(',')]

  for (const row of rows) {
    lines.push(columns.map(c => cell(c.value(row))).join(','))
  }

  for (const extra of options.footer ?? []) {
    lines.push(columns.map((_, i) => cell(extra[i])).join(','))
  }

  // CRLF is what RFC 4180 specifies and what Excel on Windows expects.
  return lines.join('\r\n')
}

/**
 * Hand the file to the browser.
 *
 * The BOM is not decoration: without it Excel on Windows reads the file as the
 * system codepage and mangles every non-ASCII character — including the rupee
 * sign and any name that is not plain Latin.
 *
 * Same shape as `downloadPdf` in `lib/pdf/merge.ts`, including the deferred
 * revoke, which Safari needs to finish reading the blob before it is freed.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** `Advance_Log_2026-08.csv` — safe on every filesystem. */
export function csvFilename(...parts: (string | null | undefined)[]): string {
  const safe = parts
    .filter(Boolean)
    .map(p => String(p).replace(/[^a-z0-9-]+/gi, '_').replace(/^_+|_+$/g, ''))
    .filter(Boolean)
    .join('_')

  return `${safe || 'export'}.csv`
}

/**
 * Read CSV text into rows of fields — the reader to `toCsv`'s writer, RFC 4180.
 *
 * A quoted field may contain commas, line breaks and doubled quotes (`""` is one
 * `"`). Rows end at LF or CRLF. Fields are returned exactly as written, apart
 * from the quoting; blank lines are dropped.
 *
 * The employee importer used to `split(',')`, so `"Kumar, Ramesh"` tore in half
 * and every column after it shifted (BUGS #54).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    if (row.some((value) => value.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') quoted = true
    else if (char === ',') endField()
    else if (char === '\n') endRow()
    else if (char === '\r' && text[i + 1] === '\n') {
      endRow()
      i++
    } else field += char
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}
