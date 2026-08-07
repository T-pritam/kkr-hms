/**
 * Attaching a pharmacy bill to a patient's charges.
 *
 * This is the *only* place in the app that ever talks to SmartPharma360. It
 * resolves whatever id the desk typed (a numeric bill id, or an entry number
 * that needs one lookup to resolve), fetches the bill exactly once, and
 * writes three things: the charge itself (so it goes through every existing
 * billing code path unchanged), the bill header, and its medicine lines.
 * After this call returns, nothing about this bill ever touches
 * SmartPharma360 again — the view, the PDF, and the date correction all read
 * from our own tables.
 *
 * Three ways this can legitimately fail before anything is written: the
 * billing record doesn't belong to this patient (same ownership check the
 * regular charges route makes), the bill id doesn't resolve to exactly one
 * SmartPharma360 invoice, or that invoice has already been attached
 * (external_bill_id is globally unique — the same real bill must not be
 * billed twice).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { firstError } from '@/lib/patients/validate'
import { normaliseAddPharmacyBillBody, validateAddPharmacyBillBody } from '@/lib/pharmacy/validate'
import { fetchBillDetails, resolveExternalBillId } from '@/lib/pharmacy/client'
import { billColumns, billLabel, insertPharmacyBill } from '@/lib/pharmacy/store'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  let createdChargeId: string | null = null

  try {
    const auth = await requireBilling(request, 'pharmacy-charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id: patientId } = await params
    const body = await request.json().catch(() => ({}))

    const values = normaliseAddPharmacyBillBody(body)
    const check = validateAddPharmacyBillBody(values)
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const billingId = values.patient_billing_id!

    // The bill must be this patient's — same guard as the regular charges
    // route, and for the same reason: supplying someone else's billing id
    // would otherwise charge them instead.
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

    let externalId: number
    try {
      externalId = await resolveExternalBillId(supabase, values.bill_id!)
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Bill not found' }, { status: 404 })
    }

    // The same real invoice must never be attached twice — check before
    // spending a call on retail_sale_details.
    const { data: existing } = await supabase
      .from('pharmacy_bills')
      .select('id')
      .eq('external_bill_id', externalId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'This pharmacy bill has already been added' },
        { status: 409 }
      )
    }

    let details
    try {
      details = await fetchBillDetails(supabase, externalId)
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || 'Could not fetch that bill from the pharmacy system' },
        { status: 502 }
      )
    }

    if (!details.items.length) {
      return NextResponse.json({ error: 'That bill has no medicines on it' }, { status: 400 })
    }

    const columns = billColumns(externalId, details)

    const { data: charge, error: chargeError } = await supabase
      .from('patient_charges')
      .insert({
        patient_id: patientId,
        patient_billing_id: billingId,
        charge_item_id: null,
        charge_type: billLabel(externalId, details),
        billing_mode: 'one_time',
        description: null,
        amount: columns.net_amount,
        qty: 1,
        charge_date: columns.entry_date,
        charge_group_id: null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (chargeError) throw chargeError
    createdChargeId = charge.id

    const bill = await insertPharmacyBill(
      supabase,
      { patient_id: patientId, patient_charge_id: charge.id },
      externalId,
      details,
      user.id,
    )

    await recalculatePatientBilling(supabase, billingId)

    return NextResponse.json(
      { message: 'Pharmacy bill added', charge, bill_id: bill.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error adding pharmacy bill:', error)

    // Best-effort cleanup: a charge written before a later step failed must
    // not linger on the bill with nothing behind it. ON DELETE CASCADE takes
    // care of a partially-written pharmacy_bills/pharmacy_bill_items pair.
    if (createdChargeId) {
      try {
        await supabase.from('patient_charges').delete().eq('id', createdChargeId)
      } catch {
        // Nothing more we can do here — the error above is what gets reported.
      }
    }

    return NextResponse.json(
      { error: error.message || 'Failed to add the pharmacy bill' },
      { status: 500 }
    )
  }
}
