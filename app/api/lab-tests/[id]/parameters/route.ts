import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// GET /api/lab-tests/:id/parameters - Get parameters for a test
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const supabase = await createClient()

    // First check if test exists
    const { data: test, error: testError } = await supabase
      .from('lab_tests')
      .select('id')
      .eq('id', id)
      .single()

    if (testError || !test) {
      return NextResponse.json(
        { success: false, error: 'Lab test not found' },
        { status: 404 }
      )
    }

    // Get parameters
    const { data, error } = await supabase
      .from('test_parameters')
      .select('*')
      .eq('test_id', id)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: any) {
    console.error('Error fetching test parameters:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch test parameters' },
      { status: 500 }
    )
  }
}

// POST /api/lab-tests/:id/parameters - Add parameter to test
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      name,
      unit,
      min_value,
      max_value,
      gender_specific,
      male_min,
      male_max,
      female_min,
      female_max,
      display_order,
      is_active
    } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Parameter name is required' },
        { status: 400 }
      )
    }

    // Validate reference ranges
    if (gender_specific) {
      if (male_min === undefined || male_max === undefined || 
          female_min === undefined || female_max === undefined) {
        return NextResponse.json(
          { success: false, error: 'Gender-specific ranges must include male and female min/max values' },
          { status: 400 }
        )
      }
    } else {
      if (min_value === undefined || max_value === undefined) {
        return NextResponse.json(
          { success: false, error: 'General reference ranges (min_value, max_value) are required' },
          { status: 400 }
        )
      }
    }

    const supabase = await createClient()

    // Check if test exists
    const { data: test, error: testError } = await supabase
      .from('lab_tests')
      .select('id')
      .eq('id', id)
      .single()

    if (testError || !test) {
      return NextResponse.json(
        { success: false, error: 'Lab test not found' },
        { status: 404 }
      )
    }

    // Create parameter
    const { data, error } = await supabase
      .from('test_parameters')
      .insert({
        test_id: id,
        name,
        unit,
        min_value,
        max_value,
        gender_specific: gender_specific || false,
        male_min,
        male_max,
        female_min,
        female_max,
        display_order: display_order || 0,
        is_active: is_active !== undefined ? is_active : true
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test parameter created successfully',
      data
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating test parameter:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create test parameter' },
      { status: 500 }
    )
  }
}
