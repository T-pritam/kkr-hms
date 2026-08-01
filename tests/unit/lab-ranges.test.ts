/**
 * lib/lab/ranges.ts — reference-interval resolution and abnormality derivation.
 *
 * This is the clinical core of the lab module: whatever it decides is what the
 * technician sees, what gets stored, and what prints on the patient's report.
 */

import { describe, it, expect } from 'vitest'
import { resolveRange, deriveAbnormal, formatRange, formatValue, ageFromDob } from '@/lib/lab/ranges'
import type { ParameterRange, TestParameter } from '@/lib/lab/types'

const param = (over: Partial<TestParameter> = {}): TestParameter => ({
  id: 'p1',
  test_id: 't1',
  name: 'Haemoglobin',
  code: 'HB',
  unit: 'g/dL',
  param_type: 'numeric',
  method: null,
  options: null,
  formula: null,
  decimals: 1,
  group_name: null,
  display_order: 0,
  is_active: true,
  min_value: null,
  max_value: null,
  gender_specific: false,
  male_min: null,
  male_max: null,
  female_min: null,
  female_max: null,
  ...over,
})

const range = (over: Partial<ParameterRange> = {}): ParameterRange => ({
  id: Math.random().toString(36).slice(2),
  parameter_id: 'p1',
  gender: null,
  age_min_years: null,
  age_max_years: null,
  range_type: 'between',
  min_value: null,
  max_value: null,
  text_range: null,
  display_text: null,
  normal_options: null,
  critical_low: null,
  critical_high: null,
  display_order: 0,
  ...over,
})

describe('resolveRange — selection', () => {
  it('picks the gender-specific interval over the gender-neutral one', () => {
    const ranges = [
      range({ gender: null,     min_value: 12, max_value: 16 }),
      range({ gender: 'male',   min_value: 13, max_value: 17 }),
      range({ gender: 'female', min_value: 12, max_value: 15 }),
    ]
    expect(resolveRange(param(), ranges, { ageYears: 30, gender: 'Male' }))
      .toMatchObject({ refMin: 13, refMax: 17 })
    expect(resolveRange(param(), ranges, { ageYears: 30, gender: 'female' }))
      .toMatchObject({ refMin: 12, refMax: 15 })
  })

  it('falls back to the gender-neutral interval for an unrecorded gender', () => {
    const ranges = [
      range({ gender: null,   min_value: 12, max_value: 16 }),
      range({ gender: 'male', min_value: 13, max_value: 17 }),
    ]
    expect(resolveRange(param(), ranges, { ageYears: 30, gender: null }))
      .toMatchObject({ refMin: 12, refMax: 16 })
  })

  it('picks the age band containing the patient', () => {
    const ranges = [
      range({ age_min_years: 0,  age_max_years: 1,  min_value: 14, max_value: 22 }),
      range({ age_min_years: 1,  age_max_years: 12, min_value: 11, max_value: 14 }),
      range({ age_min_years: 12, age_max_years: null, min_value: 13, max_value: 17 }),
    ]
    expect(resolveRange(param(), ranges, { ageYears: 0.5, gender: null })).toMatchObject({ refMin: 14 })
    expect(resolveRange(param(), ranges, { ageYears: 6,   gender: null })).toMatchObject({ refMin: 11 })
    expect(resolveRange(param(), ranges, { ageYears: 40,  gender: null })).toMatchObject({ refMin: 13 })
  })

  it('treats the age upper bound as exclusive so adjacent bands cannot both match', () => {
    const ranges = [
      range({ age_min_years: 0,  age_max_years: 12, min_value: 11, max_value: 14 }),
      range({ age_min_years: 12, age_max_years: 18, min_value: 13, max_value: 17 }),
    ]
    expect(resolveRange(param(), ranges, { ageYears: 12, gender: null })).toMatchObject({ refMin: 13 })
  })

  it('ignores age-banded intervals when the age is unknown', () => {
    // Applying a paediatric interval to an adult of unrecorded age would be worse
    // than showing no interval at all.
    const ranges = [
      range({ age_min_years: 0, age_max_years: 12, min_value: 11, max_value: 14 }),
      range({ gender: null, min_value: 13, max_value: 17 }),
    ]
    expect(resolveRange(param(), ranges, { ageYears: null, gender: null })).toMatchObject({ refMin: 13 })
  })

  it('prefers a gender+age match over gender alone', () => {
    const ranges = [
      range({ gender: 'male', min_value: 13, max_value: 17 }),
      range({ gender: 'male', age_min_years: 0, age_max_years: 12, min_value: 11, max_value: 14 }),
    ]
    expect(resolveRange(param(), ranges, { ageYears: 8, gender: 'male' })).toMatchObject({ refMin: 11 })
  })
})

