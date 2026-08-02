/**
 * Payload validation for the employee registry.
 *
 * The rules for the four original fields are carried across **unchanged** — name
 * 2–100 characters, designation required and at most 50, base salary greater
 * than zero, status one of two values. The brief was not to alter existing
 * behaviour, so an input that was accepted before is still accepted, and the
 * error text is the same. What changes is that one validator now serves POST,
 * PUT and PATCH instead of three hand-written copies that had already drifted,
 * and errors come back per field so the form can mark the box.
 *
 * The new fields are all optional. Registration still needs exactly what it
 * needed yesterday.
 */

import { DESIGNATIONS, EMPLOYEE_STATUSES, FIELD_LABELS, GENDERS, ID_PROOF_TYPES, RELATIONS } from './constants'
import type { FieldErrors } from '@/lib/case-sheet/types'

/** Columns a client may write. Anything else in the body is ignored outright. */
export const EMPLOYEE_WRITABLE = [
  'employee_code',
  'name',
  'designation',
  'base_salary',
  'join_date',
  'status',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_relation',
  'emergency_contact_phone',
  'date_of_birth',
  'gender',
  'id_proof_type',
  'id_proof_number',
  'bank_account_no',
  'bank_ifsc',
] as const

/** Unchanged from the original handlers. */
export const REQUIRED_FIELDS = ['name', 'designation', 'base_salary'] as const

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

export function normaliseEmployeeBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}

  for (const field of EMPLOYEE_WRITABLE) {
    if (body?.[field] === undefined) continue
    const value = body[field]

    if (blank(value)) {
      out[field] = null
      continue
    }

    if (field === 'base_salary') {
      const n = Number.parseFloat(String(value))
      out[field] = Number.isFinite(n) ? n : value
      continue
    }

    out[field] = typeof value === 'string' ? value.trim() : value
  }

  return out
}

export interface Validation {
  ok: boolean
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
 * `patch` skips the required-field checks — a partial update must not be forced
 * to resend the whole record — but still validates whatever it did send.
 */
export function validateEmployee(
  values: Record<string, any>,
  mode: ValidationMode = 'create',
): Validation {
  const errors: FieldErrors = {}
  const submitted = (field: string) => field in values

  // Name: 2–100 characters, exactly as before.
  if (mode !== 'patch' || submitted('name')) {
    const name = typeof values.name === 'string' ? values.name.trim() : ''
    if (!name || name.length < 2 || name.length > 100) {
      errors.name = 'Name must be between 2 and 100 characters'
    }
  }

  // Designation: required, at most 50 characters, exactly as before. The list
  // is offered by the form but not enforced here — existing rows and the CSV
  // importer both write free text, and rejecting it would break them.
  if (mode !== 'patch' || submitted('designation')) {
    const designation = typeof values.designation === 'string' ? values.designation.trim() : ''
    if (!designation || designation.length > 50) {
      errors.designation = 'Designation is required and must be max 50 characters'
    }
  }

  if (mode !== 'patch' || submitted('base_salary')) {
    const salary = Number.parseFloat(String(values.base_salary))
    if (!Number.isFinite(salary) || salary <= 0) {
      errors.base_salary = 'Base salary must be greater than 0'
    }
  }

  if (!blank(values.status) && !(EMPLOYEE_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = 'Status must be Active or Inactive'
  }

  if (!blank(values.gender) && !(GENDERS as readonly string[]).includes(values.gender)) {
    errors.gender = 'Choose Male, Female or Other'
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
  checkPhone(errors, 'emergency_contact_phone', values.emergency_contact_phone)

  // A date typed at 2am IST is "tomorrow" in UTC, so the future check has a day
  // of slack rather than rejecting a perfectly ordinary entry.
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)

  for (const field of ['join_date', 'date_of_birth'] as const) {
    if (blank(values[field])) continue
    const d = parseDate(values[field])
    if (!d) {
      errors[field] = `${FIELD_LABELS[field]} is not a valid date`
    } else if (field === 'date_of_birth' && d > cutoff) {
      errors[field] = 'Date of birth cannot be in the future'
    }
  }

  const dob = parseDate(values.date_of_birth)
  const join = parseDate(values.join_date)
  if (dob && join && dob > join) {
    errors.date_of_birth = 'Date of birth cannot be after the joining date'
  }

  if (!blank(values.bank_ifsc) && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(values.bank_ifsc))) {
    errors.bank_ifsc = 'IFSC should be 11 characters, e.g. HDFC0001234'
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : OK
}

/**
 * Validation for a salary advance.
 *
 * Format and shape only. **The cap is not enforced here** — that stays entirely
 * in `lib/salary-advance-validation.ts`, which the routes already call and
 * which this work does not touch.
 */
export function validateAdvance(values: Record<string, any>): Validation {
  const errors: FieldErrors = {}

  const amount = Number.parseFloat(String(values.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Advance amount must be greater than 0'
  }

  if (blank(values.date_given)) {
    errors.date_given = 'Enter the date'
  } else if (!parseDate(values.date_given)) {
    errors.date_given = 'Date is not valid'
  }

  if (blank(values.month_year) || !/^\d{4}-\d{2}$/.test(String(values.month_year))) {
    errors.month_year = 'Month must be in YYYY-MM format'
  }

  if (!blank(values.given_by) && String(values.given_by).trim().length > 120) {
    errors.given_by = 'Given by is too long'
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : OK
}

/** The first error, for clients that show one message rather than marking fields. */
export function firstError(errors: FieldErrors): string {
  const key = Object.keys(errors)[0]
  return key ? String(errors[key]) : 'Invalid request'
}

/** Re-exported so routes can offer the list without a second import. */
export { DESIGNATIONS }
