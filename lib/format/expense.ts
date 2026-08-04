/**
 * The one way an expense category is written for a reader.
 *
 * 'Miscellaneous' on its own tells nobody anything, so wherever a catch-all
 * expense is shown it is rendered with the detail that qualifies it —
 * `misc - (Broken window pane)`. There are four render sites (the Finances
 * table, two PDF tables, the shift settlement modal) and this exists so they
 * cannot each invent their own format, the way `lib/format/currency.ts` exists
 * because four money formatters disagreed.
 *
 * Everything returns a string. lib/pdf/base.ts passes cell text straight to
 * jsPDF's `doc.text()`, which throws on a non-string, so `null` in must not
 * become `undefined` out.
 */

import {
  LEDGER_EXPENSE_CATEGORY_LABELS,
  MISCELLANEOUS_TYPE,
  OTHER_LEDGER_CATEGORY,
  type LedgerExpenseCategory,
} from '@/lib/finances/constants'

export interface LabelOptions {
  /**
   * Hard cap, for the fixed-width PDF columns. Truncates with an ellipsis.
   * U+2026 is WinAnsi, which is what jsPDF's built-in Helvetica encodes — the
   * same reason those documents print `Rs.` rather than `₹`.
   */
  max?: number
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value)
}

function cap(value: string, max?: number): string {
  if (!max || value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

/**
 * `Electric Bill` · `misc - (Broken window pane)`
 *
 * A 'Miscellaneous' row with no detail renders as plain `Miscellaneous`, never
 * `misc - ()`. Rows predating the detail column have nothing to show, and an
 * empty bracket reads like the data is broken rather than merely old. They get
 * a real value the first time someone edits them, because the API requires one
 * on update too.
 */
export function expenseTypeLabel(type: unknown, detail: unknown, options: LabelOptions = {}): string {
  const t = text(type)
  const d = text(detail)

  if (!t) return ''
  if (t !== MISCELLANEOUS_TYPE || !d) return cap(t, options.max)

  return cap(`misc - (${d})`, options.max)
}

/**
 * `Medical Supplies` · `other - (Diwali sweets)`
 *
 * An unrecognised category falls through to its raw value rather than
 * `undefined` — a row written before the allow-list existed should still be
 * legible.
 */
export function ledgerExpenseCategoryLabel(
  category: unknown,
  detail: unknown,
  options: LabelOptions = {},
): string {
  const c = text(category)
  const d = text(detail)

  if (!c) return ''

  if (c === OTHER_LEDGER_CATEGORY && d) return cap(`other - (${d})`, options.max)

  const label = LEDGER_EXPENSE_CATEGORY_LABELS[c as LedgerExpenseCategory] ?? c
  return cap(label, options.max)
}