describe('resolveRange — legacy fallback', () => {
  it('reads the old min_value/max_value columns when no range rows exist', () => {
    const p = param({ min_value: 13, max_value: 17 })
    expect(resolveRange(p, [], { ageYears: 30, gender: 'male' }))
      .toMatchObject({ refMin: 13, refMax: 17, display: '13 - 17' })
  })

  it('reads the old male_/female_ columns when gender_specific is set', () => {
    const p = param({
      gender_specific: true,
      min_value: 12, max_value: 16,
      male_min: 13, male_max: 17,
      female_min: 12, female_max: 15,
    })
    expect(resolveRange(p, [], { ageYears: 30, gender: 'male' })).toMatchObject({ refMin: 13, refMax: 17 })
    expect(resolveRange(p, [], { ageYears: 30, gender: 'female' })).toMatchObject({ refMin: 12, refMax: 15 })
  })

  it('returns an em-dash interval when the parameter has no bounds at all', () => {
    expect(resolveRange(param(), [], { ageYears: 30, gender: 'male' }))
      .toMatchObject({ refMin: null, refMax: null, display: '—' })
  })
})

describe('formatRange — what prints on the report', () => {
  it('renders each range type the way a lab report writes it', () => {
    expect(formatRange(range({ range_type: 'between', min_value: 13, max_value: 17 }))).toBe('13 - 17')
    expect(formatRange(range({ range_type: 'less_than', max_value: 200 }))).toBe('< 200')
    expect(formatRange(range({ range_type: 'greater_than', min_value: 40 }))).toBe('> 40')
    expect(formatRange(range({ range_type: 'text', text_range: 'Negative' }))).toBe('Negative')
  })

  it('joins qualitative options when no single text range is given', () => {
    expect(formatRange(range({ range_type: 'text', normal_options: ['Negative', 'Trace'] })))
      .toBe('Negative / Trace')
  })

  it('drops trailing zeros so intervals read cleanly', () => {
    expect(formatRange(range({ range_type: 'between', min_value: 13.0, max_value: 17.50 }))).toBe('13 - 17.5')
  })

  it('lets display_text override everything', () => {
    expect(formatRange(range({ range_type: 'between', min_value: 1, max_value: 2, display_text: 'Up to 5' })))
      .toBe('Up to 5')
  })
})

describe('deriveAbnormal — numeric', () => {
  const between = resolveRange(param(), [range({ min_value: 13, max_value: 17 })], { ageYears: 30, gender: null })

  it('marks values below and above the interval', () => {
    expect(deriveAbnormal({ value: 11 }, between)).toEqual({ abnormal: 'L', isCritical: false })
    expect(deriveAbnormal({ value: 19 }, between)).toEqual({ abnormal: 'H', isCritical: false })
  })

  it('leaves values inside the interval unmarked, bounds included', () => {
    expect(deriveAbnormal({ value: 15 }, between)).toEqual({ abnormal: null, isCritical: false })
    expect(deriveAbnormal({ value: 13 }, between)).toEqual({ abnormal: null, isCritical: false })
    expect(deriveAbnormal({ value: 17 }, between)).toEqual({ abnormal: null, isCritical: false })
  })

  it('treats the bound of a "less than" interval as already out of range', () => {
    const lt = resolveRange(param(), [range({ range_type: 'less_than', max_value: 200 })], { ageYears: 30, gender: null })
    expect(deriveAbnormal({ value: 199 }, lt).abnormal).toBeNull()
    expect(deriveAbnormal({ value: 200 }, lt).abnormal).toBe('H')
    expect(deriveAbnormal({ value: 240 }, lt).abnormal).toBe('H')
  })

  it('handles a "greater than" interval', () => {
    const gt = resolveRange(param(), [range({ range_type: 'greater_than', min_value: 40 })], { ageYears: 30, gender: null })
    expect(deriveAbnormal({ value: 55 }, gt).abnormal).toBeNull()
    expect(deriveAbnormal({ value: 40 }, gt).abnormal).toBe('L')
    expect(deriveAbnormal({ value: 20 }, gt).abnormal).toBe('L')
  })
})

