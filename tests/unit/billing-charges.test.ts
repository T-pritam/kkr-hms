/**
 * lib/billing/validate.ts — the pure logic behind date-range charges.
 *
 * `expandDateRange` is worth testing directly because getting it wrong bills a
 * patient for a night they were not there, and month and year boundaries are
 * where date arithmetic usually breaks.
 */

import { describe, it, expect } from 'vitest'
import {
  dayCount,
  expandDateRange,
  isValidDate,
  normalisePatientChargeBody,
  validatePatientCharge,
} from '@/lib/billing/validate'

describe('expandDateRange', () => {
  it('includes both ends', () => {
    expect(expandDateRange('2026-08-01', '2026-08-04')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ])
  })

  it('returns the single day when both ends are the same', () => {
    expect(expandDateRange('2026-08-01', '2026-08-01')).toEqual(['2026-08-01'])
  })

  it('crosses a month boundary', () => {
    expect(expandDateRange('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('crosses a year boundary', () => {
    expect(expandDateRange('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01'])
  })

  it('handles a leap day', () => {
    expect(expandDateRange('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })

  it('returns nothing when the range runs backwards', () => {
    expect(expandDateRange('2026-08-04', '2026-08-01')).toEqual([])
  })

  it('agrees with dayCount', () => {
    expect(expandDateRange('2026-08-01', '2026-08-12')).toHaveLength(
      dayCount('2026-08-01', '2026-08-12'),
    )
  })
})

describe('isValidDate', () => {
  it('accepts a real date', () => {
    expect(isValidDate('2026-08-01')).toBe(true)
  })

  it('rejects a day that does not exist, which Date would happily roll over', () => {
    expect(isValidDate('2026-02-31')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(isValidDate('01/08/2026')).toBe(false)
    expect(isValidDate('2026-8-1')).toBe(false)
    expect(isValidDate('')).toBe(false)
    expect(isValidDate(null)).toBe(false)
  })
})

describe('validatePatientCharge', () => {
  const charge = (overrides: Record<string, unknown> = {}) =>
    normalisePatientChargeBody({ charge_type: 'X-Ray', amount: 500, ...overrides })

  it('accepts a plain one-time charge', () => {
    expect(validatePatientCharge(charge()).ok).toBe(true)
  })

  it('rejects a missing, zero or negative amount', () => {
    expect(validatePatientCharge(charge({ amount: undefined })).ok).toBe(false)
    expect(validatePatientCharge(charge({ amount: 0 })).ok).toBe(false)
    expect(validatePatientCharge(charge({ amount: -1 })).ok).toBe(false)
  })

  it('rejects an amount that is not a number', () => {
    expect(validatePatientCharge(charge({ amount: 'free' })).ok).toBe(false)
    // '' and null both coerce to 0 through Number(), which is how an amount-less
    // charge used to be stored as free.
    expect(validatePatientCharge(charge({ amount: '' })).ok).toBe(false)
    expect(validatePatientCharge(charge({ amount: null })).ok).toBe(false)
  })

  it('requires a name when there is no catalogue entry', () => {
    expect(validatePatientCharge(charge({ charge_type: '' })).ok).toBe(false)
    // ...but a catalogue id is enough on its own.
    expect(
      validatePatientCharge(charge({ charge_type: '', charge_item_id: 'ci1' })).ok,
    ).toBe(true)
  })

  it('rejects a fractional or sub-one quantity', () => {
    expect(validatePatientCharge(charge({ qty: 0 })).ok).toBe(false)
    expect(validatePatientCharge(charge({ qty: 1.5 })).ok).toBe(false)
  })

  it('defaults the quantity to one', () => {
    expect(charge().qty).toBe(1)
  })

  it('requires both ends of a per-day range', () => {
    const perDay = (overrides: Record<string, unknown>) =>
      validatePatientCharge(charge({ billing_mode: 'per_day', ...overrides }))

    expect(perDay({ from_date: '2026-08-01' }).ok).toBe(false)
    expect(perDay({ to_date: '2026-08-04' }).ok).toBe(false)
    expect(perDay({ from_date: '2026-08-01', to_date: '2026-08-04' }).ok).toBe(true)
  })

  it('rejects a backwards range and one beyond the cap', () => {
    const perDay = (from: string, to: string) =>
      validatePatientCharge(charge({ billing_mode: 'per_day', from_date: from, to_date: to }))

    expect(perDay('2026-08-10', '2026-08-01').ok).toBe(false)
    expect(perDay('2026-08-01', '2062-08-01').ok).toBe(false)
  })

  it('reads qty_per_day as the quantity for a range', () => {
    expect(normalisePatientChargeBody({ qty_per_day: 2 }).qty).toBe(2)
  })
})


/**
 * Per-hour charges — the mode oxygen exists for.
 *
 * The hours are typed per day rather than derived from clock times, and each day
 * becomes its own row with the hours as that row's `qty`. What matters here is
 * that a day cannot slip through without hours on it, and that the same day
 * cannot appear twice — either one silently mis-bills the stay.
 */
describe('validatePatientCharge — per_hour', () => {
  const hourly = (hour_lines: unknown) =>
    validatePatientCharge(
      normalisePatientChargeBody({
        charge_type: 'Oxygen',
        amount: 200,
        billing_mode: 'per_hour',
        hour_lines,
      }),
    )

  it('accepts a list of days each carrying hours', () => {
    expect(
      hourly([
        { charge_date: '2026-08-04', hours: 6 },
        { charge_date: '2026-08-05', hours: 12 },
      ]).ok,
    ).toBe(true)
  })

  it('rejects an empty list — every day was removed', () => {
    expect(hourly([]).ok).toBe(false)
    expect(hourly(undefined).ok).toBe(false)
  })

  it('rejects a day with missing, zero or fractional hours', () => {
    expect(hourly([{ charge_date: '2026-08-04' }]).ok).toBe(false)
    expect(hourly([{ charge_date: '2026-08-04', hours: 0 }]).ok).toBe(false)
    expect(hourly([{ charge_date: '2026-08-04', hours: 2.5 }]).ok).toBe(false)
  })

  it('rejects an invalid date', () => {
    expect(hourly([{ charge_date: '2026-02-31', hours: 3 }]).ok).toBe(false)
    expect(hourly([{ charge_date: 'yesterday', hours: 3 }]).ok).toBe(false)
  })

  it('rejects the same day listed twice, which would double-bill it', () => {
    expect(
      hourly([
        { charge_date: '2026-08-04', hours: 6 },
        { charge_date: '2026-08-04', hours: 4 },
      ]).ok,
    ).toBe(false)
  })

  it('rejects more days than one entry may cover', () => {
    const tooMany = Array.from({ length: 181 }, (_, i) => ({
      charge_date: expandDateRange('2026-01-01', '2026-12-31')[i],
      hours: 1,
    }))
    expect(hourly(tooMany).ok).toBe(false)
  })

  it('does not require from/to dates — the days are sent explicitly', () => {
    const values = normalisePatientChargeBody({
      charge_type: 'Oxygen',
      amount: 200,
      billing_mode: 'per_hour',
      hour_lines: [{ charge_date: '2026-08-04', hours: 6 }],
    })
    expect(values.from_date).toBeNull()
    expect(values.to_date).toBeNull()
    expect(validatePatientCharge(values).ok).toBe(true)
  })
})
