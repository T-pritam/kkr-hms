import { NextRequest, NextResponse } from 'next/server'
import { parsePaging } from '@/lib/api/query'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken } from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(accessToken)
    if (!payload || payload.type !== 'access' || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    // Clamped like every other list (#70): `?pageSize=100000` returned everyone.
    const { page, pageSize, from, to } = parsePaging(searchParams)
    const search = (searchParams.get('search') || '').trim()

    const supabase = await createClient()

    // Build query with search
    let query = supabase
      .from('users')
      .select('id, username, email, role, status, last_login, created_at', { count: 'exact' })

    /**
     * The term is a *value*, so it is double-quoted — PostgREST's own escape for
     * a value that contains `,` `(` or `)` — with `\` and `"` escaped inside.
     * Spliced in raw, a comma started a new OR term and a parenthesis a new
     * group, so a crafted search rewrote the filter (BUGS #5). Quoting also
     * keeps a real name like "Kumar, Ramesh" searchable, which stripping the
     * punctuation would not.
     */
    if (search) {
      const term = `"%${search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
      query = query.or(`username.ilike.${term},email.ilike.${term},role.ilike.${term}`)
    }

    const { data: users, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return NextResponse.json({
      users: users || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(accessToken)
    if (!payload || payload.type !== 'access' || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { username, email, password, role, status } = await request.json()

    if (!username || !email || !password || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Prevent creating admin users through this endpoint
    if (role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin users can only be created by super admin' },
        { status: 403 }
      )
    }

    const supabase = await createClient()

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        password_hash: passwordHash,
        role,
        status: status || 'ACTIVE',
        needs_password_change: true,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
      },
    })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}
