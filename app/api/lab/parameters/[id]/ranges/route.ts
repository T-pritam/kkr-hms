import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { validateRangePayload, normaliseRangeBody } from '@/lib/lab/validate'

type Params = { params: Promise<{ id: string }> }

// GET /api/lab/parameters/:id/ranges
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:read')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('test_parameter_ranges')
      .select('*')
      .eq('parameter_id', id)
      .order('display_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error fetching reference intervals:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch reference intervals' },
      { status: 500 },
    )
  }
}

// POST /api/lab/parameters/:id/ranges
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()

    const check = validateRangePayload(body)
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: parameter, error: paramError } = await supabase
      .from('test_parameters')
      .select('id')
      .eq('id', id)
      .single()

    if (paramError || !parameter) {
      return NextResponse.json({ success: false, error: 'Parameter not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('test_parameter_ranges')
      .insert({
        parameter_id: id,
        range_type: body.range_type || 'between',
        ...normaliseRangeBody(body),
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      { success: true, message: 'Reference interval added', data },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error adding reference interval:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to add reference interval' },
      { status: 500 },
    )
  }
}
