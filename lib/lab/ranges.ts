/**
 * Reference-interval resolution and abnormality derivation.
 *
 * This is the single source of truth: result entry, the API and the report PDF
 * all call in here, so what the technician sees while typing is exactly what
 * gets stored and printed.
 */

import type {
  AbnormalVerdict,
  ParameterRange,
  PatientContext,
  ResolvedRange,
  ResultInput,
  TestParameter,
} from './types'

const EMPTY: ResolvedRange = {
  refMin: null,
  refMax: null,
  display: '—',
  rangeType: 'between',
  criticalLow: null,
  criticalHigh: null,
  normalOptions: null,
}

function normaliseGender(g: string | null | undefined): string | null {
  const v = (g || '').trim().toLowerCase()
  return v === 'male' || v === 'female' || v === 'other' ? v : null
}

function trimNumber(n: number): string {
  // 13.00 → '13', 13.50 → '13.5'. Reference intervals read badly with trailing zeros.
  return String(Number(n))
}

/** Renders the interval the way it appears on the report. */
export function formatRange(r: Pick<
  ParameterRange,
  'range_type' | 'min_value' | 'max_value' | 'text_range' | 'display_text' | 'normal_options'
>): string {
  if (r.display_text) return r.display_text

  switch (r.range_type) {
    case 'between':
      if (r.min_value === null || r.max_value === null) return '—'
      return `${trimNumber(r.min_value)} - ${trimNumber(r.max_value)}`
    case 'less_than':
      return r.max_value === null ? '—' : `< ${trimNumber(r.max_value)}`
    case 'greater_than':
      return r.min_value === null ? '—' : `> ${trimNumber(r.min_value)}`
    case 'text':
      if (r.text_range) return r.text_range
      if (r.normal_options?.length) return r.normal_options.join(' / ')
      return '—'
    default:
      return '—'
  }
}

/**
 * Picks the interval that applies to this patient.
 *
 * Gender match beats gender-agnostic; an age band that actually contains the
 * patient beats an unbounded one. When the patient's age is unknown only
 * age-unbounded intervals are eligible — guessing an age band would silently
 * apply a paediatric range to an adult.
 *
 * Falls back to the legacy `min_value`/`max_value`/`male_*`/`female_*` columns
 * on the parameter when it has no `test_parameter_ranges` rows yet.
 */
export function resolveRange(
  parameter: TestParameter,
  ranges: ParameterRange[] | null | undefined,
  patient: PatientContext,
): ResolvedRange {
  const gender = normaliseGender(patient.gender)
  const age = typeof patient.ageYears === 'number' && isFinite(patient.ageYears)
    ? patient.ageYears
    : null

  const candidates = (ranges || []).filter(r => r.parameter_id === parameter.id)

  if (candidates.length > 0) {
    let best: { range: ParameterRange; score: number } | null = null

    for (const r of candidates) {
      const rGender = normaliseGender(r.gender)

      // Gender: exact match is most specific, null applies to everyone,
      // a different gender disqualifies the row entirely.
      let score: number
      if (rGender === null) score = 1
      else if (rGender === gender) score = 3
      else continue

      const bounded = r.age_min_years !== null || r.age_max_years !== null
      if (bounded) {
        if (age === null) continue
        if (r.age_min_years !== null && age < r.age_min_years) continue
        if (r.age_max_years !== null && age >= r.age_max_years) continue
        score += 2
      }

      if (!best || score > best.score ||
         (score === best.score && r.display_order < best.range.display_order)) {
        best = { range: r, score }
      }
    }

    if (best) {
      const r = best.range
      return {
        refMin: r.min_value,
        refMax: r.max_value,
        display: formatRange(r),
        rangeType: r.range_type,
        criticalLow: r.critical_low,
        criticalHigh: r.critical_high,
        normalOptions: r.normal_options,
      }
    }
  }

  // ── Legacy fallback ────────────────────────────────────────────────────────
  let refMin = parameter.min_value
  let refMax = parameter.max_value

  if (parameter.gender_specific && gender === 'male' &&
      parameter.male_min !== null && parameter.male_max !== null) {
    refMin = parameter.male_min
    refMax = parameter.male_max
  } else if (parameter.gender_specific && gender === 'female' &&
      parameter.female_min !== null && parameter.female_max !== null) {
    refMin = parameter.female_min
    refMax = parameter.female_max
  }

  if (refMin === null || refMax === null) return EMPTY

  return {
    refMin,
    refMax,
    display: `${trimNumber(refMin)} - ${trimNumber(refMax)}`,
    rangeType: 'between',
    criticalLow: null,
    criticalHigh: null,
    normalOptions: null,
  }
}

/**
 * Decides whether a result sits outside its interval.
 *
 * Criticality comes from the explicit `critical_low` / `critical_high` bounds on
 * the range row. The rule this replaces was `value < refMin*0.5 || value >
 * refMax*1.5`, which is wrong for any interval touching or spanning zero: a
 * bilirubin interval of 0–1.2 could never produce a critical result however
 * high the value went, and any interval with a negative bound inverted.
 */
export function deriveAbnormal(input: ResultInput, resolved: ResolvedRange): AbnormalVerdict {
  const { value, textValue } = input

  // ── Qualitative ────────────────────────────────────────────────────────────
  if (value === null || value === undefined) {
    const text = (textValue || '').trim()
    if (!text) return { abnormal: null, isCritical: false }

    if (resolved.normalOptions?.length) {
      const ok = resolved.normalOptions.some(o => o.trim().toLowerCase() === text.toLowerCase())
      return { abnormal: ok ? null : 'A', isCritical: false }
    }
    if (resolved.rangeType === 'text' && resolved.display !== '—') {
      const ok = resolved.display.trim().toLowerCase() === text.toLowerCase()
      return { abnormal: ok ? null : 'A', isCritical: false }
    }
    // Nothing declared as normal — cannot judge, so do not mark it.
    return { abnormal: null, isCritical: false }
  }

  if (!isFinite(value)) return { abnormal: null, isCritical: false }

  // ── Numeric ────────────────────────────────────────────────────────────────
  let abnormal: AbnormalVerdict['abnormal'] = null

  switch (resolved.rangeType) {
    case 'between':
      if (resolved.refMin !== null && value < resolved.refMin) abnormal = 'L'
      else if (resolved.refMax !== null && value > resolved.refMax) abnormal = 'H'
      break
    case 'less_than':
      // '< 200' means 200 itself is already out of range.
      if (resolved.refMax !== null && value >= resolved.refMax) abnormal = 'H'
      break
    case 'greater_than':
      if (resolved.refMin !== null && value <= resolved.refMin) abnormal = 'L'
      break
    case 'text':
      // A numeric result against a qualitative interval — nothing to compare.
      break
  }

  const isCritical =
    (resolved.criticalLow  !== null && value <= resolved.criticalLow) ||
    (resolved.criticalHigh !== null && value >= resolved.criticalHigh)

  // A critical result is by definition out of range, even if the interval
  // itself was left open on that side.
  if (isCritical && abnormal === null) {
    abnormal = resolved.criticalLow !== null && value <= resolved.criticalLow ? 'L' : 'H'
  }

  return { abnormal, isCritical }
}

/** Formats a numeric result to the parameter's declared precision. */
export function formatValue(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !isFinite(value)) return '—'
  return value.toFixed(Math.max(0, Math.min(6, decimals)))
}

/** Age in whole years from a date of birth. Returns null when unparseable. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null
  const born = new Date(dob)
  if (isNaN(born.getTime())) return null

  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age >= 0 ? age : null
}
