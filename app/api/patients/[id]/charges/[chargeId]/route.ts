/**
 * A single charge — correct it, or remove it.
 *
 * `qty` was missing from the PATCH allowlist for the same reason it was missing
 * from the insert (BUGS.md #17): the form collected it and the totals multiplied
 * by it, but no write path ever persisted it. Editing a charge to three units
 * silently kept it at one.
 *
 * DELETE takes an optional `?group=<charge_group_id>`, which removes every row a
 * single date-range entry produced. Without it, cancelling a mistyped four-week
 * admission means twenty-eight round trips, and a half-finished cancellation
 * leaves a bill that is wrong in a way nobody can see.
 *
 * Permission stays "admin, or the person who entered it". Reception correcting
 * their own typo is routine; reaching into someone else's entry is not.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { isValidDate } from '@/lib/billing/validate'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const { chargeId } = await params
    const body = await request.json().catch(() => ({}))

    const { data: charge } = await supabase
      .from('patient_charges')
      .select('created_by, patient_billing_id')
      .eq('id', chargeId)
      .maybeSingle()

    if (!charge) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 })
    }

    if (user.role !== 'ADMIN' && charge.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Omitted means unchanged, so a partial edit cannot blank the rest of the row.
    const updates: Record<string, any> = { updated_by: user.id }
    const fieldErrors: Record<string, string> = {}

    if ('charge_type' in body) {
      const value = String(body.charge_type ?? '').trim()
      if (!value) fieldErrors.charge_type = 'Charge type is required'
      else updates.charge_type = value
    }

    if ('description' in body) {
      const value = String(body.description ?? '').trim()
      updates.description = value || null
    }

    if ('amount' in body) {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        fieldErrors.amount = 'Amount must be more than zero'
      } else updates.amount = amount
    }

    if ('qty' in body) {
      const qty = Number(body.qty)
      if (!Number.isInteger(qty) || qty < 1) fieldErrors.qty = 'Quantity must be at least 1'
      else updates.qty = qty
    }

    if ('charge_date' in body) {
      const date = String(body.charge_date ?? '').trim()
      if (!isValidDate(date)) fieldErrors.charge_date = 'Not a valid date'
      else updates.charge_date = date
    }

    if (Object.keys(fieldErrors).length) {
      return NextResponse.json(
        { error: Object.values(fieldErrors)[0], fieldErrors },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('patient_charges')
      .update(updates)
      .eq('id', chargeId)
      .select()
      .single()

    if (error) throw error

    if (charge.patient_billing_id) {
      await recalculatePatientBilling(supabase, charge.patient_billing_id)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating charge:', error)
    return NextResponse.json({ error: 'Failed to update charge' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const { id: patientId, chargeId } = await params
    const deleteGroup = request.nextUrl.searchParams.get('group') === 'true'

    const { data: charge } = await supabase
      .from('patient_charges')
      .select('created_by, patient_billing_id, charge_group_id')
      .eq('id', chargeId)
      .maybeSingle()

    if (!charge) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 })
    }

    if (user.role !== 'ADMIN' && charge.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let removed = 1

    if (deleteGroup && charge.charge_group_id) {
      // Scoped to the patient as well as the group: a group id is a client-visible
      // value, and one that has been tampered with must not reach another bill.
      const { data, error } = await supabase
        .from('patient_charges')
        .delete()
        .eq('charge_group_id', charge.charge_group_id)
        .eq('patient_id', patientId)
        .select('id')

      if (error) throw error
      removed = data?.length ?? 0
    } else {
      const { error } = await supabase.from('patient_charges').delete().eq('id', chargeId)
      if (error) throw error
    }

    if (charge.patient_billing_id) {
      await recalculatePatientBilling(supabase, charge.patient_billing_id)
    }

    return NextResponse.json({
      message: removed > 1 ? `${removed} daily charges deleted` : 'Charge deleted successfully',
      removed,
    })
  } catch (error) {
    console.error('Error deleting charge:', error)
    return NextResponse.json({ error: 'Failed to delete charge' }, { status: 500 })
  }
}
