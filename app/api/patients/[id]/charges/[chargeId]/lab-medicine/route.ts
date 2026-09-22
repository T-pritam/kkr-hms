/**
 * POST /api/patients/[id]/charges/[chargeId]/lab-medicine
 *
 * Decide a lab or medicine charge after it was saved (PRD v2, CR-15):
 *
 *   { action: 'collect', payment_method, transaction_reference? }
 *       collect it now, as its own payment labelled Lab or Medicine
 *   { action: 'include' }
 *       covered by the patient's regular payments; nothing is collected
 *   { action: 'to_collect' }
 *       back from "included" to "to be collected separately"
 *
 * Used for a charge left "to collect" — a forwarded quote, or one whose payment
 * was deleted — and for changing one's mind before it is collected. A collected
 * charge changes only by deleting its payment first (Payments tab), which puts
 * it back to "to collect".
 *
 * Who: the desk that takes payments (`payment:write`) — admin and reception,
 * whoever entered the charge (PRD v2 Q-65).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { collectCharges, labMedicineKind, parseLabMedicineChoice } from '@/lib/billing/lab-medicine'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'payment:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const { id: patientId, chargeId } = await params
    const body = await request.json().catch(() => ({}))

    const { data: charge } = await supabase
      .from('patient_charges')
      .select(
        'id, patient_id, patient_billing_id, charge_type, amount, qty, lab_medicine_status, charge_item:charge_items(category)'
      )
      .eq('id', chargeId)
      .maybeSingle()

    if (!charge || charge.patient_id !== patientId) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 })
    }

    const item = Array.isArray(charge.charge_item) ? charge.charge_item[0] : charge.charge_item
    const kind = labMedicineKind(item?.category)
    if (!kind) {
      return NextResponse.json(
        { error: 'Only lab and medicine charges are collected separately' },
        { status: 400 }
      )
    }

    if (charge.lab_medicine_status === 'collected') {
      return NextResponse.json(
        {
          error:
            'This charge has already been collected. Delete its payment on the Payments tab first to change it.',
          code: 'LAB_MEDICINE_COLLECTED',
        },
        { status: 409 }
      )
    }

    const action = body.action

    if (action === 'include' || action === 'to_collect') {
      const status = action === 'include' ? 'included' : 'to_collect'
      const { error } = await supabase
        .from('patient_charges')
        .update({ lab_medicine_status: status, updated_by: user.id })
        .eq('id', chargeId)
      if (error) throw error
      return NextResponse.json({ status })
    }

    if (action !== 'collect') {
      return NextResponse.json({ error: 'action must be collect, include or to_collect' }, { status: 400 })
    }

    const choice = parseLabMedicineChoice({ ...body, choice: 'collect' })
    if (!choice.ok) {
      return NextResponse.json({ error: choice.error, fieldErrors: choice.fieldErrors }, { status: choice.status })
    }

    const result = await collectCharges(supabase, {
      patientId,
      billingId: charge.patient_billing_id,
      kind,
      rows: [charge],
      chargeName: charge.charge_type,
      payment: choice.value!.payment!,
      userId: user.id,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, fieldErrors: result.fieldErrors, ...(result.code ? { code: result.code } : {}) },
        { status: result.status }
      )
    }

    return NextResponse.json({
      status: 'collected',
      installment_id: result.installment.id,
      installment_number: result.installment.installment_number,
    })
  } catch (error: any) {
    console.error('Error deciding a lab/medicine charge:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update the charge' },
      { status: 500 }
    )
  }
}
