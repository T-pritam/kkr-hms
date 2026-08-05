import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'

/**
 * The unpaginated catalogue behind every charge picker.
 *
 * Same shape and same reasoning as app/api/doctors/all/route.ts: a bare array,
 * active entries only so a retired service stops being offered for new work
 * without vanishing from the bills that already name it, and `?includeId=` to add
 * one back when editing a charge whose service has since been retired — otherwise
 * the form would silently drop the selection on load.
 *
 * Returns a bare array; the pickers rely on that shape.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const includeId = request.nextUrl.searchParams.get('includeId')

    const supabase = await createClient()

    let query = supabase
      .from('charge_items')
      .select('id, code, name, category, billing_mode, default_price, unit_label, is_active')

    query = includeId
      ? query.or(`is_active.eq.true,id.eq.${includeId}`)
      : query.eq('is_active', true)

    const { data, error } = await query
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error('Error fetching charge items:', error)
    return NextResponse.json({ error: 'Failed to fetch charge items' }, { status: 500 })
  }
}
