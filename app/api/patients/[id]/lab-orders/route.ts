import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/patients/:id/lab-orders — a patient's lab history, newest first.
 *
 * This is what linking orders to patient records buys: the old module copied
 * demographics as text and threw the patient id away, so a history could not be
 * assembled at all. With the link in place the same parameter can be compared
 * across visits.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'order:read')
    if (auth.response) return auth.response

    const { id } = await params
    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const pageSize = Math.min(Math.max(1, parseInt(sp.get('pageSize') || '20')), 100)

    const supabase = await createClient()
    const from = (page - 1) * pageSize

    const { data, error, count } = await supabase
      .from('lab_orders')
      .select(
        `*, lab_order_items (
           id, test_id, test_name, test_code, category, status, price,
           interpretation, authorised_at, display_order
         )`,
        { count: 'exact' },
      )
      .eq('patient_id', id)
      .order('registered_at', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    })
  } catch (error: any) {
    console.error('Error fetching patient lab orders:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch patient lab orders' },
      { status: 500 },
    )
  }
}
