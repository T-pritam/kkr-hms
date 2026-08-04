/**
 * The vocabularies the expense screens are allowed to hold.
 *
 * Unlike lib/patients/constants.ts and lib/employees/constants.ts, these lists
 * are **not** mirrored by a CHECK constraint. `expenses.expense_type` has always
 * been unconstrained free text, and the live rows cannot be inspected from here,
 * so a constraint could reject data that already exists. The API is the only
 * enforcement point — see lib/finances/validate.ts.
 *
 * `EXPENSE_TYPES` was hardcoded inside components/finances/general-expense-modal.tsx
 * and nothing tied the server to it, so the route accepted any string at all.
 * The values below are copied from there byte-identically: they are on live rows,
 * and any drift silently orphans historic data from the dropdown that is supposed
 * to describe it.
 */

/** The eight buckets a general expense can go in. Order is the dropdown order. */
export const EXPENSE_TYPES = [
  'Electric Bill',
  'Oxygen Supply',
  'Lift Maintenance',
  'Water & Sanitation',
  'Cleaning Supplies',
  'Medical Equipment Maintenance',
  'Internet/Telecom',
  'Miscellaneous',
] as const

export type ExpenseType = (typeof EXPENSE_TYPES)[number]

/**
 * The catch-all. Seven of the eight types say what the money went on; this one
 * says nothing, which is why it is the only one that requires a detail.
 */
export const MISCELLANEOUS_TYPE: ExpenseType = 'Miscellaneous'

/** The daily ledger's own, separate expense vocabulary. */
export const LEDGER_EXPENSE_CATEGORIES = [
  'supplies',
  'utilities',
  'maintenance',
  'staff',
  'other',
] as const

export type LedgerExpenseCategory = (typeof LEDGER_EXPENSE_CATEGORIES)[number]

/** The <option> text. Stored values stay short; only the label is prose. */
export const LEDGER_EXPENSE_CATEGORY_LABELS: Record<LedgerExpenseCategory, string> = {
  supplies: 'Medical Supplies',
  utilities: 'Utilities & Rent',
  maintenance: 'Maintenance',
  staff: 'Staff Bonus',
  other: 'Other',
}

/** The ledger's equivalent of MISCELLANEOUS_TYPE. */
export const OTHER_LEDGER_CATEGORY: LedgerExpenseCategory = 'other'

/**
 * One number for the input's maxLength, the API's rejection threshold and the
 * varchar width. Both PDF reports truncate this column at 35 characters
 * (lib/pdf/finance-pdf.ts), so a longer note would print cut off with no
 * indication anything was lost.
 */
export const EXPENSE_DETAIL_MAX = 40
