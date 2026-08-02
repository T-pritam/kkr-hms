/**
 * lib/api/query — the paging and search plumbing every list route shares.
 *
 * Both of these fix a defect that had been copy-pasted across the app:
 * `parseInt(get('pageSize') || '10')` with no clamp and no NaN guard
 * (BUGS.md #10), and the search term interpolated raw into a PostgREST `.or()`
 * filter, where a comma or a bracket silently rewrites the query.
 */

import { describe, it, expect } from 'vitest'
import { MAX_PAGE_SIZE, pageMeta, parsePaging, safeSearch } from '@/lib/api/query'

const params = (query: Record<string, string>) => new URLSearchParams(query)

describe('parsePaging', () => {
  it('defaults to the first page of ten', () => {
    expect(parsePaging(params({}))).toEqual({ page: 1, pageSize: 10, from: 0, to: 9 })
  })

  it('honours an explicit page and size', () => {
    expect(parsePaging(params({ page: '3', pageSize: '25' }))).toEqual({
      page: 3,
      pageSize: 25,
      from: 50,
      to: 74,
    })
  })

  it('takes a caller-supplied default page size', () => {
    expect(parsePaging(params({}), 20).pageSize).toBe(20)
  })

  /** `?pageSize=100000` used to return the whole table in one response. */
  it('caps the page size', () => {
    expect(parsePaging(params({ pageSize: '100000' })).pageSize).toBe(MAX_PAGE_SIZE)
  })

  it.each([
    ['a non-numeric page', { page: 'abc' }],
    ['a negative page', { page: '-4' }],
    ['a zero page', { page: '0' }],
    ['an empty page', { page: '' }],
  ])('falls back to page 1 for %s', (_label, query) => {
    const paging = parsePaging(params(query))
    expect(paging.page).toBe(1)
    // The real damage was `.range(NaN, NaN)`, so the offsets matter as much as
    // the page number.
    expect(Number.isFinite(paging.from)).toBe(true)
    expect(Number.isFinite(paging.to)).toBe(true)
  })

  it.each([
    ['a non-numeric size', { pageSize: 'lots' }],
    ['a zero size', { pageSize: '0' }],
    ['a negative size', { pageSize: '-10' }],
  ])('falls back to the default for %s', (_label, query) => {
    expect(parsePaging(params(query)).pageSize).toBe(10)
  })

  it('produces a range the size of one page', () => {
    const { from, to, pageSize } = parsePaging(params({ page: '2', pageSize: '15' }))
    expect(to - from + 1).toBe(pageSize)
  })
})

describe('safeSearch', () => {
  it('leaves an ordinary term alone', () => {
    expect(safeSearch('Ramesh Kumar')).toBe('Ramesh Kumar')
  })

  it.each([
    ['a comma', 'Kumar, Ramesh', 'Kumar  Ramesh'],
    ['brackets', 'Paracetamol (500)', 'Paracetamol  500'],
    ['a double quote', 'Say "hello"', 'Say  hello'],
    ['an apostrophe', "O'Brien", 'O Brien'],
  ])('neutralises %s', (_label, input, expected) => {
    expect(safeSearch(input)).toBe(expected)
  })

  /**
   * Replaced with spaces rather than removed, so `ilike '%…%'` still matches
   * around them: "Smith (Jr)" should find "Smith Jr", not nothing.
   */
  it('substitutes rather than deletes', () => {
    expect(safeSearch('Smith(Jr)')).toBe('Smith Jr')
  })

  it('trims the result', () => {
    expect(safeSearch('  (Ramesh)  ')).toBe('Ramesh')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['only punctuation', ',,,'],
  ])('returns an empty string for %s — no filter is applied', (_label, input) => {
    expect(safeSearch(input)).toBe('')
  })
})

describe('pageMeta', () => {
  it('reports the envelope every list route returns', () => {
    const paging = parsePaging(params({ page: '2', pageSize: '10' }))
    expect(pageMeta(42, paging)).toEqual({ total: 42, page: 2, pageSize: 10, totalPages: 5 })
  })

  it('rounds a partial last page up', () => {
    expect(pageMeta(41, parsePaging(params({ pageSize: '10' }))).totalPages).toBe(5)
  })

  it('treats a missing count as zero rather than NaN', () => {
    expect(pageMeta(null, parsePaging(params({})))).toMatchObject({ total: 0, totalPages: 0 })
  })
})
