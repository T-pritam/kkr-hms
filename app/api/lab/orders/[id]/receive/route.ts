import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { assertOrderTransition } from '@/lib/lab/status'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/lab/orders/:id/receive — record receipt of the sample in the lab.
 *
 * Collection time and receipt time are separate on every real report: the gap
 * between them is the sample's transit time, and a long one is the first thing
 * looked at when a result is questioned.
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
      assertOrderTransition(order.status, 'received')
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    }

    const receivedAt = body.received_at || new Date().toISOString()

    if (order.collected_at && new Date(receivedAt) < new Date(order.collected_at)) {
      return NextResponse.json(
        { success: false, error: 'A sample cannot be received before it was collected' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('lab_orders')
      .update({ status: 'received', received_at: receivedAt })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Sample receipt recorded', data })
  } catch (error: any) {
    console.error('Error recording sample receipt:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to record sample receipt' },
      { status: 500 },
    )
  }
}
