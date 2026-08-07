/**
 * A single pharmacy bill quoted on a charge sheet — view it, or correct its date.
 *
 * The patient-side twin is app/api/patients/[id]/pharmacy-bills/[billId]/route.ts
 * and behaves identically: both read only our own tables, neither ever calls
 * SmartPharma360 again, and the bill date is the only field that can be
 * corrected in place. Everything else is fetched-once and immutable — a wrong
 * bill is deleted and re-added.
 *
 * There is no DELETE here either. Removing the sheet line removes the bill,
 * through ON DELETE CASCADE on charge_sheet_item_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { validatePharmacyBillDate } from '@/lib/pharmacy/validate'

const DETAIL_SELECT = '*, items:pharmacy_bill_items(*)'

/** The bill must belong to a line on this sheet — an id alone is not enough. */
async function billOnSheet(supabase: any, sheetId: string, billId: string) {
  const { data: bill, error } = await supabase
    .from('pharmacy_bills')
    .select(`${DETAIL_SELECT}, charge_sheet_item:charge_sheet_items!charge_sheet_item_id(charge_sheet_id)`)
    .eq('id', billId)
    .maybeSingle()

  if (error) throw error
  if (!bill) return null

  const line = Array.isArray(bill.charge_sheet_item)
    ? bill.charge_sheet_item[0]
    : bill.charge_sheet_item

  return line?.charge_sheet_id === sheetId ? bill : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: sheetId, billId } = await params

    const bill = await billOnSheet(supabase, sheetId, billId)
    if (!bill) return NextResponse.json({ error: 'Pharmacy bill not found' }, { status: 404 })

    return NextResponse.json(bill)
  } catch (error) {
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
    const { id: sheetId, billId } = await params
    const body = await request.json().catch(() => ({}))

    const check = validatePharmacyBillDate(body.entry_date)
    if (!check.ok) {
      return NextResponse.json(
        { error: Object.values(check.errors)[0], fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const bill = await billOnSheet(supabase, sheetId, billId)
    if (!bill) return NextResponse.json({ error: 'Pharmacy bill not found' }, { status: 404 })

    const { data: updated, error } = await supabase
      .from('pharmacy_bills')
      .update({ entry_date: check.value, updated_by: user.id })
      .eq('id', billId)
      .select(DETAIL_SELECT)
      .single()

    if (error) throw error

    // Keep the quoted line's date lined up with the bill it came from — that is
    // what the sheet and its PDF group on.
    await supabase
      .from('charge_sheet_items')
      .update({ service_date: check.value })
      .eq('id', bill.charge_sheet_item_id)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating pharmacy bill date:', error)
    return NextResponse.json({ error: 'Failed to update the bill date' }, { status: 500 })
  }
}
