/**
 * A single visit purpose — edit, and retire.
 *
 * There is no DELETE. A purpose with visits or settlements pointing at it is
 * load-bearing history, and `visit_purposes` is referenced ON DELETE RESTRICT
 * from both, so destroying one is refused by the database anyway. Deactivating
 * is the supported way to stop offering it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { firstError } from '@/lib/patients/validate'
import type { FieldErrors } from '@/lib/case-sheet/types'

const SELECT = 'id, code, name, default_fee, sort_order, is_active, created_at, updated_at'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'visit-purpose:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const values: Record<string, any> = {}
    const errors: FieldErrors = {}

    if ('name' in body) {
      const name = String(body.name ?? '').trim()
      if (!name) errors.name = 'Name is required'
      else values.name = name
    }

    if ('default_fee' in body) {
      const fee = Number(body.default_fee)
      if (!Number.isFinite(fee) || fee < 0) errors.default_fee = 'Fee must be zero or more'
      else values.default_fee = fee
    }

    if ('sort_order' in body) {
      const order = Number(body.sort_order)
      if (Number.isFinite(order)) values.sort_order = order
    }

    if ('is_active' in body) values.is_active = body.is_active === true || body.is_active === 'true'

    if (Object.keys(errors).length) {
      return NextResponse.json({ error: firstError(errors), fieldErrors: errors }, { status: 400 })
    }

    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('visit_purposes')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Visit purpose not found' }, { status: 404 })

    // `code` is deliberately not updatable — see app/api/visit-purposes/route.ts.
    const { data, error } = await supabase
      .from('visit_purposes')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select(SELECT)
      .single()

    if (error) throw error

    return NextResponse.json({ message: 'Visit purpose updated', visitPurpose: data })
  } catch (error: any) {
    console.error('Error updating visit purpose:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update the visit purpose' },
      { status: 500 }
    )
  }
}
