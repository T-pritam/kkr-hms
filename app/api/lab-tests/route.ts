import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// GET /api/lab-tests - Get all lab tests
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
    const category = searchParams.get('category')
    const is_active = searchParams.get('is_active')
    const name = searchParams.get('name')

    const supabase = await createClient()

    // Build query
    let query = supabase
      .from('lab_tests')
      .select('*', { count: 'exact' })

    // Apply filters
    if (category) {
      query = query.eq('category', category)
    }
    if (is_active !== null && is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true')
    }
    if (name) {
      query = query.ilike('name', `%${name}%`)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await query
      .order('category', { ascending: true })
      .order('name', { ascending: true })
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
    console.error('Error fetching lab tests:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lab tests' },
      { status: 500 }
    )
  }
}

// POST /api/lab-tests - Create new lab test
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
      name,
      code,
      category,
      description,
      sample_type,
      price,
      is_active
    } = body

    // Validate required fields
    if (!name || !code || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Name, code, and price are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if code already exists
    const { data: existing } = await supabase
      .from('lab_tests')
      .select('id')
      .eq('code', code)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Test code already exists' },
        { status: 400 }
      )
    }

    // Create lab test
    const { data, error } = await supabase
      .from('lab_tests')
      .insert({
        name,
        code,
        category,
        description,
        sample_type,
        price,
        is_active: is_active !== undefined ? is_active : true
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Lab test created successfully',
      data
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create lab test' },
      { status: 500 }
    )
  }
}
