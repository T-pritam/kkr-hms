import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { normaliseParameterBody, validateParameterPayload } from '@/lib/lab/validate'

type Params = { params: Promise<{ id: string }> }

// GET /api/lab-tests/:id/parameters — parameters plus their reference intervals
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:read')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: test, error: testError } = await supabase
      .from('lab_tests')
      .select('id')
      .eq('id', id)
      .single()

    if (testError || !test) {
      return NextResponse.json({ success: false, error: 'Lab test not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('test_parameters')
      .select('*')
      .eq('test_id', id)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    const parameters = data || []
    let ranges: any[] = []
    if (parameters.length > 0) {
      const { data: rangeRows, error: rangeError } = await supabase
        .from('test_parameter_ranges')
        .select('*')
        .in('parameter_id', parameters.map((p: any) => p.id))
        .order('display_order', { ascending: true })
      if (rangeError) throw rangeError
      ranges = rangeRows || []
    }

    return NextResponse.json({
      success: true,
      data: parameters.map((p: any) => ({
        ...p,
        ranges: ranges.filter(r => r.parameter_id === p.id),
      })),
    })
  } catch (error: any) {
    console.error('Error fetching test parameters:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch test parameters' },
      { status: 500 },
    )
  }
}

// POST /api/lab-tests/:id/parameters
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()

    const check = validateParameterPayload(body)
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: test, error: testError } = await supabase
      .from('lab_tests')
      .select('id')
      .eq('id', id)
      .single()

    if (testError || !test) {
      return NextResponse.json({ success: false, error: 'Lab test not found' }, { status: 404 })
    }

    const fields = normaliseParameterBody(body)

    if (fields.code) {
      const { data: clash } = await supabase
        .from('test_parameters')
        .select('id')
        .eq('test_id', id)
        .eq('code', fields.code)
        .maybeSingle()

      if (clash) {
        return NextResponse.json(
          { success: false, error: `Another parameter in this test already uses the code ${fields.code}` },
          { status: 400 },
        )
      }
    }

    const { data, error } = await supabase
      .from('test_parameters')
      .insert({
        test_id: id,
        param_type: 'numeric',
        decimals: 2,
        is_active: true,
        display_order: 0,
        ...fields,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      { success: true, message: 'Parameter added', data },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error creating test parameter:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create test parameter' },
      { status: 500 },
    )
  }
}
