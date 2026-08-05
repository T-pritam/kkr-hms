/**
 * The charge catalogue — list and create.
 *
 * This is the price list. Before it existed, the chargeable things were a
 * hardcoded array of ten strings inside components/patients/charges-tab.tsx and
 * the amount was typed from memory every time, so adding a service meant a
 * redeploy and two people could bill the same thing differently on the same day.
 *
 * Writes are ADMIN only, for the same reason app/api/lab-tests/route.ts is: one
 * edit here changes what every future charge costs. Reads are open, because every
 * charge form in the app needs the list.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { normaliseChargeItemBody, validateChargeItem } from '@/lib/billing/validate'
import { CHARGE_CATEGORIES } from '@/lib/billing/constants'
import { firstError } from '@/lib/patients/validate'
import { pageMeta, parsePaging, safeSearch } from '@/lib/api/query'

const LIST_SELECT = `
  id, code, name, category, billing_mode, default_price, unit_label, is_active, notes,
  created_at, updated_at,
  updated_by_user:users!updated_by(id, username)
`

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const params = request.nextUrl.searchParams
    const paging = parsePaging(params)
    const search = safeSearch(params.get('search'))

    const supabase = await createClient()
    let query = supabase.from('charge_items').select(LIST_SELECT, { count: 'exact' })

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    const category = params.get('category')
    if (category && (CHARGE_CATEGORIES as readonly string[]).includes(category)) {
      query = query.eq('category', category)
    }

    const billingMode = params.get('billing_mode')
    if (billingMode === 'one_time' || billingMode === 'per_day') {
      query = query.eq('billing_mode', billingMode)
    }

    const active = params.get('active')
    if (active === 'true') query = query.eq('is_active', true)
    if (active === 'false') query = query.eq('is_active', false)

    const { data, error, count } = await query
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .range(paging.from, paging.to)

    if (error) throw error

    return NextResponse.json({ chargeItems: data || [], ...pageMeta(count, paging) })
  } catch (error: any) {
    console.error('Error fetching charge items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch charge items' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge-catalogue:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json().catch(() => ({}))
    const values = normaliseChargeItemBody(body)

    const check = validateChargeItem(values, 'create')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('charge_items')
      .insert({
        ...values,
        default_price: values.default_price ?? 0,
        is_active: values.is_active ?? true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    // Let the unique index be the thing that rejects a duplicate rather than a
    // check-then-insert, which races two admins adding the same service.
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'A charge with that name or code already exists' },
        { status: 409 }
      )
    }
    if (error) throw error

    return NextResponse.json(
      { message: 'Charge added to the catalogue', chargeItem: data },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating charge item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create the charge item' },
      { status: 500 }
    )
  }
}
