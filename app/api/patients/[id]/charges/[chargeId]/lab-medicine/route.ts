/**
 * POST /api/patients/[id]/charges/[chargeId]/lab-medicine
 *
 * Decide a lab or medicine charge after it was saved (PRD v2, CR-15):
 *
 *   { action: 'include' }   the patient's regular payments cover it, so the
 *                           hospital owes the lab — it becomes an expense
 *   { action: 'clear' }     back to *not decided*, counting as no expense
 *
 * The three-way question and the whole *Collect now* flow are gone (client
 * revision, 2026-09-24). There is no separate payment any more: an Included
 * amount is the hospital's expense and an excluded one is not recorded at all,
 * so a charge that reaches this route is only ever included or undecided.
 *
 * Who: the desk that takes payments (`payment:write`) — admin and reception,
 * **at any time**, which is the client's own wording. No own-row rule and no
 * discharge lock: this is a running correction to what the hospital owes, and
 * the person who notices it is usually not the person who typed it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { labMedicineKind } from '@/lib/billing/lab-medicine'

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
        { error: 'Only lab and medicine charges carry this question' },
        { status: 400 }
      )
    }

    const action = body.action
    if (action !== 'include' && action !== 'clear') {
      return NextResponse.json({ error: 'action must be include or clear' }, { status: 400 })
    }

    const status = action === 'include' ? 'included' : null

    const { error } = await supabase
      .from('patient_charges')
      .update({ lab_medicine_status: status, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', chargeId)

    if (error) throw error

    return NextResponse.json({ status, kind })
  } catch (error: any) {
    console.error('Error deciding a lab/medicine charge:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update the charge' },
      { status: 500 }
    )
  }
}
