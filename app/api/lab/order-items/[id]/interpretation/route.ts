import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'

type Params = { params: Promise<{ id: string }> }

const MAX_LENGTH = 5000

/**
 * PUT /api/lab/order-items/:id/interpretation — the clinical summary.
 *
 * "Interpretation" is the standard heading for this on a pathology report. It
 * is an opinion rather than a measurement, so ISO 15189 wants it attributable:
 * the author and time are stamped on every save.
 *
 * Writable by ADMIN, DOCTOR and LAB_TECHNICIAN.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'interpretation:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()

    if (typeof body?.interpretation !== 'string' && body?.interpretation !== null) {
      return NextResponse.json(
        { success: false, error: 'interpretation must be text' },
        { status: 400 },
      )
    }

    const text = typeof body.interpretation === 'string' ? body.interpretation.trim() : ''

    if (text.length > MAX_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Interpretation is limited to ${MAX_LENGTH} characters` },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const { data: item, error: findError } = await supabase
      .from('lab_order_items')
      .select('id, status')
      .eq('id', id)
      .single()

    if (findError || !item) {
      return NextResponse.json({ success: false, error: 'Test not found on any order' }, { status: 404 })
    }

    if (item.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This test was cancelled' },
        { status: 400 },
      )
    }

    // Clearing the text clears the attribution with it, so the report never
    // shows an author for an empty interpretation.
    const update = text
      ? {
          interpretation: text,
          interpretation_by: auth.user.id,
          interpretation_at: new Date().toISOString(),
        }
      : { interpretation: null, interpretation_by: null, interpretation_at: null }

    const { data, error } = await supabase
      .from('lab_order_items')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: text ? 'Interpretation saved' : 'Interpretation cleared',
      data,
    })
  } catch (error: any) {
    console.error('Error saving interpretation:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save interpretation' },
      { status: 500 },
    )
  }
}
