/**
 * Payload validation for the doctor registry.
 *
 * The whole of the previous validation, on both POST and PUT, was
 * `if (!name) return 400` — so " " was a valid doctor name, and the email box
 * (typed `email` in the browser, which only checks on form submit) accepted
 * anything an API client sent.
 *
 * Only the name is required. A referring doctor is often added mid-consultation
 * with nothing to hand but a name, and blocking that would push people into
 * typing the name into the free-text "outside doctor" box instead, which is
 * exactly the fragmentation this registry exists to prevent.
 */

import { DEPARTMENTS, FIELD_LABELS } from './constants'
import type { FieldErrors } from '@/lib/case-sheet/types'

export const DOCTOR_WRITABLE = [
  'name',
  'qualification',
  'designation',
  'department',
  'specialist',
  'mobile',
  'email',
  'registration_no',
  'is_active',
] as const

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

export function normaliseDoctorBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}

  for (const field of DOCTOR_WRITABLE) {
    if (body?.[field] === undefined) continue
    const value = body[field]

    if (field === 'is_active') {
      out[field] = Boolean(value)
      continue
    }

    out[field] = blank(value) ? null : typeof value === 'string' ? value.trim() : value
  }

  return out
}

export interface Validation {
  ok: boolean
  errors: FieldErrors
}

const OK: Validation = { ok: true, errors: {} }

export function validateDoctor(
  values: Record<string, any>,
  mode: 'create' | 'update' | 'patch' = 'create',
): Validation {
  const errors: FieldErrors = {}

  if ((mode !== 'patch' || 'name' in values) && blank(values.name)) {
    errors.name = `${FIELD_LABELS.name} is required`
  }

  if (!blank(values.department) && !(DEPARTMENTS as readonly string[]).includes(values.department)) {
    errors.department = 'Choose one of the listed departments'
  }

  if (!blank(values.mobile)) {
    const d = String(values.mobile).replace(/\D/g, '')
    if (d.length < 8 || d.length > 15) {
      errors.mobile = 'Mobile does not look like a valid number'
    }
  }

  if (!blank(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) {
    errors.email = 'Enter a valid email address'
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : OK
}
