/**
 * Payload validation for the patient registry.
 *
 * The entire previous validation, on both POST and PUT, was:
 *
 *     if (!patient_id || !name) return 400
 *
 * No trim, no gender enum, no phone check, no date sanity. Gender was
 * pre-selected as "Male" in the form and never enforced, so an unanswered
 * question was stored as a fact — production ended up with rows reading "MALE"
 * that matched no dropdown option.
 *
 * One validator shared by POST, PUT and PATCH, because the lab module shipped
 * with POST enforcing invariants PUT did not (BUGS.md #59) and a record could be
 * edited into a state it could never have been created in.
 *
 * The user's constraint is that a walk-in can be registered in seconds, so only
 * four fields are required: name, patient ID, gender and phone. Date of birth,
 * address and everything medical stay optional and can be filled in later.
 */

import {
  BLOOD_GROUPS,
  FIELD_LABELS,
  GENDERS,
  ID_PROOF_TYPES,
  PATIENT_STATUSES,
  RELATIONS,
} from './constants'
import type { FieldErrors } from '@/lib/case-sheet/types'

/** Columns a client may write. Anything else in the body is ignored outright. */
export const PATIENT_WRITABLE = [
  'patient_id',
  'name',
  'gender',
  'phone',
  'alternate_phone',
  'date_of_birth',
  'date_of_join',
  'age_years',
  'blood_group',
  'email',
  'address',
  'referred_by',
  'emergency_contact_name',
  'emergency_contact_relation',
  'emergency_contact_phone',
  'id_proof_type',
  'id_proof_number',
  'medical_history',
  'allergies',
  'current_medications',
  'status',
] as const

/** The four the user chose. Everything else is optional by design. */
export const REQUIRED_FIELDS = ['patient_id', 'name', 'gender', 'phone'] as const

const DATE_FIELDS = ['date_of_birth', 'date_of_join'] as const

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/**
 * Coerces a request body into column values.
 *
 * Empty strings become NULL rather than `''`, and a field explicitly set to
 * blank really is cleared — the old PUT merged with `||`, so once an address was
 * written it could never be emptied again (the same shape as BUGS.md #63).
 */
export function normalisePatientBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}

  for (const field of PATIENT_WRITABLE) {
    if (body?.[field] === undefined) continue
    const value = body[field]

    if (blank(value)) {
      out[field] = null
      continue
    }

    if (field === 'age_years') {
      const n = Number(value)
      out[field] = Number.isFinite(n) ? Math.round(n) : value
      continue
    }

    out[field] = typeof value === 'string' ? value.trim() : value
  }

  // A stated age is only meaningful alongside the date it was stated, so the
  // two move together. Clearing the age clears the stamp with it.
  if ('age_years' in out) {
    out.age_recorded_on = out.age_years === null ? null : today()
  }

  return out
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface Validation {
  ok: boolean
  /** Per-field messages, so the form can mark the offending box. */
  errors: FieldErrors
}

const OK: Validation = { ok: true, errors: {} }

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** Digits only, so "+91 98765 43210" and "9876543210" are judged the same. */
const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

function checkPhone(errors: FieldErrors, field: string, value: unknown) {
  if (blank(value)) return
  const d = digits(value)
  if (d.length < 8 || d.length > 15) {
    errors[field] = `${FIELD_LABELS[field]} does not look like a valid number`
  }
}

export type ValidationMode = 'create' | 'update' | 'patch'

/**
 * Checks a create, update or partial-update payload.
 *
 * `patch` skips the required-field checks — the info tab patches one field at a
 * time and must not be forced to resend the whole record — but still validates
 * anything it *did* send. A field present and blank is still rejected if it is
 * one of the four.
 */
export function validatePatient(
  values: Record<string, any>,
  mode: ValidationMode = 'create',
): Validation {
  const errors: FieldErrors = {}
  const submitted = (field: string) => field in values

  for (const field of REQUIRED_FIELDS) {
    const mustHave = mode !== 'patch' || submitted(field)
    if (mustHave && blank(values[field])) {
      errors[field] = `${FIELD_LABELS[field]} is required`
    }
  }

  if (!blank(values.gender) && !(GENDERS as readonly string[]).includes(values.gender)) {
    errors.gender = 'Choose Male, Female or Other'
  }

  if (!blank(values.status) && !(PATIENT_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Choose one of the listed statuses'
  }

  if (!blank(values.blood_group) && !(BLOOD_GROUPS as readonly string[]).includes(values.blood_group)) {
    errors.blood_group = 'Choose one of the listed blood groups'
  }

  if (!blank(values.id_proof_type) && !(ID_PROOF_TYPES as readonly string[]).includes(values.id_proof_type)) {
    errors.id_proof_type = 'Choose one of the listed ID proofs'
  }

  if (
    !blank(values.emergency_contact_relation) &&
    !(RELATIONS as readonly string[]).includes(values.emergency_contact_relation)
  ) {
    errors.emergency_contact_relation = 'Choose one of the listed relations'
  }

  checkPhone(errors, 'phone', values.phone)
  checkPhone(errors, 'alternate_phone', values.alternate_phone)
  checkPhone(errors, 'emergency_contact_phone', values.emergency_contact_phone)

  if (!blank(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) {
    errors.email = 'Enter a valid email address'
  }

  // A date typed on a phone at 2am IST is "tomorrow" in UTC, so the future
  // check has a day of slack rather than rejecting a perfectly ordinary entry.
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)

  for (const field of DATE_FIELDS) {
    if (blank(values[field])) continue
    const d = parseDate(values[field])
    if (!d) {
      errors[field] = `${FIELD_LABELS[field]} is not a valid date`
    } else if (d > cutoff) {
      errors[field] = `${FIELD_LABELS[field]} cannot be in the future`
    }
  }

  const dob = parseDate(values.date_of_birth)
  const join = parseDate(values.date_of_join)
  if (dob && join && dob > join) {
    errors.date_of_birth = 'Date of birth cannot be after the date of joining'
  }

  if (!blank(values.age_years)) {
    const n = Number(values.age_years)
    if (!Number.isFinite(n) || n < 0 || n > 130) {
      errors.age_years = 'Enter an age between 0 and 130'
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : OK
}

/**
 * The first error, for clients that show one message rather than marking
 * fields. Keeps the old `{ error }` response shape working.
 */
export function firstError(errors: FieldErrors): string {
  const key = Object.keys(errors)[0]
  return key ? String(errors[key]) : 'Invalid request'
}
