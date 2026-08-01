import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { assertItemTransition } from '@/lib/lab/status'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/lab/order-items/:id/authorise — clinical sign-off.
 *
 * Optional in this deployment: a report prints as soon as results are entered.
 * When someone does authorise, the report footer carries their name; until then
 * it shows a blank signature line.
 *
 * Restricted to ADMIN and DOCTOR, and only possible once results exist —
 * signing off an empty test is meaningless.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'authorise')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: item, error: findError } = await supabase
      .from('lab_order_items')
      .select('id, status, authorised_by')
      .eq('id', id)
      .single()

    if (findError || !item) {
      return NextResponse.json({ success: false, error: 'Test not found on any order' }, { status: 404 })
    }

    try {
      assertItemTransition(item.status, 'authorised')
    } catch {
      return NextResponse.json(
        { success: false, error: 'Enter results before authorising this test' },
        { status: 400 },
      )
    }

    const { count } = await supabase
      .from('lab_result_values')
      .select('id', { count: 'exact', head: true })
      .eq('order_item_id', id)

    if ((count || 0) === 0) {
      return NextResponse.json(
        { success: false, error: 'Enter results before authorising this test' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('lab_order_items')
      .update({
        status: 'authorised',
        authorised_by: auth.user.id,
        authorised_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Report authorised', data })
  } catch (error: any) {
    console.error('Error authorising test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to authorise test' },
      { status: 500 },
    )
  }
}

/** DELETE — withdraw an authorisation, e.g. before correcting a result. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'authorise')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: item, error: findError } = await supabase
      .from('lab_order_items')
      .select('id, status')
      .eq('id', id)
      .single()

    if (findError || !item) {
      return NextResponse.json({ success: false, error: 'Test not found on any order' }, { status: 404 })
    }

    if (item.status !== 'authorised') {
      return NextResponse.json(
        { success: false, error: 'This test is not authorised' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('lab_order_items')
      .update({ status: 'results_entered', authorised_by: null, authorised_at: null })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Authorisation withdrawn', data })
  } catch (error: any) {
    console.error('Error withdrawing authorisation:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to withdraw authorisation' },
      { status: 500 },
    )
  }
}
