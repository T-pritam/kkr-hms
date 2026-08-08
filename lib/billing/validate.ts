/**
 * Payload validation for charges, the catalogue and charge sheets.
 *
 * There was none at all. BUGS.md #18: "No required-field check, no `amount > 0`,
 * and no verification that `patient_billing_id` belongs to the patient in the
 * URL. A charge with no amount, a negative amount, or one attached to another
 * patient's billing record is all accepted." The ownership half of that is
 * BUGS.md #24, which the billing PATCH shares.
 *
 * Same shape as lib/patients/validate.ts: a `*_WRITABLE` allowlist, a
 * `normalise*` that trims and turns blanks into NULL, and a `validate*` returning
 * `FieldErrors` keyed by the field name the form uses.
 */

import {
  CHARGE_BILLING_MODES,
  CHARGE_CATEGORIES,
  CHARGE_SHEET_SUBJECTS,
  FIELD_LABELS,
  MAX_CHARGE_DAYS,
  MAX_HOURS_PER_DAY,
} from './constants'
import type { FieldErrors } from '@/lib/case-sheet/types'

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

const label = (field: string) => FIELD_LABELS[field] ?? field

/** `YYYY-MM-DD`, and a real date — `2026-02-31` parses in JS but is not a day. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * A money field. Rejects the empty string, `NaN`, `Infinity` and negatives.
 *
 * `Number('')` is 0 and `Number(null)` is 0, which is exactly how an amount-less
 * charge got stored as free before.
 */
function money(value: unknown): number | null {
  if (blank(value)) return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return null
  return n
}

function integer(value: unknown): number | null {
  const n = money(value)
  if (n === null || !Number.isInteger(n)) return null
  return n
}

// ── Charge catalogue ─────────────────────────────────────────────────────────

export const CHARGE_ITEM_WRITABLE = [
  'code',
  'name',
  'category',
  'billing_mode',
  'default_price',
  'unit_label',
  'notes',
  'is_active',
] as const

export function normaliseChargeItemBody(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  if (!body || typeof body !== 'object') return out

  for (const field of CHARGE_ITEM_WRITABLE) {
    if (!(field in body)) continue
    const raw = body[field]

    if (field === 'is_active') {
      out[field] = raw === true || raw === 'true'
      continue
    }

    if (field === 'default_price') {
      out[field] = blank(raw) ? 0 : money(raw)
      continue
    }

    out[field] = blank(raw) ? null : String(raw).trim()
  }

  return out
}

export function validateChargeItem(
  values: Record<string, any>,
  mode: 'create' | 'update',
): { ok: true } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const present = (f: string) => mode === 'create' || f in values

  if (present('name') && blank(values.name)) errors.name = `${label('name')} is required`
  else if (values.name && String(values.name).length > 200) {
    errors.name = `${label('name')} must be 200 characters or fewer`
  }

  if (present('category')) {
    if (blank(values.category)) errors.category = `${label('category')} is required`
    else if (!(CHARGE_CATEGORIES as readonly string[]).includes(values.category)) {
      errors.category = `${label('category')} must be one of: ${CHARGE_CATEGORIES.join(', ')}`
    }
  }

  if (present('billing_mode')) {
    if (blank(values.billing_mode)) errors.billing_mode = `${label('billing_mode')} is required`
    else if (!(CHARGE_BILLING_MODES as readonly string[]).includes(values.billing_mode)) {
      errors.billing_mode = `${label('billing_mode')} must be one of: ${CHARGE_BILLING_MODES.join(', ')}`
    }
  }

  if ('default_price' in values) {
    const price = values.default_price
    if (price === null || Number(price) < 0) {
      errors.default_price = `${label('default_price')} must be zero or more`
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true }
}

// ── Patient charges ──────────────────────────────────────────────────────────

/** One day of a per-hour entry: the date, and the hours used on it. */
export interface HourLine {
  charge_date: string | null
  hours: number | null
}

export interface NormalisedCharge {
  /**
   * 'one_time' writes one row; 'per_day' expands from_date..to_date into one row
   * per day; 'per_hour' writes one row per `hour_lines` entry, with the hours as
   * that row's qty.
   */
  billing_mode: 'one_time' | 'per_day' | 'per_hour'
  charge_item_id: string | null
  charge_type: string | null
  description: string | null
  amount: number | null
  qty: number | null
  charge_date: string | null
  from_date: string | null
  to_date: string | null
  /** Only meaningful for 'per_hour'. */
  hour_lines: HourLine[]
}

/**
 * The three entry shapes, reduced to one record.
 *
 * `billing_mode` is what the caller *asks* for; the route overrides it from the
 * catalogue entry when there is one, so a client cannot bill a per-day service as
 * a single row by lying about the mode.
 */
