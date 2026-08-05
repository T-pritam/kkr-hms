/**
 * A single catalogue entry — edit, and retire.
 *
 * DELETE deactivates rather than destroys whenever the entry has been used. A
 * charge row keeps a `charge_item_id` pointing here and the catalogue is what
 * gives the category and billing mode their meaning, so hard-deleting a used
 * service would strip that context off historical bills. This is the same
 * "deactivate, don't delete" rule the doctor registry follows
 * (docs/PATIENT_DOCTOR_MODULE.md) and the opposite of BUGS.md #58, where lab
 * tests were hard-deleted with results attached.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { normaliseChargeItemBody, validateChargeItem } from '@/lib/billing/validate'
import { firstError } from '@/lib/patients/validate'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('charge_items')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Charge item not found' }, { status: 404 })

    return NextResponse.json({ chargeItem: data })
  } catch (error: any) {
    console.error('Error fetching charge item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch the charge item' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge-catalogue:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const values = normaliseChargeItemBody(body)

    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const check = validateChargeItem(values, 'update')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('charge_items')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Charge item not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('charge_items')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select()
      .single()

    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'A charge with that name or code already exists' },
        { status: 409 }
      )
    }
    if (error) throw error

    return NextResponse.json({ message: 'Charge item updated', chargeItem: data })
  } catch (error: any) {
    console.error('Error updating charge item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update the charge item' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge-catalogue:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('charge_items')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Charge item not found' }, { status: 404 })

    // Anything pointing at this entry makes the row history, not config.
    const { count: chargeCount } = await supabase
      .from('patient_charges')
      .select('id', { count: 'exact', head: true })
      .eq('charge_item_id', id)

    const { count: sheetCount } = await supabase
      .from('charge_sheet_items')
      .select('id', { count: 'exact', head: true })
      .eq('charge_item_id', id)

    const inUse = (chargeCount ?? 0) + (sheetCount ?? 0)

    if (inUse > 0) {
      const { error } = await supabase
        .from('charge_items')
        .update({ is_active: false, updated_by: user.id })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({
        message: `In use on ${inUse} record(s), so it has been deactivated rather than deleted. It will no longer appear when adding a charge.`,
        deactivated: true,
      })
    }

    const { error } = await supabase.from('charge_items').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ message: 'Charge item deleted', deactivated: false })
  } catch (error: any) {
    console.error('Error deleting charge item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete the charge item' },
      { status: 500 }
    )
  }
}
