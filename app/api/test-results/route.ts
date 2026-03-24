import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// GET /api/test-results - Get all test results
export async function GET(request: NextRequest) {
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 100)
    const status = searchParams.get('status')
    const test_id = searchParams.get('test_id')
    const patient_id = searchParams.get('patient_id')
    const from_date = searchParams.get('from_date')
    const to_date = searchParams.get('to_date')

    const supabase = await createClient()

    // Build query with joins
    let query = supabase
      .from('patient_test_results')
      .select(`
        id,
        test_date,
        status,
        price,
        discount,
        final_price,
        patient_name,
        patient_phone,
        patient_age,
        patient_gender,
        notes,
        created_at,
        updated_at,
        lab_tests (
          id,
          name,
          code,
          category,
          sample_type
        )
      `, { count: 'exact' })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }
    if (test_id) {
      query = query.eq('test_id', test_id)
    }
    if (patient_id) {
      query = query.eq('patient_id', patient_id)
    }
    if (from_date) {
      query = query.gte('test_date', from_date)
    }
    if (to_date) {
      query = query.lte('test_date', to_date)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await query
      .order('test_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize)
        }
      }
    })
  } catch (error: any) {
    console.error('Error fetching test results:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch test results' },
      { status: 500 }
    )
  }
}

// POST /api/test-results - Create test order
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const {
      patient_id,
      test_id,
      test_date,
      price,
      discount,
      reference_doctor_id,
      patient_name,
      patient_phone,
      patient_age,
      patient_gender,
      notes
    } = body

    // Validate required fields
    if (!test_id || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'test_id and price are required' },
        { status: 400 }
      )
    }

    if (!patient_name) {
      return NextResponse.json(
        { success: false, error: 'patient_name is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Calculate final price
    const discountAmount = discount || 0
    const finalPrice = price - discountAmount

    // Create test result
    const { data, error } = await supabase
      .from('patient_test_results')
      .insert({
        ...(patient_id ? { patient_id } : {}),
        test_id,
        test_date: test_date || new Date().toISOString().split('T')[0],
        price,
        discount: discountAmount,
        final_price: finalPrice,
        status: 'pending',
        reference_doctor_id,
        patient_name,
        patient_phone,
        patient_age,
        patient_gender,
        notes
      })
      .select(`
        *,
        lab_tests (
          id,
          name,
          code,
          category
        )
      `)
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test order created successfully',
      data
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating test order:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create test order' },
      { status: 500 }
    )
  }
}
