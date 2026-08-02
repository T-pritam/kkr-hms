/**
 * Shared list-endpoint plumbing.
 *
 * Two things every paginated route in this app got wrong, in two different
 * places each:
 *
 *   * `parseInt(searchParams.get('pageSize') || '10')` with no clamp, so
 *     `?pageSize=100000` returned the entire table in one request, and no NaN
 *     guard, so `?page=abc` produced `.range(NaN, NaN)` (BUGS.md #10).
 *   * The search term interpolated straight into a PostgREST `.or()` filter
 *     string, where a comma or a bracket in the term silently corrupts the
 *     query — `"Paracetamol (500), x"` parses as extra filter clauses.
 *
 * `app/api/lab/orders/route.ts` and `app/api/medicines/route.ts` each grew a
 * one-line fix for the second problem. This is that fix, extracted, so the next
 * list route inherits it instead of rediscovering it.
 */

/** Nobody needs a thousand rows in one response, and nobody should get them. */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 10

export interface Paging {
  page: number
  pageSize: number
  /** Ready for `.range(from, to)`. */
  from: number
  to: number
}

function positiveInt(raw: string | null, fallback: number, max?: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return max ? Math.min(n, max) : n
}

export function parsePaging(
  searchParams: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE,
): Paging {
  const page = positiveInt(searchParams.get('page'), 1)
  const pageSize = positiveInt(searchParams.get('pageSize'), defaultPageSize, MAX_PAGE_SIZE)

  const from = (page - 1) * pageSize
  return { page, pageSize, from, to: from + pageSize - 1 }
}

/**
 * Strips the characters PostgREST reads as filter syntax.
 *
 * Replaced with spaces rather than removed so `ilike '%...%'` still matches
 * around them: searching "Smith (Jr)" should find "Smith Jr", not nothing.
 */
export function safeSearch(term: string | null | undefined): string {
  return (term ?? '').replace(/[,()"']/g, ' ').trim()
}

/** `{ total, page, pageSize, totalPages }`, the envelope every list route returns. */
export function pageMeta(count: number | null, paging: Paging) {
  const total = count ?? 0
  return {
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.ceil(total / paging.pageSize),
  }
}
