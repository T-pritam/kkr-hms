import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { assertOrderTransition } from '@/lib/lab/status'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/lab/orders/:id/collect — record sample collection.
 *
 * The old "Collect Sample" button wrote only `status` and never
 * `sample_collected_at`, which is why every report printed
 * "Collection Date: N/A". The timestamp is the point of this endpoint.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'order:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const { data: order, error: findError } = await supabase
      .from('lab_orders')
      .select('id, status, collected_at')
      .eq('id', id)
      .single()

    if (findError || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    try {
      assertOrderTransition(order.status, 'collected')
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }

    const collectedAt = body.collected_at || new Date().toISOString()

    const { data, error } = await supabase
      .from('lab_orders')
      .update({
        status: 'collected',
        collected_at: collectedAt,
        collected_by: auth.user.id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Sample collection recorded', data })
  } catch (error: any) {
    console.error('Error recording sample collection:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to record sample collection' },
      { status: 500 },
    )
  }
}
