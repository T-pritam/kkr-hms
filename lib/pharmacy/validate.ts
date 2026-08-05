/**
 * Payload validation for adding and correcting a pharmacy bill.
 *
 * Same `normalise*`/`validate*` shape as lib/billing/validate.ts — trims and
 * blanks-to-null, then returns `{ ok: true } | { ok: false, errors }`.
 */

import { FIELD_LABELS } from '@/lib/billing/constants'
import { isValidDate } from '@/lib/billing/validate'
import type { FieldErrors } from '@/lib/case-sheet/types'

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

const label = (field: string) => FIELD_LABELS[field] ?? field

export function normaliseAddPharmacyBillBody(body: any): { bill_id: string | null; patient_billing_id: string | null } {
  const b = body && typeof body === 'object' ? body : {}
  return {
    bill_id: blank(b.bill_id) ? null : String(b.bill_id).trim(),
    patient_billing_id: blank(b.patient_billing_id) ? null : String(b.patient_billing_id).trim(),
  }
}

export function validateAddPharmacyBillBody(
  values: { bill_id: string | null; patient_billing_id: string | null },
): { ok: true } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}

  if (!values.bill_id) errors.bill_id = `${label('bill_id')} is required`
  if (!values.patient_billing_id) {
    errors.patient_billing_id = `${label('patient_billing_id')} is required`
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true }
}

export function validatePharmacyBillDate(
  entryDate: unknown,
): { ok: true; value: string } | { ok: false; errors: FieldErrors } {
  if (!isValidDate(entryDate)) {
    return { ok: false, errors: { entry_date: `${label('entry_date')} is not a valid date` } }
  }
  return { ok: true, value: entryDate as string }
}
