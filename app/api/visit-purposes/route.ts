/**
 * Visit purposes — what kinds of doctor visit exist.
 *
 * Settlements group on this, so it is not a cosmetic label: adding a purpose
 * adds a dimension along which doctors are paid separately. Reads are open
 * because the visit form needs the list; writes are ADMIN.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { firstError } from '@/lib/patients/validate'
import type { FieldErrors } from '@/lib/case-sheet/types'

const SELECT = 'id, code, name, default_fee, sort_order, is_active, created_at, updated_at'

/** `consultation` -> `consultation`, `Operation / Surgery` -> `operation_surgery`. */
const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

function validate(values: Record<string, any>, mode: 'create' | 'update') {
  const errors: FieldErrors = {}
  const present = (f: string) => mode === 'create' || f in values

  if (present('name') && !String(values.name ?? '').trim()) {
    errors.name = 'Name is required'
  }

  if ('default_fee' in values) {
    const fee = Number(values.default_fee)
    if (!Number.isFinite(fee) || fee < 0) errors.default_fee = 'Fee must be zero or more'
  }

  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    let query = supabase.from('visit_purposes').select(SELECT)

    const active = request.nextUrl.searchParams.get('active')
    if (active !== 'false') query = query.eq('is_active', true)

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ visitPurposes: data || [] })
  } catch (error: any) {
    console.error('Error fetching visit purposes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch visit purposes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'visit-purpose:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json().catch(() => ({}))

    const values: Record<string, any> = {
      name: String(body.name ?? '').trim(),
      default_fee: body.default_fee === undefined ? 0 : Number(body.default_fee),
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    }

    const check = validate(values, 'create')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    // Derived rather than user-supplied: the code is a machine key that
    // lib/billing/fees.ts and the backfills look up by, and letting it be typed
    // invites a collision with 'consultation'.
    const code = body.code ? slugify(String(body.code)) : slugify(values.name)
    if (!code) {
      return NextResponse.json(
        { error: 'Name must contain at least one letter or number', fieldErrors: { name: 'Invalid' } },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('visit_purposes')
      .insert({ ...values, code, is_active: true, created_by: user.id, updated_by: user.id })
      .select(SELECT)
      .single()

    if (error?.code === '23505') {
      return NextResponse.json({ error: 'That purpose already exists' }, { status: 409 })
    }
    if (error) throw error

    return NextResponse.json({ message: 'Visit purpose added', visitPurpose: data }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating visit purpose:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create the visit purpose' },
      { status: 500 }
    )
  }
}
