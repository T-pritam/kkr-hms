/**
 * Forwarding a charge sheet into a patient's bill.
 *
 * This is the one moment a sheet stops being working paper. Every line is copied
 * into `patient_charges`, the bill is recalculated, and the sheet is stamped with
 * the billing record it went to.
 *
 * Three guards, each protecting against a different way of billing someone twice:
 *
 *   * Only a `patient` sheet can be forwarded. A walk-in has no billing record to
 *     forward into, and inventing one would register them by side effect.
 *   * Only a `draft` can be forwarded. `forwarded_billing_id` is the idempotency
 *     key — a double-click, a retried request or a second operator all hit the
 *     same 409 rather than duplicating the charges.
 *   * The copied rows carry `source_sheet_id`, so if the charges do turn out to
 *     be wrong there is a way back to what produced them. The old installment
 *     bug (BUGS.md #21) is exactly what happens without that link.
 *
 * ADMIN only. Everything up to this point is reversible bookkeeping; this is the
 * step that creates a due.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'
import { copyBillToCharge } from '@/lib/pharmacy/store'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge-sheet:forward')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const supabase = await createClient()

    const { data: sheet, error: sheetError } = await supabase
      .from('charge_sheets')
      .select('*, items:charge_sheet_items(*, pharmacy_bill:pharmacy_bills!charge_sheet_item_id(*))')
      .eq('id', id)
      .maybeSingle()

    if (sheetError) throw sheetError
    if (!sheet) return NextResponse.json({ error: 'Charge sheet not found' }, { status: 404 })

    if (sheet.subject_type !== 'patient' || !sheet.patient_id) {
      return NextResponse.json(
        {
          error:
            'This sheet is for a walk-in. Register the patient first, then raise the sheet against them.',
        },
        { status: 400 }
      )
    }

    if (sheet.status === 'forwarded') {
      return NextResponse.json(
        { error: 'This sheet has already been forwarded to billing' },
        { status: 409 }
      )
    }

    if (sheet.status === 'cancelled') {
      return NextResponse.json({ error: 'This sheet was cancelled' }, { status: 409 })
    }

    const items = Array.isArray(sheet.items) ? sheet.items : []
    if (items.length === 0) {
      return NextResponse.json({ error: 'This sheet has no lines to forward' }, { status: 400 })
    }

    // The patient's billing record, created if this is their first. Same shape as
    // app/patients/[id]/page.tsx and the ledger's installment modal, both of which
    // open a billing record on demand.
    const { data: billings, error: billingError } = await supabase
      .from('patient_billing')
      .select('id')
      .eq('patient_id', sheet.patient_id)
      .order('created_at', { ascending: false })

    if (billingError) throw billingError

    let billingId = billings?.[0]?.id

    if (!billingId) {
      const { data: patient } = await supabase
        .from('patients')
        .select('date_of_join')
        .eq('id', sheet.patient_id)
        .maybeSingle()

      const joinedDate = patient?.date_of_join ?? new Date().toISOString().slice(0, 10)

      const { data: created, error: createError } = await supabase
        .from('patient_billing')
        .insert({
          patient_id: sheet.patient_id,
          base_charge: 0,
          referral_commission_amount: 0,
          patient_charges_total: 0,
          total_doctor_fees: 0,
          patient_paid_amount: 0,
          billing_status: 'pending',
          referral_settled: false,
          joined_date: joinedDate,
          month_year: String(joinedDate).slice(0, 7),
          created_by: user.id,
        })
        .select('id')
        .single()

      if (createError) throw createError
      billingId = created.id
    }

    // One group for the whole sheet, so the forwarded block reads as a unit in the
    // charges tab and can be removed in one go if it was forwarded in error.
    const groupId = crypto.randomUUID()

    const { data: charges, error: chargeError } = await supabase
      .from('patient_charges')
      .insert(
        items.map((item: any) => ({
          patient_id: sheet.patient_id,
          patient_billing_id: billingId,
          charge_item_id: item.charge_item_id ?? null,
          // The name, not the note beside it. Lines written before the two were
          // split carry only `description`, which was the name back then.
          charge_type: item.charge_name || item.description,
          // Snapshot the mode the line was quoted under. Stamping everything
          // one_time here made a per-day quote arrive as undifferentiated
          // charges, losing the very distinction the sheet had recorded.
          billing_mode: item.billing_mode || 'one_time',
          description: `From charge sheet ${sheet.sheet_no}`,
          amount: item.unit_price,
          qty: item.qty,
          charge_date: item.service_date ?? new Date().toISOString().slice(0, 10),
          charge_group_id: groupId,
          source_sheet_id: sheet.id,
          created_by: user.id,
          updated_by: user.id,
        }))
      )
      .select('id')

    if (chargeError) throw chargeError

    /**
     * Carry any quoted pharmacy bill onto the charge it became.
     *
     * PostgREST returns inserted rows in the order they were supplied, so the
     * nth charge is the nth item — which is how each bill finds its charge.
     * Copied rather than moved so the forwarded sheet still shows what it
     * quoted; see copyBillToCharge.
     */
    for (const [index, item] of items.entries()) {
      const quoted = Array.isArray(item.pharmacy_bill) ? item.pharmacy_bill[0] : item.pharmacy_bill
      const chargeId = charges?.[index]?.id
      if (!quoted || !chargeId) continue

      await copyBillToCharge(
        supabase,
        quoted,
        { patient_id: sheet.patient_id, patient_charge_id: chargeId },
        user.id,
      )
    }

    // Stamped only after the charges are safely written. Marking it forwarded
    // first and then failing would strand the sheet: locked against a second
    // attempt, with nothing on the bill.
    const { error: stampError } = await supabase
      .from('charge_sheets')
      .update({
        status: 'forwarded',
        forwarded_at: new Date().toISOString(),
        forwarded_by: user.id,
        forwarded_billing_id: billingId,
        updated_by: user.id,
      })
      .eq('id', id)
      .eq('status', 'draft')

    if (stampError) throw stampError

    await recalculatePatientBilling(supabase, billingId)

    return NextResponse.json({
      message: `${charges?.length ?? items.length} charge(s) added to the patient's bill`,
      billing_id: billingId,
      charges_created: charges?.length ?? items.length,
    })
  } catch (error: any) {
    console.error('Error forwarding charge sheet:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to forward the charge sheet' },
      { status: 500 }
    )
  }
}
