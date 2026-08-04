/**
 * Server-side rules for the two expense tables.
 *
 * Both screens have the same shape: a category from a fixed list, and one
 * catch-all value in that list which means nothing on its own and therefore
 * requires a free-text qualifier. Neither rule can be a CHECK constraint —
 * requiredness depends on a sibling column's value — so both live here, the way
 * the UPI reference rule lives in app/api/ledger/transactions/route.ts.
 *
 * Every function returns a message rather than throwing, so the routes keep
 * their existing `return NextResponse.json({ error }, { status: 400 })` shape.
 */

import {
  EXPENSE_DETAIL_MAX,
  EXPENSE_TYPES,
  LEDGER_EXPENSE_CATEGORIES,
  MISCELLANEOUS_TYPE,
  OTHER_LEDGER_CATEGORY,
  type ExpenseType,
  type LedgerExpenseCategory,
} from './constants'

/** Blank after trimming counts as absent — '   ' is not an answer. */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export type DetailResult = { error: string } | { value: string | null }

/**
 * The shared rule, applied to whichever pair of columns is in play.
 *
 * Over-length is rejected rather than truncated: silently cutting the end off
 * someone's note loses the part that usually carries the point, and does it
 * without telling them.
 */
function resolveDetail(
  requiresDetail: boolean,
  detail: unknown,
  missingMessage: string,
): DetailResult {
  const text = trimmed(detail)

  if (!requiresDetail) {
    // Discard rather than keep: a detail hanging off 'Electric Bill' is a value
    // no screen ever shows and no report can explain.
    return { value: null }
  }

  if (!text) return { error: missingMessage }
  if (text.length > EXPENSE_DETAIL_MAX) {
    return { error: `Detail must be ${EXPENSE_DETAIL_MAX} characters or fewer` }
  }

  return { value: text }
}

/** null when the type is allowed, else the 400 message. */
export function validateExpenseType(value: unknown): string | null {
  if (!EXPENSE_TYPES.includes(value as ExpenseType)) {
    return `Expense type must be one of: ${EXPENSE_TYPES.join(', ')}`
  }
  return null
}

/** The detail for a general expense — required only for 'Miscellaneous'. */
export function normaliseExpenseDetail(expenseType: unknown, detail: unknown): DetailResult {
  return resolveDetail(
    expenseType === MISCELLANEOUS_TYPE,
    detail,
    'Describe the miscellaneous expense',
  )
}

/**
 * null when the category is allowed, else the 400 message.
 *
 * Only `source === 'expense'` rows carry a category at all; the caller nulls the
 * pair on every other source so an OPD or patient row cannot drift into
 * carrying one.
 */
export function validateLedgerExpenseCategory(value: unknown): string | null {
  if (!LEDGER_EXPENSE_CATEGORIES.includes(value as LedgerExpenseCategory)) {
    return `Expense category must be one of: ${LEDGER_EXPENSE_CATEGORIES.join(', ')}`
  }
  return null
}

/** The detail for a ledger expense — required only for 'other'. */
export function normaliseLedgerCategoryDetail(category: unknown, detail: unknown): DetailResult {
  return resolveDetail(
    category === OTHER_LEDGER_CATEGORY,
    detail,
    'Describe the expense when the category is Other',
  )
}
