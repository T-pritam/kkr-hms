import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireDoctor } from '@/lib/doctors/authz'
import { normaliseDoctorBody, validateDoctor } from '@/lib/doctors/validate'
import { DEPARTMENTS } from '@/lib/doctors/constants'
import { firstError } from '@/lib/patients/validate'
import { pageMeta, parsePaging, safeSearch } from '@/lib/api/query'

/**
 * The doctor registry.
 *
 * Feeds the referring-doctor and consulting-doctor pickers across the app, so
 * it is clinical reference data rather than a scratchpad — hence the role guard
 * on writes and the deactivate-rather-than-delete rule in [id]/route.ts.
 */

const LIST_SELECT = `
  id, name, qualification, designation, department, specialist, mobile, email,
  registration_no, is_active, created_at, updated_at,
  updated_by_user:users!updated_by(id, username)
`

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDoctor(request, 'doctor:read')
    if (auth.response) return auth.response

    const params = request.nextUrl.searchParams
    const paging = parsePaging(params)
    const search = safeSearch(params.get('search'))

    const supabase = await createClient()

    let query = supabase.from('doctors').select(LIST_SELECT, { count: 'exact' })

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,specialist.ilike.%${search}%,department.ilike.%${search}%,` +
        `qualification.ilike.%${search}%,email.ilike.%${search}%,mobile.ilike.%${search}%`
      )
    }

    const department = params.get('department')
    if (department && (DEPARTMENTS as readonly string[]).includes(department)) {
      query = query.eq('department', department)
    }

    // Defaults to showing everyone. `?active=true` is how the list hides
    // retired doctors; the pickers use /api/doctors/all, which always does.
    const active = params.get('active')
    if (active === 'true') query = query.eq('is_active', true)
    if (active === 'false') query = query.eq('is_active', false)

    const { data: doctors, error, count } = await query
      .order('name', { ascending: true })
      .range(paging.from, paging.to)

    if (error) throw error

    return NextResponse.json({
      doctors: doctors || [],
      ...pageMeta(count, paging),
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
    const auth = await requireDoctor(request, 'doctor:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const values = normaliseDoctorBody(body)

    const check = validateDoctor(values, 'create')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // The row is returned so the case sheet editor can select a doctor it just
    // created without refetching the whole list.
    const { data, error } = await supabase
      .from('doctors')
      .insert({
        ...values,
        is_active: values.is_active ?? true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      { message: 'Doctor created successfully', doctor: data },
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
