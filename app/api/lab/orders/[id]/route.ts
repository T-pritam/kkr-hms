import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { loadOrderDetail } from '@/lib/lab/order-detail'
import { assertOrderTransition } from '@/lib/lab/status'
import { ORDER_PRIORITIES } from '@/lib/lab/constants'

type Params = { params: Promise<{ id: string }> }

// GET /api/lab/orders/:id — full order with tests, values and resolved intervals
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'order:read')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()
    const order = await loadOrderDetail(supabase as any, id)

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: order })
  } catch (error: any) {
    console.error('Error fetching lab order:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lab order' },
      { status: 500 },
    )
  }
}

/**
 * Only these are patchable. Status moves through the dedicated collect/receive
 * endpoints or the validated `status` field below; timestamps and totals are
 * derived, never client-supplied.
 */
const PATCHABLE = [
  'patient_name', 'patient_phone', 'patient_age', 'patient_gender',
  'referring_doctor_id', 'referring_doctor_name', 'priority', 'notes',
] as const

// PUT /api/lab/orders/:id
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'order:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    const { data: existing, error: findError } = await supabase
      .from('lab_orders')
      .select('id, status, total_amount')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    const update: Record<string, any> = {}
    for (const field of PATCHABLE) {
      if (body[field] !== undefined) update[field] = body[field]
    }

    if (update.priority && !ORDER_PRIORITIES.includes(update.priority)) {
      return NextResponse.json(
        { success: false, error: `Priority must be one of: ${ORDER_PRIORITIES.join(', ')}` },
        { status: 400 },
      )
    }

    if (body.status !== undefined) {
      try {
        assertOrderTransition(existing.status, body.status)
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 })
      }
      update.status = body.status
      if (body.status === 'reported') update.reported_at = new Date().toISOString()
    }

    if (body.discount !== undefined) {
      const total = Number(existing.total_amount) || 0
      const discount = Math.min(Math.max(Number(body.discount) || 0, 0), total)
      update.discount = discount
      update.net_amount = total - discount
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lab_orders')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Order updated', data })
  } catch (error: any) {
    console.error('Error updating lab order:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update lab order' },
      { status: 500 },
    )
  }
}

/**
 * DELETE cancels rather than destroys once results exist — a report that has
 * been handed to a patient must remain reproducible.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'order:write')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: existing, error: findError } = await supabase
      .from('lab_orders')
      .select('id, status')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    const { count } = await supabase
      .from('lab_result_values')
      .select('id, order_item_id', { count: 'exact', head: true })
      .in('order_item_id',
        ((await supabase.from('lab_order_items').select('id').eq('order_id', id)).data || [])
          .map((i: any) => i.id),
      )

    if ((count || 0) > 0) {
      await supabase.from('lab_orders').update({ status: 'cancelled' }).eq('id', id)
      await supabase.from('lab_order_items').update({ status: 'cancelled' }).eq('order_id', id)
      return NextResponse.json({
        success: true,
        message: 'Order cancelled. Results already exist, so the record has been kept.',
      })
    }

    const { error } = await supabase.from('lab_orders').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, message: 'Order deleted' })
  } catch (error: any) {
    console.error('Error deleting lab order:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete lab order' },
      { status: 500 },
    )
  }
}
