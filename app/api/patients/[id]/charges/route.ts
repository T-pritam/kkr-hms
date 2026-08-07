/**
 * Itemised charges on a patient's bill.
 *
 * Rewritten around the charge catalogue. Three things were wrong beyond the
 * missing catalogue:
 *
 * `qty` was collected by the form, multiplied by in `recalculate-billing.ts` and
 * the patient PDF, present in the table with a default of 1 — and never included
 * in the insert. Every three-unit charge was billed as one (BUGS.md #17).
 *
 * Nothing was validated at all: no required fields, no `amount > 0`, and no check
 * that `patient_billing_id` belonged to the patient in the URL, so a charge could
 * be attached to a different patient's bill by supplying their id (BUGS.md
 * #18/#24). Nor was there any role check — any signed-in user, a lab technician
 * included, could add a charge of any size.
 *
 * And a per-day service had to be entered once per day by hand. A `per_day`
 * catalogue entry now takes a date range and writes one row per day, sharing a
 * `charge_group_id` so the block can be shown collapsed and removed in one go.
 * One row per day rather than one row with a span, because a rate can change
 * mid-stay and a single day can need removing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import {
  expandDateRange,
  normalisePatientChargeBody,
  validatePatientCharge,
} from '@/lib/billing/validate'
import { firstError } from '@/lib/patients/validate'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'

const LIST_SELECT = `
  *,
  users!created_by(id, username),
  updated_by_user:users!updated_by(id, username),
  charge_item:charge_items(id, name, category, billing_mode, unit_label),
  pharmacy_bill:pharmacy_bills!patient_charge_id(id, entry_number, entry_date, external_bill_id, invoice_url)
`

/**
 * Flattens the embedded pharmacy bill to object-or-null.
 *
 * PostgREST decides object vs array from pg_constraint, so before
 * 20260810000001 added a real UNIQUE constraint this arrived as an array — and
 * an empty array is truthy, which put the Pharmacy badge on every charge and
 * left `pharmacy_bill.id` undefined on the one row that had a bill.
 *
 * The constraint fixes the shape at source; this keeps the contract with the
 * client fixed regardless, so a future schema edit cannot quietly bring the
 * array back.
 */
function withOnePharmacyBill<T extends { pharmacy_bill?: unknown }>(row: T) {
  const bill = row.pharmacy_bill
  return { ...row, pharmacy_bill: Array.isArray(bill) ? (bill[0] ?? null) : (bill ?? null) }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: patientId } = await params
    const billingId = request.nextUrl.searchParams.get('billing_id')

    let query = supabase.from('patient_charges').select(LIST_SELECT).eq('patient_id', patientId)

    if (billingId) query = query.eq('patient_billing_id', billingId)

    // Secondary sort on creation so the rows a single date range produced keep a
    // stable order among themselves — charge_date alone leaves ties arbitrary.
    const { data, error } = await query
      .order('charge_date', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json((data ?? []).map(withOnePharmacyBill))
  } catch (error) {
    console.error('Error fetching charges:', error)
    return NextResponse.json({ error: 'Failed to fetch charges' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const { id: patientId } = await params
    const body = await request.json().catch(() => ({}))

    const billingId = body.patient_billing_id
    if (!billingId) {
      return NextResponse.json(
        { error: 'A billing record is required', fieldErrors: { patient_billing_id: 'Required' } },
        { status: 400 }
      )
    }

    // The bill must be this patient's. Without this, supplying someone else's
    // billing id charges them instead (BUGS.md #24).
    const { data: billing } = await supabase
      .from('patient_billing')
      .select('id, patient_id')
      .eq('id', billingId)
      .maybeSingle()

    if (!billing || billing.patient_id !== patientId) {
      return NextResponse.json(
        { error: 'That billing record does not belong to this patient' },
        { status: 404 }
      )
    }

    const values = normalisePatientChargeBody(body)

    // The catalogue is the authority on how a service is billed. Taking
    // billing_mode from the request would let a caller bill a per-day service as
    // a single row by lying about the mode.
    let chargeItem: { id: string; name: string; billing_mode: string } | null = null

    if (values.charge_item_id) {
      const { data } = await supabase
        .from('charge_items')
        .select('id, name, billing_mode')
        .eq('id', values.charge_item_id)
        .maybeSingle()

      if (!data) {
        return NextResponse.json(
          { error: 'That charge is not in the catalogue', fieldErrors: { charge_item_id: 'Unknown charge' } },
          { status: 400 }
        )
      }

      chargeItem = data
      values.billing_mode =
        data.billing_mode === 'per_day' || data.billing_mode === 'per_hour'
          ? data.billing_mode
          : 'one_time'
      // Snapshot the name so a later catalogue rename never rewrites this bill.
      values.charge_type = data.name
    }

    const check = validatePatientCharge(values)
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const shared = {
      patient_id: patientId,
      patient_billing_id: billingId,
      charge_item_id: chargeItem?.id ?? null,
      charge_type: values.charge_type,
      billing_mode: values.billing_mode,
      description: values.description,
      amount: values.amount,
      qty: values.qty,
      created_by: user.id,
      updated_by: user.id,
    }

    // One row per day for either range mode, one row otherwise. The group id ties
    // a range's rows together for the collapsed view and for deleting the block.
    //
    // per_day bills the same units on every day, so the range is expanded here.
    // per_hour differs by day and arrives already expanded — the form generated a
    // line per day and the desk removed the ones the service was not used on — so
    // the hours on each line become that row's qty.
    const rows = (() => {
      if (values.billing_mode === 'per_day') {
        const groupId = crypto.randomUUID()
        return expandDateRange(values.from_date!, values.to_date!).map(day => ({
          ...shared,
          charge_date: day,
          charge_group_id: groupId,
        }))
      }

      if (values.billing_mode === 'per_hour') {
        const groupId = crypto.randomUUID()
        return values.hour_lines.map(line => ({
          ...shared,
          qty: line.hours,
          charge_date: line.charge_date,
          charge_group_id: groupId,
        }))
      }

      return [{ ...shared, charge_date: values.charge_date, charge_group_id: null }]
    })()

    const { data, error } = await supabase.from('patient_charges').insert(rows).select()

    if (error) throw error

    await recalculatePatientBilling(supabase, billingId)

    return NextResponse.json(
      {
        message:
          rows.length > 1
            ? values.billing_mode === 'per_hour'
              ? `Added ${rows.length} days of hourly charges`
              : `Added ${rows.length} daily charges`
            : 'Charge added',
        charges: data,
        // The old route returned the bare row and the tab read `.id` off it.
        charge: Array.isArray(data) ? data[0] : data,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating charge:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create charge' },
      { status: 500 }
    )
  }
}
