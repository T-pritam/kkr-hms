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
      .from('doctors')
      .select('*', { count: 'exact' })

    // Apply search filter if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%,specialist.ilike.%${search}%,email.ilike.%${search}%,mobile.ilike.%${search}%`)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: doctors, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      doctors: doctors || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    })
  } catch (error: any) {
    console.error('Error fetching doctors:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch doctors' },
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
    const { name, mobile, email, designation, specialist } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Insert new doctor
    const { error } = await supabase.from('doctors').insert({
      name,
      mobile,
      email,
      designation,
      specialist,
    })

    if (error) {
      throw error
    }

    return NextResponse.json(
      { message: 'Doctor created successfully' },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating doctor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create doctor' },
      { status: 500 }
    )
  }
}
