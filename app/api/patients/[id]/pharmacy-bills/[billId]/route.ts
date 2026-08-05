/**
 * A single stored pharmacy bill — view it, or correct its date.
 *
 * Both handlers read/write only our own DB; neither ever calls
 * SmartPharma360. That's the whole point of storing the bill on POST — the
 * view, and any date correction, must not cost another call to someone
 * else's site.
 *
 * There is no PATCH for anything but `entry_date`, and no DELETE here at
 * all. Everything else about a bill is immutable once fetched — wrong data
 * is deleted and re-added, not edited — and delete already happens through
 * the existing charge endpoint (DELETE /api/patients/[id]/charges/[chargeId]),
 * which cascades into this table via patient_charge_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { validatePharmacyBillDate } from '@/lib/pharmacy/validate'

const DETAIL_SELECT = '*, items:pharmacy_bill_items(*)'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: patientId, billId } = await params

    const { data: bill, error } = await supabase
      .from('pharmacy_bills')
      .select(DETAIL_SELECT)
      .eq('id', billId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (error) throw error
    if (!bill) return NextResponse.json({ error: 'Pharmacy bill not found' }, { status: 404 })

    return NextResponse.json(bill)
  } catch (error: any) {
    console.error('Error fetching pharmacy bill:', error)
    return NextResponse.json({ error: 'Failed to fetch the pharmacy bill' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'pharmacy-charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const { id: patientId, billId } = await params
    const body = await request.json().catch(() => ({}))

    const check = validatePharmacyBillDate(body.entry_date)
    if (!check.ok) {
      return NextResponse.json(
        { error: Object.values(check.errors)[0], fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const { data: bill } = await supabase
      .from('pharmacy_bills')
      .select('id, patient_charge_id')
      .eq('id', billId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (!bill) return NextResponse.json({ error: 'Pharmacy bill not found' }, { status: 404 })

    const { data: updated, error } = await supabase
      .from('pharmacy_bills')
      .update({ entry_date: check.value, updated_by: user.id })
      .eq('id', billId)
      .select(DETAIL_SELECT)
      .single()

    if (error) throw error

    // Keep the charges-tab row's date lined up with the bill it came from —
    // that's what drives the Date column and PDF ordering there.
    await supabase
      .from('patient_charges')
      .update({ charge_date: check.value, updated_by: user.id })
      .eq('id', bill.patient_charge_id)

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating pharmacy bill date:', error)
    return NextResponse.json({ error: 'Failed to update the bill date' }, { status: 500 })
  }
}
