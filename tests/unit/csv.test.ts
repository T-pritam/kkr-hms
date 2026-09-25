/**
 * lib/export/csv — the CSV writer behind the exports, and the reader behind the
 * employee import.
 *
 * The quoting is the whole point. The importer used to split on `,` with no
 * quote handling, so "Kumar, Ramesh" tore in half and shifted every column
 * after it (BUGS #54). The reader and the writer now agree, so anything this
 * app exports reads back exactly.
 */

import { describe, it, expect } from 'vitest'
import { csvFilename, parseCsv, toCsv, type CsvColumn } from '@/lib/export/csv'

interface Row {
  name: string
  amount: number
  remarks: string | null
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: 'Name',    value: r => r.name },
  { header: 'Amount',  value: r => r.amount.toFixed(2) },
  { header: 'Remarks', value: r => r.remarks },
]

const lines = (csv: string) => csv.split('\r\n')

describe('toCsv', () => {
  it('writes a header row even with no data', () => {
    expect(toCsv([], COLUMNS)).toBe('Name,Amount,Remarks')
  })

  it('writes one line per row, in column order', () => {
    const csv = toCsv(
      [
        { name: 'Ramesh', amount: 5000, remarks: 'Festival' },
        { name: 'Suresh', amount: 2000, remarks: null },
      ],
      COLUMNS,
    )

    expect(lines(csv)).toEqual([
      'Name,Amount,Remarks',
      'Ramesh,5000.00,Festival',
      'Suresh,2000.00,',
    ])
  })

  /** RFC 4180 uses CRLF, and Excel on Windows expects it. */
  it('separates rows with CRLF', () => {
    const csv = toCsv([{ name: 'Ramesh', amount: 1, remarks: null }], COLUMNS)
    expect(csv).toContain('\r\n')
  })

  it('quotes a field containing the delimiter', () => {
    const csv = toCsv([{ name: 'Kumar, Ramesh', amount: 1, remarks: null }], COLUMNS)
    expect(lines(csv)[1]).toBe('"Kumar, Ramesh",1.00,')
  })

  it('doubles inner quotes, as RFC 4180 requires', () => {
    const csv = toCsv([{ name: 'Ramesh', amount: 1, remarks: 'Said "urgent"' }], COLUMNS)
    expect(lines(csv)[1]).toBe('Ramesh,1.00,"Said ""urgent"""')
  })

  it('quotes a field containing a newline', () => {
    const csv = toCsv([{ name: 'Ramesh', amount: 1, remarks: 'line one\nline two' }], COLUMNS)
    expect(csv).toContain('"line one\nline two"')
  })

  it('leaves ordinary fields unquoted', () => {
    const csv = toCsv([{ name: 'Ramesh', amount: 1, remarks: 'Festival' }], COLUMNS)
    expect(lines(csv)[1]).not.toContain('"')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('renders %s as an empty cell, not the word', (_label, value) => {
    const csv = toCsv([{ name: 'Ramesh', amount: 1, remarks: value as any }], COLUMNS)
    expect(lines(csv)[1]).toBe('Ramesh,1.00,')
  })

  it('appends footer rows through the same quoting', () => {
    const csv = toCsv(
      [{ name: 'Ramesh', amount: 5000, remarks: null }],
      COLUMNS,
      { footer: [['TOTAL', '5000.00', 'a, comma']] },
    )

    expect(lines(csv)[2]).toBe('TOTAL,5000.00,"a, comma"')
  })

  it('pads a short footer row to the full column count', () => {
    const csv = toCsv([], COLUMNS, { footer: [['TOTAL']] })
    expect(lines(csv)[1]).toBe('TOTAL,,')
  })
})

describe('csvFilename', () => {
  it('joins the parts and appends the extension', () => {
    expect(csvFilename('Advance_Log', '2026-08')).toBe('Advance_Log_2026-08.csv')
  })

  it('strips characters a filesystem would object to', () => {
    expect(csvFilename('Report: Q1/2026')).toBe('Report_Q1_2026.csv')
  })

  it('skips missing parts rather than leaving a stray separator', () => {
    expect(csvFilename('Advance_Log', null, undefined, '2026-08')).toBe('Advance_Log_2026-08.csv')
  })

  it('falls back to a usable name when nothing survives', () => {
    expect(csvFilename('///')).toBe('export.csv')
  })
})

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('keeps a comma inside quotes', () => {
    expect(parseCsv('"Kumar, Ramesh",27000')).toEqual([['Kumar, Ramesh', '27000']])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('"He said ""hi""",x')).toEqual([['He said "hi"', 'x']])
  })

  it('keeps a line break inside quotes', () => {
    expect(parseCsv('"line one\nline two",x\ny,z')).toEqual([['line one\nline two', 'x'], ['y', 'z']])
  })

  it('handles CRLF and drops blank lines', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('keeps an empty field', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })

  it('reads back exactly what toCsv writes', () => {
    const rows: Row[] = [{ name: 'Kumar, "Ramu"', amount: 12.5, remarks: 'two\nlines' }]
    expect(parseCsv(toCsv(rows, COLUMNS))[1]).toEqual(['Kumar, "Ramu"', '12.50', 'two\nlines'])
  })
})
