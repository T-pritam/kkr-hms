/**
 * "Today" on the hospital's clock.
 *
 * Plain date columns (payment date, charge date, join date, ledger date…) used to
 * default to `new Date().toISOString().split('T')[0]` — the **UTC** calendar date.
 * India is UTC+05:30, so anything entered between 00:00 and 05:29 IST landed on the
 * previous day: a payment taken at 1 am on the 22nd was filed under the 21st, on a
 * day that may already have been reconciled.
 *
 * Every default now comes from here. It is pinned to Asia/Kolkata rather than read
 * from the browser, so a server in another region and a laptop with a wrong clock
 * zone agree with the desk.
 *
 * Consultations carry a time as well as a date and have their own helpers in
 * lib/consultations/ist.ts; this module is for date-only values.
 */

export const IST_TIME_ZONE = 'Asia/Kolkata'

/**
 * The IST calendar date of an instant, as `YYYY-MM-DD`.
 *
 * `en-CA` formats as ISO order, so the parts need no reassembly.
 */
export function istDate(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** Today in IST, `YYYY-MM-DD`. The default for every date-only field. */
export function istToday(): string {
  return istDate(new Date())
}

/** The current IST month, `YYYY-MM`. The default for month pickers and month filters. */
export function istMonth(instant: Date = new Date()): string {
  return istDate(instant).slice(0, 7)
}
