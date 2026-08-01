import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'

const WRITABLE = [
  'name', 'code', 'category', 'description', 'sample_type',
  'method', 'interpretation_template', 'price', 'is_active',
] as const

// GET /api/lab-tests — the test catalogue
export async function GET(request: NextRequest) {
  try {
    const auth = await requireLab(request, 'catalogue:read')
    if (auth.response) return auth.response

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const pageSize = Math.min(Math.max(1, parseInt(sp.get('pageSize') || '50')), 100)
    const category = sp.get('category')
    const isActive = sp.get('is_active')
    const name = sp.get('name')

    const supabase = await createClient()
    let query = supabase.from('lab_tests').select('*', { count: 'exact' })

    if (category) query = query.eq('category', category)
    if (isActive !== null && isActive !== undefined) query = query.eq('is_active', isActive === 'true')
    if (name) query = query.ilike('name', `%${name}%`)

    const from = (page - 1) * pageSize
    const { data, error, count } = await query
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    })
  } catch (error: any) {
    console.error('Error fetching lab tests:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lab tests' },
      { status: 500 },
    )
  }
}

// POST /api/lab-tests — ADMIN only: this is the price list and clinical config
export async function POST(request: NextRequest) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''

    if (!name || !code || body.price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Name, code and price are required' },
        { status: 400 },
      )
    }

    const price = Number(body.price)
    if (!isFinite(price) || price < 0) {
      return NextResponse.json(
        { success: false, error: 'Price must be zero or more' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('lab_tests')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Test code already exists' },
        { status: 400 },
      )
    }

    const insert: Record<string, any> = { name, code, price, is_active: body.is_active !== false }
    for (const field of WRITABLE) {
      if (['name', 'code', 'price', 'is_active'].includes(field)) continue
      if (body[field] !== undefined) insert[field] = body[field] === '' ? null : body[field]
    }

    const { data, error } = await supabase.from('lab_tests').insert(insert).select().single()
    if (error) throw error

    return NextResponse.json(
      { success: true, message: 'Lab test created successfully', data },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error creating lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create lab test' },
      { status: 500 },
    )
  }
}