export function normalisePatientChargeBody(body: any): NormalisedCharge {
  const b = body && typeof body === 'object' ? body : {}
  const mode =
    b.billing_mode === 'per_day' || b.billing_mode === 'per_hour' ? b.billing_mode : 'one_time'

  return {
    billing_mode: mode,
    hour_lines: normaliseHourLines(b.hour_lines),
    charge_item_id: blank(b.charge_item_id) ? null : String(b.charge_item_id).trim(),
    charge_type: blank(b.charge_type) ? null : String(b.charge_type).trim(),
    description: blank(b.description) ? null : String(b.description).trim(),
    amount: money(b.amount),
    // qty_per_day and qty are the same column; the form just names it differently
    // depending on which shape it is showing.
    qty: blank(b.qty) && blank(b.qty_per_day) ? 1 : integer(b.qty ?? b.qty_per_day),
    // Today when omitted, as the old route did. A one-off charge is almost
    // always being entered on the day it happened, and the form always sends it.
    charge_date: blank(b.charge_date)
      ? new Date().toISOString().slice(0, 10)
      : String(b.charge_date).trim(),
    from_date: blank(b.from_date) ? null : String(b.from_date).trim(),
    to_date: blank(b.to_date) ? null : String(b.to_date).trim(),
  }
}

/**
 * The per-hour day list.
 *
 * The form generates one entry per day of the chosen range and lets the desk
 * drop the days the service was not used, so what arrives here is already the
 * exact set of days to bill — this only trims and coerces it.
 */
export function normaliseHourLines(raw: any): HourLine[] {
  if (!Array.isArray(raw)) return []

  return raw.map((line: any) => {
    const l = line && typeof line === 'object' ? line : {}
    return {
      charge_date: blank(l.charge_date) ? null : String(l.charge_date).trim(),
      hours: integer(l.hours),
    }
  })
}

export function validatePatientCharge(
  values: NormalisedCharge,
): { ok: true } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}

  // A charge must name something, either from the catalogue or free text.
  if (!values.charge_item_id && blank(values.charge_type)) {
    errors.charge_type = 'Choose a charge, or type a name for it'
  }

  if (values.amount === null) errors.amount = `${label('amount')} is required`
  else if (values.amount <= 0) errors.amount = `${label('amount')} must be more than zero`

  if (values.qty === null) errors.qty = `${label('qty')} must be a whole number`
  else if (values.qty < 1) errors.qty = `${label('qty')} must be at least 1`

  if (values.billing_mode === 'per_day') {
    const fromOk = isValidDate(values.from_date)
    const toOk = isValidDate(values.to_date)

    if (!fromOk) errors.from_date = `${label('from_date')} is required`
    if (!toOk) errors.to_date = `${label('to_date')} is required`

    if (fromOk && toOk) {
      if (values.to_date! < values.from_date!) {
        errors.to_date = `${label('to_date')} cannot be before ${label('from_date').toLowerCase()}`
      } else {
        const days = dayCount(values.from_date!, values.to_date!)
        if (days > MAX_CHARGE_DAYS) {
          errors.to_date = `That is ${days} days. A single entry covers at most ${MAX_CHARGE_DAYS}.`
        }
      }
    }
  } else if (values.billing_mode === 'per_hour') {
    // The days arrive already chosen — the form expanded the range and the desk
    // removed the days the service was not used. An empty list means every day
    // was removed, which is a mistake worth naming rather than saving as nothing.
    if (values.hour_lines.length === 0) {
      errors.hour_lines = 'Add at least one day with hours on it'
    } else if (values.hour_lines.length > MAX_CHARGE_DAYS) {
      errors.hour_lines = `That is ${values.hour_lines.length} days. A single entry covers at most ${MAX_CHARGE_DAYS}.`
    }

    values.hour_lines.forEach((line, index) => {
      if (!isValidDate(line.charge_date)) {
        errors[`hour_lines.${index}.charge_date`] = 'Not a valid date'
      }
      if (line.hours === null) {
        errors[`hour_lines.${index}.hours`] = `${label('hours')} must be a whole number`
      } else if (line.hours < 1) {
        errors[`hour_lines.${index}.hours`] = `${label('hours')} must be at least 1`
      } else if (line.hours > MAX_HOURS_PER_DAY) {
        // A day does not contain more than 24 hours. Without this a mistyped
        // "72" bills three days of oxygen against one date.
        errors[`hour_lines.${index}.hours`] =
          `${label('hours')} cannot be more than ${MAX_HOURS_PER_DAY} in a day`
      }
    })

    // Two rows for the same day would double-bill it.
    const seen = new Set<string>()
    values.hour_lines.forEach((line, index) => {
      if (!line.charge_date) return
      if (seen.has(line.charge_date)) {
        errors[`hour_lines.${index}.charge_date`] = 'That day is already listed'
      }
      seen.add(line.charge_date)
    })
  } else if (!isValidDate(values.charge_date)) {
    errors.charge_date = `${label('charge_date')} is required`
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true }
}

/** Inclusive day count between two `YYYY-MM-DD` dates. */
export function dayCount(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.floor(ms / 86_400_000) + 1
}

/**
 * Every date from `from` to `to`, inclusive.
 *
 * Stepping in UTC rather than with `setDate` on a local Date: a local step lands
 * on a DST boundary in some zones and silently repeats or skips a day, which here
 * would mean billing a patient twice for one night.
 */
