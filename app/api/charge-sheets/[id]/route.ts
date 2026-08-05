/**
 * A single charge sheet — read, edit, and discard.
 *
 * A forwarded sheet is immutable. Its lines have been copied into
 * `patient_charges` and are on a real bill, so editing the sheet afterwards would
 * make it disagree with the money it produced. Cancel-or-edit applies to drafts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import {
  normaliseChargeSheetBody,
  normaliseChargeSheetItems,
  validateChargeSheet,
} from '@/lib/billing/validate'
import { firstError } from '@/lib/patients/validate'

const DETAIL_SELECT = `
  *,
  patient:patients(id, patient_id, name, phone, gender, age_years),
  items:charge_sheet_items(*),
  created_by_user:users!created_by(id, username),
  updated_by_user:users!updated_by(id, username)
`

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
      .from('charge_sheets')
      .select(DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Charge sheet not found' }, { status: 404 })

    return NextResponse.json({ chargeSheet: data })
  } catch (error: any) {
    console.error('Error fetching charge sheet:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch the charge sheet' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge-sheet:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const { data: sheet } = await supabase
      .from('charge_sheets')
      .select('id, status')
      .eq('id', id)
      .maybeSingle()

    if (!sheet) return NextResponse.json({ error: 'Charge sheet not found' }, { status: 404 })

    if (sheet.status === 'forwarded') {
      return NextResponse.json(
        { error: 'This sheet has been forwarded to billing and can no longer be edited' },
        { status: 409 }
      )
    }

    const values = normaliseChargeSheetBody(body)
    const hasItems = Array.isArray(body.items)
    const items = hasItems ? normaliseChargeSheetItems(body.items) : []

    const check = validateChargeSheet(values, items, 'update')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    if (body.status === 'cancelled') values.status = 'cancelled'
    if (body.status === 'draft') values.status = 'draft'

    // Items are replaced wholesale rather than diffed. A sheet is a handful of
    // lines edited as a unit, and a diff would need stable client-side ids for no
    // benefit here.
    if (hasItems) {
      values.total_amount = items.reduce((sum, i) => sum + (i.unit_price ?? 0) * (i.qty ?? 1), 0)

      const { error: clearError } = await supabase
        .from('charge_sheet_items')
        .delete()
        .eq('charge_sheet_id', id)

      if (clearError) throw clearError

      if (items.length > 0) {
        const { error: insertError } = await supabase.from('charge_sheet_items').insert(
          items.map(item => ({
            charge_sheet_id: id,
            charge_item_id: item.charge_item_id,
            description: item.description,
            unit_price: item.unit_price,
            qty: item.qty,
            service_date: item.service_date,
          }))
        )
        if (insertError) throw insertError
      }
    }

    const { data, error } = await supabase
      .from('charge_sheets')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ message: 'Charge sheet updated', chargeSheet: data })
  } catch (error: any) {
    console.error('Error updating charge sheet:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update the charge sheet' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge-sheet:write')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: sheet } = await supabase
      .from('charge_sheets')
      .select('id, status')
      .eq('id', id)
      .maybeSingle()

    if (!sheet) return NextResponse.json({ error: 'Charge sheet not found' }, { status: 404 })

    // A forwarded sheet is the provenance of charges on a real bill. Destroying it
    // would leave those charges with a source_sheet_id pointing at nothing.
    if (sheet.status === 'forwarded') {
      return NextResponse.json(
        { error: 'This sheet has been forwarded to billing and cannot be deleted' },
        { status: 409 }
      )
    }

    // Items go with it — charge_sheet_items cascades on the foreign key.
    const { error } = await supabase.from('charge_sheets').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ message: 'Charge sheet deleted' })
  } catch (error: any) {
    console.error('Error deleting charge sheet:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete the charge sheet' },
      { status: 500 }
    )
  }
}
