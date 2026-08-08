/**
 * Quoting a pharmacy bill on a charge sheet.
 *
 * The patient-side twin of this route is
 * app/api/patients/[id]/pharmacy-bills/route.ts, and the two share everything
 * that matters — the same client, the same stored columns, the same
 * fetch-once-then-never-again rule. What differs is the owner: here the bill
 * hangs off a `charge_sheet_items` line rather than a `patient_charges` row.
 *
 * A sheet may be for an OPD walk-in who has no patient record at all, which is
 * why `pharmacy_bills.patient_id` is nullable — a quoted bill has no patient
 * until the sheet is forwarded and a real charge is created from it.
 *
 * Unlike the patient side, quoting an invoice already quoted elsewhere is fine.
 * A quote is not money: the same invoice may legitimately appear on several
 * sheets, and the partial unique index only stops it being *billed* twice. Only
 * a repeat on *this* sheet is refused, since that would double the total.
 *
 * The bill arrives already fetched, parked by the preview route — saving one
 * costs no further call to SmartPharma360.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { validatePharmacyBillDate } from '@/lib/pharmacy/validate'
import { consumePreview } from '@/lib/pharmacy/preview'
import { billColumns, billLabel, insertPharmacyBill } from '@/lib/pharmacy/store'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  let createdLineId: string | null = null

  try {
    const auth = await requireBilling(request, 'pharmacy-charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id: sheetId } = await params
    const body = await request.json().catch(() => ({}))

    const previewToken = String(body.preview_token || '').trim()
    if (!previewToken) {
      return NextResponse.json(
        { error: 'Fetch the bill before saving it', fieldErrors: { preview_token: 'Required' } },
        { status: 400 }
      )
    }

    const { data: sheet } = await supabase
      .from('charge_sheets')
      .select('id, status, patient_id')
      .eq('id', sheetId)
      .maybeSingle()

    if (!sheet) return NextResponse.json({ error: 'Charge sheet not found' }, { status: 404 })

    if (sheet.status !== 'draft') {
      return NextResponse.json(
        { error: 'This sheet is no longer a draft and can no longer be edited' },
        { status: 409 }
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

    // Only refuse a bill already quoted on *this* sheet — quoting the same
    // invoice on someone else's sheet is legitimate, and a quote is not money.
    const { data: sheetLines } = await supabase
      .from('charge_sheet_items')
      .select('id, pharmacy_bill:pharmacy_bills!charge_sheet_item_id(external_bill_id)')
      .eq('charge_sheet_id', sheetId)

    const alreadyHere = (sheetLines ?? []).some(line => {
      const bill = Array.isArray(line.pharmacy_bill) ? line.pharmacy_bill[0] : line.pharmacy_bill
      return bill && Number((bill as any).external_bill_id) === externalId
    })

    if (alreadyHere) {
      return NextResponse.json(
        { error: 'This pharmacy bill is already on this sheet' },
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

    const { data: line, error: lineError } = await supabase
      .from('charge_sheet_items')
      .insert({
        charge_sheet_id: sheetId,
        charge_item_id: null,
        charge_name: billLabel(externalId, details),
        description: null,
        billing_mode: 'one_time',
        unit_price: columns.net_amount,
        qty: 1,
        service_date: columns.entry_date,
      })
      .select()
      .single()

    if (lineError) throw lineError
    createdLineId = line.id

    const bill = await insertPharmacyBill(
      supabase,
      // No patient even on a registered-patient sheet: the bill becomes a
      // patient's only when the sheet is forwarded into their billing.
      { charge_sheet_item_id: line.id },
      externalId,
      details,
      user.id,
      { entry_date: columns.entry_date },
    )

    await retotalSheet(supabase, sheetId, user.id)

    return NextResponse.json(
      { message: 'Pharmacy bill added', line, bill_id: bill.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error adding pharmacy bill to charge sheet:', error)

    // A line written before a later step failed must not linger on the sheet
    // with nothing behind it. Deleting it cascades any partial bill away.
    if (createdLineId) {
      try {
        await supabase.from('charge_sheet_items').delete().eq('id', createdLineId)
      } catch {
        // Nothing more to do — the error above is what gets reported.
      }
    }

    return NextResponse.json(
      { error: error.message || 'Failed to add the pharmacy bill' },
      { status: 500 }
    )
  }
}

/** `charge_sheets.total_amount` is denormalised, so every line write re-sums it. */
async function retotalSheet(supabase: any, sheetId: string, userId: string) {
  const { data: lines } = await supabase
    .from('charge_sheet_items')
    .select('unit_price, qty')
    .eq('charge_sheet_id', sheetId)

  const total = (lines ?? []).reduce(
    (sum: number, l: any) => sum + (Number(l.unit_price) || 0) * (Number(l.qty) || 1),
    0,
  )

  await supabase
    .from('charge_sheets')
    .update({ total_amount: total, updated_by: userId })
    .eq('id', sheetId)
}