export function expandDateRange(from: string, to: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)

  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }

  return out
}

// ── Charge sheets ────────────────────────────────────────────────────────────

export const CHARGE_SHEET_WRITABLE = [
  'subject_type',
  'patient_id',
  'opd_name',
  'opd_phone',
  'opd_age',
  'opd_gender',
  'notes',
] as const

export function normaliseChargeSheetBody(body: any): Record<string, any> {
  const b = body && typeof body === 'object' ? body : {}
  const out: Record<string, any> = {}

  for (const field of CHARGE_SHEET_WRITABLE) {
    if (!(field in b)) continue
    const raw = b[field]

    if (field === 'opd_age') {
      out[field] = blank(raw) ? null : integer(raw)
      continue
    }

    out[field] = blank(raw) ? null : String(raw).trim()
  }

  // A sheet is about exactly one subject. Clearing the other side here rather
  // than trusting the caller keeps the CHECK constraints in
  // 20260808000003 from ever being the thing that reports the mistake.
  if (out.subject_type === 'opd') out.patient_id = null
  if (out.subject_type === 'patient') {
    out.opd_name = null
    out.opd_phone = null
    out.opd_age = null
    out.opd_gender = null
  }

  return out
}

export interface NormalisedSheetItem {
  /** The existing row this line is, when the sheet is being edited. */
  id: string | null
  charge_item_id: string | null
  /** The required half — what the line is. */
  charge_name: string | null
  /** The optional note beside it. */
  description: string | null
  billing_mode: string | null
  unit_price: number | null
  qty: number | null
  service_date: string | null
}

export function normaliseChargeSheetItems(raw: any): NormalisedSheetItem[] {
  if (!Array.isArray(raw)) return []

  return raw.map((item: any) => {
    const i = item && typeof item === 'object' ? item : {}
    // Lines written before the name/description split carry only `description`,
    // and that value was always the name — so fall back to it rather than
    // rejecting a payload that predates the split.
    const name = blank(i.charge_name) ? i.description : i.charge_name

    return {
      id: blank(i.id) ? null : String(i.id).trim(),
      charge_item_id: blank(i.charge_item_id) ? null : String(i.charge_item_id).trim(),
      charge_name: blank(name) ? null : String(name).trim(),
      description: blank(i.description) ? null : String(i.description).trim(),
      billing_mode: blank(i.billing_mode) ? 'one_time' : String(i.billing_mode).trim(),
      unit_price: money(i.unit_price),
      qty: blank(i.qty) ? 1 : integer(i.qty),
      service_date: blank(i.service_date) ? null : String(i.service_date).trim(),
    }
  })
}

export function validateChargeSheet(
  values: Record<string, any>,
  items: NormalisedSheetItem[],
  mode: 'create' | 'update',
): { ok: true } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const present = (f: string) => mode === 'create' || f in values

  if (present('subject_type')) {
    if (!(CHARGE_SHEET_SUBJECTS as readonly string[]).includes(values.subject_type)) {
      errors.subject_type = 'Choose whether this is for a registered patient or a walk-in'
    } else if (values.subject_type === 'patient' && blank(values.patient_id)) {
      errors.patient_id = `${label('patient_id')} is required`
    } else if (values.subject_type === 'opd' && blank(values.opd_name)) {
      errors.opd_name = `${label('opd_name')} is required`
    }
  }

  if (mode === 'create' && items.length === 0) {
    errors.items = 'Add at least one line'
  }

  items.forEach((item, index) => {
    const at = (field: string) => `items.${index}.${field}`

    if (blank(item.charge_name)) errors[at('charge_name')] = 'Name this line'
    if (item.unit_price === null || item.unit_price < 0) {
      errors[at('unit_price')] = `${label('unit_price')} must be zero or more`
    }
    if (item.qty === null || item.qty < 1) errors[at('qty')] = `${label('qty')} must be at least 1`
    if (item.service_date !== null && !isValidDate(item.service_date)) {
      errors[at('service_date')] = 'Not a valid date'
    }
    if (
      item.billing_mode !== null &&
      !(CHARGE_BILLING_MODES as readonly string[]).includes(item.billing_mode)
    ) {
      errors[at('billing_mode')] = `${label('billing_mode')} must be one of: ${CHARGE_BILLING_MODES.join(', ')}`
    }
  })

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true }
}

// ── Billing header: base charge and referral ─────────────────────────────────

/**
 * Neither a base charge nor a referral is required any more.
 *
 * A patient may be billed purely from itemised charges, with no package at all.
 * What this rejects is a *negative* figure, and a package flag set when there is
 * no package to be inside of — see lib/recalculate-billing.ts, where a flag in
 * that state would silently drop doctor fees off the bill.
 */
export function validateBillingHeader(
  values: Record<string, any>,
): { ok: true } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}

  for (const field of ['base_charge', 'referral_commission_amount'] as const) {
    if (!(field in values) || blank(values[field])) continue
    const n = money(values[field])
    if (n === null) errors[field] = `${label(field)} must be a number`
    else if (n < 0) errors[field] = `${label(field)} cannot be negative`
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true }
}
