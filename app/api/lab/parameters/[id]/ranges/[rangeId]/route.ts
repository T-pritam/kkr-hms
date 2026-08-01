import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { validateRangePayload, normaliseRangeBody } from '@/lib/lab/validate'

type Params = { params: Promise<{ id: string; rangeId: string }> }

// PUT /api/lab/parameters/:id/ranges/:rangeId
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id, rangeId } = await params
    const body = await request.json()
    const supabase = await createClient()

    const { data: existing, error: findError } = await supabase
      .from('test_parameter_ranges')
      .select('*')
      .eq('id', rangeId)
      .eq('parameter_id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ success: false, error: 'Reference interval not found' }, { status: 404 })
    }

    // Validate the merged row, not the patch: a PUT that only moves
    // `critical_high` must still be checked against the interval it belongs to.
    const merged = { ...existing, ...normaliseRangeBody(body) }
    const check = validateRangePayload(merged)
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('test_parameter_ranges')
      .update(normaliseRangeBody(body))
      .eq('id', rangeId)
      .eq('parameter_id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Reference interval updated', data })
  } catch (error: any) {
    console.error('Error updating reference interval:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update reference interval' },
      { status: 500 },
    )
  }
}

// DELETE /api/lab/parameters/:id/ranges/:rangeId
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id, rangeId } = await params
    const supabase = await createClient()

    const { data: existing, error: findError } = await supabase
      .from('test_parameter_ranges')
      .select('id')
      .eq('id', rangeId)
      .eq('parameter_id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ success: false, error: 'Reference interval not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('test_parameter_ranges')
      .delete()
      .eq('id', rangeId)
      .eq('parameter_id', id)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Reference interval removed' })
  } catch (error: any) {
    console.error('Error removing reference interval:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove reference interval' },
      { status: 500 },
    )
  }
}
