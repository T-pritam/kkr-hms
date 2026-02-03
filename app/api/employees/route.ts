import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

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
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const search = searchParams.get('search') || ''

    const supabase = await createClient()

    // Build query with search
    let query = supabase
      .from('employees')
      .select('*', { count: 'exact' })

    // Apply search filter if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%,designation.ilike.%${search}%`)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: employees, error, count } = await query
      .order('join_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      employees: employees || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    })
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

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
    const { name, designation, base_salary, join_date, status } = body

    // Validate required fields
    if (!name || !designation || !base_salary) {
      return NextResponse.json(
        { error: 'Name, designation, and base salary are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Insert new employee
    const { error } = await supabase.from('employees').insert({
      name,
      designation,
      base_salary: parseFloat(base_salary),
      join_date: join_date || new Date().toISOString().split('T')[0],
      status: status || 'Active',
    })

    if (error) {
      throw error
    }

    return NextResponse.json(
      { message: 'Employee created successfully' },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create employee' },
      { status: 500 }
    )
  }
}
