/**
 * Fetch a pharmacy bill so the desk can check it before it is saved.
 *
 * Shared by both surfaces: the fetch does not depend on whether the bill will
 * end up on a patient's charges or on a charge sheet line, so there is one
 * route rather than a copy under each.
 *
 * Nothing is written to the patient or the sheet here. The fetched payload is
 * parked (see lib/pharmacy/preview.ts) and the save that follows writes from
 * it, so confirming a bill costs no second call to SmartPharma360.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { firstError } from '@/lib/patients/validate'
import { normaliseAddPharmacyBillBody, validateAddPharmacyBillBody } from '@/lib/pharmacy/validate'
import { createPreview } from '@/lib/pharmacy/preview'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'pharmacy-charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json().catch(() => ({}))
    const billId = normaliseAddPharmacyBillBody(body).bill_id
    // The owner is supplied later, at save time, so only the id matters here.
    const check = validateAddPharmacyBillBody({ bill_id: billId, patient_billing_id: 'n/a' })
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    try {
      const preview = await createPreview(supabase, user.id, billId!)
      return NextResponse.json({
        token: preview.token,
        external_bill_id: preview.external_bill_id,
        head: preview.details.head,
        items: preview.details.items,
      })
    } catch (err: any) {
      // 404 for "no such bill", 409 for one already billed, 400 for an empty
      // one; anything else is the pharmacy system being unreachable.
      const status = err?.status ?? (err?.message?.includes('found') ? 404 : 502)
      return NextResponse.json({ error: err.message || 'Could not fetch that bill' }, { status })
    }
  } catch (error: any) {
    console.error('Error previewing pharmacy bill:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch the pharmacy bill' },
      { status: 500 }
    )
  }
}
