/**
 * Attaching an already-fetched pharmacy bill to a patient's charges.
 *
 * The bill arrives parked by /api/pharmacy-bills/preview, where the desk saw it
 * and confirmed it was the right invoice. This route writes it — the charge
 * itself (so it goes through every existing billing code path unchanged), the
 * bill header, and its medicine lines — from that same fetch. Nothing here
 * calls SmartPharma360, and nothing about the bill touches it again afterwards:
 * the view, the PDF and the date correction all read our own tables.
 *
 * Three ways this can legitimately fail before anything is written: the billing
 * record doesn't belong to this patient (same ownership check the regular
 * charges route makes), the preview has expired, or the invoice was billed by
 * somebody else between the preview and the save.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { validatePharmacyBillDate } from '@/lib/pharmacy/validate'
import { consumePreview, findBilledCopy } from '@/lib/pharmacy/preview'
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

    const previewToken = String(body.preview_token || '').trim()
    if (!previewToken) {
      return NextResponse.json(
        { error: 'Fetch the bill before saving it', fieldErrors: { preview_token: 'Required' } },
        { status: 400 }
      )
    }

    const billingId = String(body.patient_billing_id || '').trim()
    if (!billingId) {
      return NextResponse.json(
        { error: 'A billing record is required', fieldErrors: { patient_billing_id: 'Required' } },
        { status: 400 }
      )
    }

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

    // The payload was fetched when the desk asked to see it; this is the same
    // fetch, not another one.
    const preview = await consumePreview(supabase, previewToken)
    if (!preview) {
      return NextResponse.json(
        { error: 'That preview has expired — fetch the bill again' },
        { status: 409 }
      )
    }

    const { external_bill_id: externalId, details } = preview

    // Re-checked after the preview: another desk may have billed it meanwhile.
    if (await findBilledCopy(supabase, externalId)) {
      return NextResponse.json(
        { error: 'This pharmacy bill has already been added' },
        { status: 409 }
      )
    }

    // The bill date is the one field the desk may correct before saving.
    let entryDate: string | null = null
    if (body.entry_date !== undefined) {
      const dateCheck = validatePharmacyBillDate(body.entry_date)
      if (!dateCheck.ok) {
        return NextResponse.json(
          { error: Object.values(dateCheck.errors)[0], fieldErrors: dateCheck.errors },
          { status: 400 }
        )
      }
      entryDate = dateCheck.value
    }

    const columns = { ...billColumns(externalId, details), ...(entryDate ? { entry_date: entryDate } : {}) }

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
      { entry_date: columns.entry_date },
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
