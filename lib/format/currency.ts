/**
 * The one money formatter for the UI.
 *
 * There were four of them, and they disagreed. Three used
 * `toLocaleString('en-IN', { maximumFractionDigits: 2 })` — which sets a
 * *maximum* and no minimum, so it drops trailing zeros and renders a fifth of a
 * rupee as the bare `-0.2` the user reported, next to figures printed by
 * `toFixed(2)` as `-0.20`. Two decimals, always, is the only sensible thing for
 * money, and having one function is the only way it stays that way.
 *
 * The PDFs keep their own `fmt()` in `lib/pdf/base.ts`: jsPDF's built-in
 * Helvetica is WinAnsi-encoded and cannot render `₹`, so those documents print
 * `Rs.` instead. Same rounding, different symbol.
 */

/** Postgres numerics arrive as strings often enough to make this worth doing once. */
export function toAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export interface MoneyOptions {
  /**
   * Clamp negatives to zero.
   *
   * For totals that cannot meaningfully be negative — a month's advances, a
   * payout — a below-zero figure is a bug upstream, and printing it is how the
   * `-0.2` got in front of a user in the first place. For genuinely signed
   * figures (a balance, a variance) leave this off and let the minus show.
   */
  clamp?: boolean
  /** Drop the symbol, for CSV cells and table columns that carry their own header. */
  bare?: boolean
}

/**
 * `₹1,25,000.00` — Indian digit grouping, always two decimals.
 *
 *   inr(1250)            // '₹1,250.00'
 *   inr('1250.5')        // '₹1,250.50'
 *   inr(-0.2)            // '-₹0.20'
 *   inr(-0.2, { clamp: true })  // '₹0.00'
 *   inr(1250, { bare: true })   // '1,250.00'
 */
export function inr(value: unknown, options: MoneyOptions = {}): string {
  let amount = toAmount(value)
  if (options.clamp) amount = Math.max(0, amount)

  const negative = amount < 0
  const digits = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  if (options.bare) return negative ? `-${digits}` : digits

  // The sign goes outside the symbol — "-₹0.20", not "₹-0.20".
  return negative ? `-₹${digits}` : `₹${digits}`
}

/** Plain two-decimal string for a CSV cell: no symbol, no grouping commas. */
export function amountCell(value: unknown): string {
  return toAmount(value).toFixed(2)
}

/** `45%`, for "share of salary already drawn". Null when the base is zero. */
export function percentOf(part: unknown, whole: unknown): number | null {
  const w = toAmount(whole)
  if (w <= 0) return null
  return (toAmount(part) / w) * 100
}
