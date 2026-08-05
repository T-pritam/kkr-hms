/**
 * Vocabularies for the charge catalogue and charge sheets.
 *
 * Every list here is mirrored by a CHECK constraint in
 * supabase/migrations/20260808000001_charge_catalogue.sql and
 * 20260808000003_charge_sheets.sql. Adding an option means changing both — the
 * database is the thing that actually stops bad data.
 */

/** What kind of thing is being charged for. Grouping only — it carries no billing behaviour. */
export const CHARGE_CATEGORIES = [
  'room',
  'medical',
  'diagnostic',
  'procedure',
  'registration',
  'pharmacy',
  'other',
] as const

export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number]

export const CHARGE_CATEGORY_LABELS: Record<ChargeCategory, string> = {
  room: 'Room & Bed',
  medical: 'Medical & Nursing',
  diagnostic: 'Diagnostics',
  procedure: 'Procedures',
  registration: 'Registration & Admin',
  pharmacy: 'Pharmacy',
  other: 'Other',
}

/**
 * How a charge accrues, and the one field on the catalogue that changes app
 * behaviour rather than just labelling it.
 *
 * `one_time` is billed once and asks for a single date. `per_day` is billed for
 * every day of a stay and asks for a range, which the charge route expands into
 * one row per day — see app/api/patients/[id]/charges/route.ts. Room rent,
 * oxygen and a nebuliser are per_day; registration is one_time.
 */
export const CHARGE_BILLING_MODES = ['one_time', 'per_day'] as const

export type ChargeBillingMode = (typeof CHARGE_BILLING_MODES)[number]

export const CHARGE_BILLING_MODE_LABELS: Record<ChargeBillingMode, string> = {
  one_time: 'One-time',
  per_day: 'Per day',
}

/** Who a temporary charge sheet is about. */
export const CHARGE_SHEET_SUBJECTS = ['patient', 'opd'] as const
export type ChargeSheetSubject = (typeof CHARGE_SHEET_SUBJECTS)[number]

/** A sheet is working paper until it is forwarded into billing, or abandoned. */
export const CHARGE_SHEET_STATUSES = ['draft', 'forwarded', 'cancelled'] as const
export type ChargeSheetStatus = (typeof CHARGE_SHEET_STATUSES)[number]

/**
 * The ceiling on how many days one date-range entry may expand into.
 *
 * A per-day charge writes a row per day, so a mistyped year ("2026" -> "2062")
 * would otherwise insert tens of thousands of rows against a patient before
 * anyone noticed. Half a year is far beyond any real admission and still cheap
 * to undo. The API rejects rather than truncates: silently billing 180 of 900
 * requested days would be worse than refusing.
 */
export const MAX_CHARGE_DAYS = 180

/** Human labels for the validators, so a 400 names the field the way the form does. */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  code: 'Code',
  category: 'Category',
  billing_mode: 'Billing mode',
  default_price: 'Default price',
  charge_type: 'Charge type',
  charge_item_id: 'Charge',
  amount: 'Amount',
  qty: 'Quantity',
  charge_date: 'Charge date',
  from_date: 'From date',
  to_date: 'To date',
  patient_billing_id: 'Billing record',
  base_charge: 'Base charge',
  referral_commission_amount: 'Referral commission',
  subject_type: 'Sheet type',
  patient_id: 'Patient',
  opd_name: 'Name',
  items: 'Line items',
  description: 'Description',
  unit_price: 'Unit price',
  visit_purpose_id: 'Purpose of visit',
  fee: 'Fee',
  price_per_visit: 'Fee',
}
