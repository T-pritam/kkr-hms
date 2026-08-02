/**
 * lib/patients/age — resolving a patient's age.
 *
 * `patient.age` was read by the detail header, the info tab and the discharge
 * summary PDF, and no such column ever existed, so all three printed nothing.
 *
 * The rule being tested is that a stated age and a date of birth are not the
 * same kind of fact. A birth date is exact forever. A stated age was true on the
 * day it was given and has to be carried forward — and must never be turned
 * back into a birth date, which would invent a fact that then prints on a
 * clinical document.
 */

import { describe, it, expect } from 'vitest'
import { formatAge, formatAgeSex, resolveAge } from '@/lib/patients/age'

const NOW = new Date('2026-08-02T10:00:00Z')

describe('resolveAge — from a date of birth', () => {
  it('counts completed years', () => {
    expect(resolveAge({ date_of_birth: '1981-01-15' }, NOW)).toEqual({ years: 45, source: 'dob' })
  })

  it('does not count a birthday that has not happened yet this year', () => {
    // Born in December, so on 2 August they are still 44.
    expect(resolveAge({ date_of_birth: '1981-12-15' }, NOW)!.years).toBe(44)
  })

  it('counts the birthday itself', () => {
    expect(resolveAge({ date_of_birth: '1981-08-02' }, NOW)!.years).toBe(45)
  })

  it('is 0 for a newborn rather than null', () => {
    expect(resolveAge({ date_of_birth: '2026-07-30' }, NOW)).toEqual({ years: 0, source: 'dob' })
  })

  /** Data entry gone wrong, not a negative age. */
  it('returns null for a birth date in the future', () => {
    expect(resolveAge({ date_of_birth: '2030-01-01' }, NOW)).toBeNull()
  })

  it('returns null for an unparseable date', () => {
    expect(resolveAge({ date_of_birth: 'not a date' }, NOW)).toBeNull()
  })

  /** The exact value wins; the stated one is only a fallback. */
  it('prefers the date of birth over a stated age', () => {
    const age = resolveAge(
      { date_of_birth: '1981-01-15', age_years: 12, age_recorded_on: '2026-01-01' },
      NOW,
    )
    expect(age).toEqual({ years: 45, source: 'dob' })
  })
})

describe('resolveAge — from a stated age', () => {
  it('uses the stated age when it was given today', () => {
    const age = resolveAge({ age_years: 45, age_recorded_on: '2026-08-02' }, NOW)
    expect(age).toEqual({ years: 45, source: 'stated' })
  })

  /** The whole reason age_recorded_on exists. */
  it('carries a stated age forward', () => {
    const age = resolveAge({ age_years: 45, age_recorded_on: '2023-08-02' }, NOW)
    expect(age).toEqual({ years: 48, source: 'stated' })
  })

  it('does not age it forward before the anniversary of the visit', () => {
    const age = resolveAge({ age_years: 45, age_recorded_on: '2025-12-01' }, NOW)
    expect(age!.years).toBe(45)
  })

  it('never goes backwards if the stamp is somehow in the future', () => {
    const age = resolveAge({ age_years: 45, age_recorded_on: '2030-01-01' }, NOW)
    expect(age!.years).toBe(45)
  })

  it('falls back to the stated value when there is no stamp at all', () => {
    expect(resolveAge({ age_years: 45 }, NOW)).toEqual({ years: 45, source: 'stated' })
  })
})

describe('resolveAge — nothing to go on', () => {
  it.each([
    ['an empty record', {}],
    ['explicit nulls', { date_of_birth: null, age_years: null }],
    ['a null patient', null],
    ['an undefined patient', undefined],
  ])('returns null for %s', (_label, patient) => {
    expect(resolveAge(patient as any, NOW)).toBeNull()
  })
})

describe('formatAge', () => {
  it('prints an exact age plainly', () => {
    expect(formatAge({ date_of_birth: '1981-01-15' }, NOW)).toBe('45')
  })

  /**
   * The tilde is not decoration. Whoever treats this patient next should be able
   * to tell a verified age from one somebody gave at a desk.
   */
  it('marks a stated age as approximate', () => {
    expect(formatAge({ age_years: 45, age_recorded_on: '2026-08-02' }, NOW)).toBe('~45')
  })

  it('returns an empty string rather than "NaN" when there is nothing to show', () => {
    expect(formatAge({}, NOW)).toBe('')
  })
})

describe('formatAgeSex', () => {
  it('joins the two', () => {
    expect(formatAgeSex({ date_of_birth: '1981-01-15', gender: 'Male' }, NOW)).toBe('45 / Male')
  })

  it('drops the missing half rather than printing a stray slash', () => {
    expect(formatAgeSex({ gender: 'Female' }, NOW)).toBe('Female')
    expect(formatAgeSex({ date_of_birth: '1981-01-15' }, NOW)).toBe('45')
  })

  it('returns an empty string when neither is known', () => {
    expect(formatAgeSex({}, NOW)).toBe('')
  })
})
