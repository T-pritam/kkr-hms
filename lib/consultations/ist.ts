/**
 * The IST clock for consultations.
 *
 * A consultation is stored as a UTC instant in `patient_consultations.consultation_date`,
 * but it is entered and read as an Indian wall-clock date and time. The old code did that
 * conversion in three different places on three different bases:
 *
 *   - the write pinned IST      — `new Date(\`${date}T${time}:00+05:30\`)`
 *   - the edit prefill read the date in UTC   — `d.toISOString().split('T')[0]`
 *   - and the time in browser-local           — `d.toTimeString().slice(0, 5)`
 *
 * So editing a visit and saving it again moved it. On an IST browser anything stored
 * between 00:00 and 05:29 IST jumped a full day backwards, every single time it was
 * edited; on a non-IST browser every visit drifted by that browser's offset from IST and
 * kept drifting on each subsequent save. Nothing surfaced the change — the row simply
 * reappeared under a different date.
 *
 * Everything now goes through here, so the read and the write cannot disagree: they are
 * literal inverses, and `tests/unit/consultation-ist.test.ts` asserts that.
 *
 * Note this is deliberately not the `todayLocal()` helper the other form modals copy
 * around (patient-form-modal.tsx, employee-form-modal.tsx). That one returns the
 * *browser's* calendar date, which is right for a plain date column. A consultation
 * carries a time and is pinned to IST, so its default, its bounds and its timestamp all
 * have to come off the same clock — `istNowFields()` is this module's equivalent.
 */

const IST = 'Asia/Kolkata'

/**
 * Postgres hands back `+00:00`, which Safari refuses to parse. Every read goes through
 * here so the fix cannot be applied in one code path and forgotten in another — which is
 * exactly what happened before: the table rendered fine while the edit prefill was NaN.
 */
export function parseStoredInstant(value: string): Date {
  return new Date(String(value).replace(/\+00:00$/, 'Z'))
}

/**
 * `Intl.DateTimeFormat.formatToParts` throws a RangeError on an invalid date, and both
 * callers below run during render — so an unreadable timestamp on one row would take out
 * the whole visits tab rather than just that row.
 */
const isValid = (d: Date) => !Number.isNaN(d.getTime())

/**
 * The IST calendar date and wall-clock time of an instant, as a date input and a time
 * input want them.
 *
 * Both halves come out of a single `formatToParts` call. Deriving them separately is what
 * broke before, and `hourCycle: 'h23'` rather than `hour12: false` because some ICU builds
 * render midnight as `24` under the latter, which a time input rejects.
 */
export function istFields(date: Date): { date: string; time: string } {
  // Blank rather than a substituted "now": if a stored timestamp cannot be read, the form
  // should make someone re-enter it, not quietly invent one and save it back.
  if (!isValid(date)) return { date: '', time: '' }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: string) => parts.find(p => p.type === type)?.value || ''

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/** Now, in IST. The default for a new consultation and the ceiling for the date field. */
export function istNowFields(): { date: string; time: string } {
  return istFields(new Date())
}

/**
 * The inverse of `istFields`: an IST date and time back to the UTC instant that gets
 * stored. A blank time is treated as midnight so a half-filled form still round-trips.
 */
export function toISTInstant(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}:00+05:30`).toISOString()
}

/** Display form, e.g. `2nd Feb 2026 6:34 PM`. */
export function formatIST(value: string): string {
  const date = parseStoredInstant(value)
  if (!isValid(date)) return '—'

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)

  const get = (type: string) => parts.find(p => p.type === type)?.value || ''

  const day = Number(get('day'))
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st' :
      day % 10 === 2 && day !== 12 ? 'nd' :
        day % 10 === 3 && day !== 13 ? 'rd' :
          'th'

  return `${day}${suffix} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`
}
