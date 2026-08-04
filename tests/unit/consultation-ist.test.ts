/**
 * lib/consultations/ist — the IST round trip for a consultation timestamp.
 *
 * The defect this guards against did not throw and did not warn. Opening a visit in the
 * edit form and pressing save moved it: the prefill read the date in UTC and the time in
 * browser-local, while the write pinned IST. On an IST browser anything between 00:00 and
 * 05:29 IST jumped a whole day backwards on every edit; on a browser in any other zone
 * every visit drifted by that zone's offset from IST, and kept drifting each time it was
 * saved again.
 *
 * So the property that matters is not "the conversion looks right" but that the two
 * halves are exact inverses — `toISTInstant(istFields(x)) === x` — and that this holds
 * regardless of where the browser thinks it is. The cases below are the boundaries: the
 * corrupting window, both sides of IST midnight, and the last minute of an IST day.
 */

import { describe, it, expect } from 'vitest'
import { formatIST, istFields, parseStoredInstant, toISTInstant } from '@/lib/consultations/ist'

/** Stored instant → the IST date and time it should present as. */
const CASES: [string, string, string][] = [
  ['2026-03-12T19:00:00.000Z', '2026-03-13', '00:30'], // 00:30 IST — the window that lost a day
  ['2026-03-12T18:30:00.000Z', '2026-03-13', '00:00'], // exactly IST midnight
  ['2026-03-12T18:29:00.000Z', '2026-03-12', '23:59'], // one minute before it
  ['2026-03-12T13:00:00.000Z', '2026-03-12', '18:30'], // an ordinary evening visit
  ['2026-01-01T06:00:00.000Z', '2026-01-01', '11:30'], // midday, no date crossing
]

describe('istFields — reading a stored instant', () => {
  it.each(CASES)('%s is %s %s in IST', (stored, date, time) => {
    expect(istFields(parseStoredInstant(stored))).toEqual({ date, time })
  })

  /**
   * Both halves come from one formatToParts call. Deriving them separately is the
   * original bug, so this asserts they describe the same moment rather than checking
   * each in isolation.
   */
  it('never reports a date and time from different days', () => {
    const { date, time } = istFields(parseStoredInstant('2026-03-12T19:00:00.000Z'))
    expect(toISTInstant(date, time)).toBe('2026-03-12T19:00:00.000Z')
  })
})

describe('toISTInstant — writing back', () => {
  it.each(CASES)('%s round-trips unchanged', (stored) => {
    const { date, time } = istFields(parseStoredInstant(stored))
    expect(toISTInstant(date, time)).toBe(stored)
  })

  /** Editing and saving repeatedly must not walk the timestamp. */
  it('is stable across repeated edit-and-save cycles', () => {
    let value = '2026-03-12T19:00:00.000Z'
    for (let i = 0; i < 5; i++) {
      const { date, time } = istFields(parseStoredInstant(value))
      value = toISTInstant(date, time)
    }
    expect(value).toBe('2026-03-12T19:00:00.000Z')
  })

  it('matches the wire format the API normalises to', () => {
    expect(toISTInstant('2026-03-12', '18:30')).toBe('2026-03-12T13:00:00.000Z')
  })

  it('treats a blank time as IST midnight', () => {
    expect(toISTInstant('2026-03-12', '')).toBe('2026-03-11T18:30:00.000Z')
  })
})

describe('parseStoredInstant', () => {
  /**
   * PostgREST returns `+00:00`; Safari will not parse it. The table row was normalising
   * this and the edit prefill was not, so the prefill was NaN on Safari alone.
   */
  it('reads the +00:00 form Postgres returns', () => {
    expect(parseStoredInstant('2026-03-12T13:00:00+00:00').toISOString())
      .toBe('2026-03-12T13:00:00.000Z')
  })

  it('agrees with the Z form', () => {
    expect(parseStoredInstant('2026-03-12T13:00:00+00:00').getTime())
      .toBe(parseStoredInstant('2026-03-12T13:00:00.000Z').getTime())
  })
})

/**
 * formatToParts throws a RangeError on an invalid date, and both of these run during
 * render — one unreadable timestamp would blank the entire visits tab instead of one row.
 */
describe('an unreadable timestamp', () => {
  it.each([null, undefined, '', 'not a date'])('formatIST(%s) renders a dash', (value) => {
    expect(formatIST(value as any)).toBe('—')
  })

  it.each([null, undefined, '', 'not a date'])('istFields(%s) is blank, not invented', (value) => {
    expect(istFields(parseStoredInstant(value as any))).toEqual({ date: '', time: '' })
  })
})

describe('formatIST', () => {
  // en-IN renders the day period lowercase, and the casing has moved between ICU
  // builds. Compare case-insensitively so this asserts the format, not the platform.
  const shown = (v: string) => formatIST(v).toLowerCase()

  it('renders IST with an ordinal suffix', () => {
    expect(shown('2026-02-02T13:04:00.000Z')).toBe('2nd feb 2026 6:34 pm')
  })

  it.each([
    ['2026-02-01T06:00:00.000Z', '1st Feb 2026'],
    ['2026-02-03T06:00:00.000Z', '3rd Feb 2026'],
    ['2026-02-04T06:00:00.000Z', '4th Feb 2026'],
    ['2026-02-11T06:00:00.000Z', '11th Feb 2026'], // not 11st
    ['2026-02-12T06:00:00.000Z', '12th Feb 2026'], // not 12nd
    ['2026-02-13T06:00:00.000Z', '13th Feb 2026'], // not 13rd
    ['2026-02-21T06:00:00.000Z', '21st Feb 2026'],
  ])('%s starts with %s', (stored, expected) => {
    expect(formatIST(stored).startsWith(expected)).toBe(true)
  })

  it('shows the IST day, not the UTC one', () => {
    // 23:00 UTC on the 12th is 04:30 IST on the 13th.
    expect(shown('2026-02-12T23:00:00.000Z')).toBe('13th feb 2026 4:30 am')
  })
})
