/**
 * Payload validation for the test master.
 *
 * Shared deliberately: the old module validated reference-interval invariants
 * on POST but not on PUT, so a valid parameter could be edited into an
 * unusable state through the back door (BUGS.md #59).
 */

import { isValidFormula } from './formula'
import type { ParamType, RangeType } from './types'

const PARAM_TYPES: ParamType[] = ['numeric', 'qualitative', 'calculated']
const RANGE_TYPES: RangeType[] = ['between', 'less_than', 'greater_than', 'text']

export interface Validation {
  ok: boolean
  error?: string
}

const OK: Validation = { ok: true }
const fail = (error: string): Validation => ({ ok: false, error })

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

const RANGE_WRITABLE = [
  'gender', 'age_min_years', 'age_max_years', 'range_type',
  'min_value', 'max_value', 'text_range', 'display_text',
  'normal_options', 'critical_low', 'critical_high', 'display_order',
] as const

/** Coerces a reference-interval request body into column values. */
export function normaliseRangeBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const field of RANGE_WRITABLE) {
    if (body?.[field] === undefined) continue
    switch (field) {
      case 'age_min_years':
      case 'age_max_years':
      case 'min_value':
      case 'max_value':
      case 'critical_low':
      case 'critical_high':
        out[field] = num(body[field])
        break
      case 'display_order':
        out[field] = Number(body[field]) || 0
        break
      case 'gender':
        out[field] = body[field] ? String(body[field]).toLowerCase() : null
        break
      case 'normal_options':
        out[field] = Array.isArray(body[field]) && body[field].length ? body[field] : null
        break
      default:
        out[field] = body[field] === '' ? null : body[field]
    }
  }
  return out
}

/**
 * Validates a reference-interval row.
 *
 * `partial` allows a PUT that only touches, say, `critical_high` — the merged
 * row is what gets validated, so callers should merge before calling.
 */
export function validateRangePayload(body: any): Validation {
  const rangeType = body?.range_type ?? 'between'
  if (!RANGE_TYPES.includes(rangeType)) {
    return fail(`range_type must be one of: ${RANGE_TYPES.join(', ')}`)
  }

  const min = num(body?.min_value)
  const max = num(body?.max_value)

  switch (rangeType) {
    case 'between':
      if (min === null || max === null) return fail('A "between" interval needs both a minimum and a maximum')
      if (min > max) return fail('The minimum cannot be greater than the maximum')
      break
    case 'less_than':
      if (max === null) return fail('A "less than" interval needs a maximum')
      break
    case 'greater_than':
      if (min === null) return fail('A "greater than" interval needs a minimum')
      break
    case 'text': {
      const hasText = typeof body?.text_range === 'string' && body.text_range.trim() !== ''
      const hasOptions = Array.isArray(body?.normal_options) && body.normal_options.length > 0
      if (!hasText && !hasOptions) {
        return fail('A text interval needs either an expected value or a list of normal options')
      }
      break
    }
  }

  const ageMin = num(body?.age_min_years)
  const ageMax = num(body?.age_max_years)
  if (ageMin !== null && ageMin < 0) return fail('Age cannot be negative')
  if (ageMin !== null && ageMax !== null && ageMin >= ageMax) {
    return fail('The age band start must be before its end')
  }

  const gender = body?.gender
  if (gender !== null && gender !== undefined && gender !== '' &&
      !['male', 'female', 'other'].includes(String(gender).toLowerCase())) {
    return fail('Gender must be male, female, other, or left blank for any')
  }

  const criticalLow = num(body?.critical_low)
  const criticalHigh = num(body?.critical_high)
  if (criticalLow !== null && criticalHigh !== null && criticalLow >= criticalHigh) {
    return fail('The critical low must be below the critical high')
  }
  if (criticalLow !== null && min !== null && criticalLow > min) {
    return fail('The critical low should sit below the interval minimum')
  }
  if (criticalHigh !== null && max !== null && criticalHigh < max) {
    return fail('The critical high should sit above the interval maximum')
  }

  return OK
}

const PARAM_WRITABLE = [
  'name', 'code', 'unit', 'param_type', 'method', 'options', 'formula',
  'decimals', 'group_name', 'display_order', 'is_active',
  // Legacy interval columns, still written so an installation that has not yet
  // moved a parameter onto test_parameter_ranges keeps working.
  'min_value', 'max_value', 'gender_specific',
  'male_min', 'male_max', 'female_min', 'female_max',
] as const

/** Coerces a parameter request body into column values. */
export function normaliseParameterBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const field of PARAM_WRITABLE) {
    if (body?.[field] === undefined) continue
    switch (field) {
      case 'min_value':
      case 'max_value':
      case 'male_min':
      case 'male_max':
      case 'female_min':
      case 'female_max':
        out[field] = num(body[field])
        break
      case 'decimals':
        out[field] = num(body[field]) ?? 2
        break
      case 'display_order':
        out[field] = Number(body[field]) || 0
        break
      case 'gender_specific':
      case 'is_active':
        out[field] = !!body[field]
        break
      case 'code':
        out[field] = body[field] ? String(body[field]).trim().toUpperCase() : null
        break
      case 'options':
        out[field] = Array.isArray(body[field]) && body[field].length
          ? body[field].map((o: unknown) => String(o).trim()).filter(Boolean)
          : null
        break
      case 'name':
        out[field] = String(body[field]).trim()
        break
      default:
        out[field] = body[field] === '' ? null : body[field]
    }
  }
  return out
}

/** Validates a parameter definition. Applied identically on create and update. */
export function validateParameterPayload(body: any): Validation {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('Parameter name is required')

  const paramType: ParamType = body?.param_type ?? 'numeric'
  if (!PARAM_TYPES.includes(paramType)) {
    return fail(`param_type must be one of: ${PARAM_TYPES.join(', ')}`)
  }

  const decimals = num(body?.decimals)
  if (decimals !== null && (decimals < 0 || decimals > 6 || !Number.isInteger(decimals))) {
    return fail('Decimal places must be a whole number between 0 and 6')
  }

  if (body?.code !== null && body?.code !== undefined && body.code !== '') {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(String(body.code))) {
      return fail('Parameter code must start with a letter and contain only letters, digits and underscores')
    }
  }

  if (paramType === 'qualitative') {
    const options = body?.options
    if (!Array.isArray(options) || options.length < 2) {
      return fail('A qualitative parameter needs at least two options')
    }
    if (options.some((o: unknown) => typeof o !== 'string' || !o.trim())) {
      return fail('Qualitative options must all be non-empty text')
    }
  }

  if (paramType === 'calculated') {
    if (!body?.formula || !String(body.formula).trim()) {
      return fail('A calculated parameter needs a formula')
    }
    if (!isValidFormula(body.formula)) {
      return fail('The formula is not valid. Use parameter codes in braces with + - * / and parentheses, e.g. {ALB} / ({TP} - {ALB})')
    }
    if (!body?.code || !String(body.code).trim()) {
      // Without a code nothing else can reference this parameter, and it is the
      // only way to spot a self-reference.
      return fail('A calculated parameter needs its own code as well')
    }
  }

  return OK
}