describe('deriveAbnormal — criticality', () => {
  it('uses the explicit critical bounds', () => {
    const r = resolveRange(
      param(),
      [range({ min_value: 13, max_value: 17, critical_low: 7, critical_high: 20 })],
      { ageYears: 30, gender: null },
    )
    expect(deriveAbnormal({ value: 12 }, r)).toEqual({ abnormal: 'L', isCritical: false })
    expect(deriveAbnormal({ value: 6 },  r)).toEqual({ abnormal: 'L', isCritical: true })
    expect(deriveAbnormal({ value: 21 }, r)).toEqual({ abnormal: 'H', isCritical: true })
  })

  it('does not invent criticality for an interval that touches zero (BUGS.md #60)', () => {
    // The rule this replaces was `value < refMin*0.5 || value > refMax*1.5`.
    // With refMin = 0 that lower test is `value < 0` — unreachable — while a
    // bilirubin of 8.0 against 0-1.2 sailed past as merely "high".
    const r = resolveRange(param(), [range({ min_value: 0, max_value: 1.2 })], { ageYears: 30, gender: null })
    expect(deriveAbnormal({ value: 0 },   r)).toEqual({ abnormal: null, isCritical: false })
    expect(deriveAbnormal({ value: 8.0 }, r)).toEqual({ abnormal: 'H',  isCritical: false })

    const withCritical = resolveRange(
      param(),
      [range({ min_value: 0, max_value: 1.2, critical_high: 5 })],
      { ageYears: 30, gender: null },
    )
    expect(deriveAbnormal({ value: 8.0 }, withCritical)).toEqual({ abnormal: 'H', isCritical: true })
  })

  it('marks a critical result out of range even when that side of the interval is open', () => {
    const r = resolveRange(
      param(),
      [range({ range_type: 'greater_than', min_value: 40, critical_high: 300 })],
      { ageYears: 30, gender: null },
    )
    expect(deriveAbnormal({ value: 400 }, r)).toEqual({ abnormal: 'H', isCritical: true })
  })
})

describe('deriveAbnormal — qualitative', () => {
  const qual = resolveRange(
    param({ param_type: 'qualitative' }),
    [range({ range_type: 'text', normal_options: ['Negative'] })],
    { ageYears: 30, gender: null },
  )

  it('marks a result outside the normal options', () => {
    expect(deriveAbnormal({ textValue: 'Negative' }, qual)).toEqual({ abnormal: null, isCritical: false })
    expect(deriveAbnormal({ textValue: 'negative' }, qual)).toEqual({ abnormal: null, isCritical: false })
    expect(deriveAbnormal({ textValue: 'Positive' }, qual)).toEqual({ abnormal: 'A',  isCritical: false })
  })

  it('does not guess when nothing is declared normal', () => {
    const undeclared = resolveRange(param(), [], { ageYears: 30, gender: null })
    expect(deriveAbnormal({ textValue: 'Positive' }, undeclared)).toEqual({ abnormal: null, isCritical: false })
  })

  it('leaves a blank result unmarked', () => {
    expect(deriveAbnormal({ textValue: '' }, qual)).toEqual({ abnormal: null, isCritical: false })
    expect(deriveAbnormal({ value: null }, qual)).toEqual({ abnormal: null, isCritical: false })
  })
})

describe('helpers', () => {
  it('formats values to the declared precision', () => {
    expect(formatValue(13.256, 2)).toBe('13.26')
    expect(formatValue(13, 0)).toBe('13')
    expect(formatValue(null)).toBe('—')
  })

  it('computes age in whole years, not fractions of 365.25 days', () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 42)
    expect(ageFromDob(d.toISOString())).toBe(42)
    expect(ageFromDob(null)).toBeNull()
    expect(ageFromDob('not a date')).toBeNull()
  })
})
