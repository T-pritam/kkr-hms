/**
 * Payload validation for case sheets.
 *
 * Shared by POST, PATCH and the finalise endpoint. The lab module shipped with
 * POST enforcing invariants that PUT did not (BUGS.md #59), which let a valid
 * record be edited into an unusable state through the back door. One validator,
 * used everywhere, is how that stays fixed.
 */

import { DISCHARGE_CONDITIONS, FIELD_LABELS } from './constants'
import type { FieldErrors } from './types'

/** Columns a client may write. Anything else in the body is ignored outright. */
export const CASE_SHEET_WRITABLE = [
  'patient_billing_id',
  'admission_date',
  'discharge_date',
  'discharge_time',
  'discharge_received_by',
  'chief_complaints',
  'history_present_illness',
  'past_history',
  'diagnosis',
  'investigations',
  'clinical_summary',
  'advice_notes',
  'condition_on_discharge',
  'vitals_bp',
  'vitals_pulse',
  'vitals_temp',
  'vitals_spo2',
  'follow_up_date',
  'follow_up_instructions',
] as const

/** Fields the change log tracks. Same list — attribution columns are not content. */
export const TRACKED_FIELDS = CASE_SHEET_WRITABLE

const DATE_FIELDS = new Set(['admission_date', 'discharge_date', 'follow_up_date'])

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/**
 * Coerces a request body into column values.
 *
 * Empty strings become NULL rather than being stored as `''`, and — unlike the
 * old handler, which merged with `||` — a field explicitly set to blank really
 * is cleared. Under the old code a discharge note could never be emptied once
 * written (BUGS.md #63).
 */
export function normaliseCaseSheetBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}

  for (const field of CASE_SHEET_WRITABLE) {
    if (body?.[field] === undefined) continue
    const value = body[field]
    out[field] = blank(value) ? null : typeof value === 'string' ? value.trim() : value
  }

  return out
}

export interface Validation {
  ok: boolean
  /** Per-field messages, so the editor can mark the offending box. */
  errors: FieldErrors
}

const OK: Validation = { ok: true, errors: {} }

function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

/**
 * Checks a create or update payload. Deliberately permissive: a draft is
 * allowed to be almost entirely empty, because a clinician fills it in over the
 * course of a stay. Only things that are actually *wrong* are rejected here —
 * completeness is the finalise check's job.
 */
export function validateCaseSheet(values: Record<string, any>): Validation {
  const errors: FieldErrors = {}

  for (const field of DATE_FIELDS) {
    const value = values[field]
    if (value !== undefined && value !== null && !isValidDate(value)) {
      errors[field] = `${FIELD_LABELS[field]} is not a valid date`
    }
  }

  const { admission_date, discharge_date } = values
  if (isValidDate(admission_date) && isValidDate(discharge_date)) {
    if (new Date(discharge_date) < new Date(admission_date)) {
      errors.discharge_date = 'Discharge date cannot be before the admission date'
    }
  }

  if (
    !blank(values.condition_on_discharge) &&
    !(DISCHARGE_CONDITIONS as readonly string[]).includes(values.condition_on_discharge)
  ) {
    errors.condition_on_discharge = 'Choose one of the listed conditions'
  }

  // Free text, often not a system user — same convention and cap as
  // lib/employees/validate.ts's given_by.
  if (!blank(values.discharge_received_by) && String(values.discharge_received_by).trim().length > 120) {
    errors.discharge_received_by = 'Received by is too long'
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : OK
}

export interface FinaliseSubject {
  discharge_date?: unknown
  diagnosis?: unknown
  clinical_summary?: unknown
  doctors?: unknown[]
}

/**
 * The four things the client requires before a summary can be signed off.
 *
 * Everything else is optional by design — a real discharge summary often has no
 * past history worth recording and no follow-up beyond "review if unwell".
 */
export function validateFinalise(sheet: FinaliseSubject): Validation {
  const errors: FieldErrors = {}

  if (blank(sheet.discharge_date)) {
    errors.discharge_date = 'Enter the discharge date'
  }
  if (!Array.isArray(sheet.doctors) || sheet.doctors.length === 0) {
    errors.doctors = 'Add at least one consulting doctor'
  }
  if (blank(sheet.diagnosis)) {
    errors.diagnosis = 'Enter the diagnosis'
  }
  if (blank(sheet.clinical_summary)) {
    errors.clinical_summary = 'Enter the summary'
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : OK
}

export interface DoctorInput {
  doctor_id?: string | null
  doctor_name?: string | null
  doctor_specialist?: string | null
}

/**
 * Normalises the consulting doctor list.
 *
 * Rows with no name are dropped rather than rejected: the editor always keeps
 * one empty row on screen, and an empty row is not an error.
 *
 * Duplicates are collapsed — the table has UNIQUE (case_sheet_id, doctor_id),
 * and letting a duplicate through would surface as a raw 500.
 */
export function normaliseDoctors(rows: unknown): { rows: DoctorInput[]; error?: string } {
  if (rows === undefined) return { rows: [] }
  if (!Array.isArray(rows)) return { rows: [], error: 'Consulting doctors must be a list' }

  const seen = new Set<string>()
  const out: DoctorInput[] = []

  for (const row of rows as DoctorInput[]) {
    const name = typeof row?.doctor_name === 'string' ? row.doctor_name.trim() : ''
    if (!name) continue

    const key = row.doctor_id ? `id:${row.doctor_id}` : `name:${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      doctor_id: row.doctor_id || null,
      doctor_name: name,
      doctor_specialist: typeof row.doctor_specialist === 'string' && row.doctor_specialist.trim()
        ? row.doctor_specialist.trim()
        : null,
    })
  }

  return { rows: out }
}

export interface MedicationInput {
  medicine_id?: string | null
  medicine_name?: string | null
  dosage?: string | null
  quantity?: string | null
  usage?: string | null
}

/** Same treatment for the medication rows: a nameless row is an empty row. */
export function normaliseMedications(rows: unknown): { rows: MedicationInput[]; error?: string } {
  if (rows === undefined) return { rows: [] }
  if (!Array.isArray(rows)) return { rows: [], error: 'Discharge medication must be a list' }

  const out: MedicationInput[] = []

  for (const row of rows as MedicationInput[]) {
    const name = typeof row?.medicine_name === 'string' ? row.medicine_name.trim() : ''
    if (!name) continue

    const text = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim() : null

    out.push({
      medicine_id: row.medicine_id || null,
      medicine_name: name,
      dosage: text(row.dosage),
      quantity: text(row.quantity),
      usage: text(row.usage),
    })
  }

  return { rows: out }
}
