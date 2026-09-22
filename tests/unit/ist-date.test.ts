/**
 * lib/dates/ist.ts — date-only defaults on the hospital's clock (CR-14).
 */

import { describe, it, expect, vi } from 'vitest'
import { istDate, istMonth, istToday } from '@/lib/dates/ist'

describe('istToday', () => {
  it('is the IST date, not the UTC date, just after midnight in India', () => {
    // 01:30 IST on the 22nd is still 20:00 UTC on the 21st.
    vi.setSystemTime(new Date('2026-09-21T20:00:00.000Z'))

    expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-21')
    expect(istToday()).toBe('2026-09-22')
  })

  it('matches the UTC date in the middle of the day', () => {
    vi.setSystemTime(new Date('2026-03-15T10:30:00.000Z'))

    expect(istToday()).toBe('2026-03-15')
  })

  it('rolls over at 00:00 IST, not at 00:00 UTC', () => {
    vi.setSystemTime(new Date('2026-09-21T18:29:59.000Z')) // 23:59:59 IST
    expect(istToday()).toBe('2026-09-21')

    vi.setSystemTime(new Date('2026-09-21T18:30:00.000Z')) // 00:00:00 IST
    expect(istToday()).toBe('2026-09-22')
  })
})

describe('istDate / istMonth', () => {
  it('formats any instant as its IST calendar date', () => {
    expect(istDate(new Date('2026-12-31T19:00:00.000Z'))).toBe('2027-01-01')
  })

  it('gives the IST month, which can differ from the UTC month on the 1st', () => {
    expect(istMonth(new Date('2026-09-30T20:00:00.000Z'))).toBe('2026-10')
  })
})
