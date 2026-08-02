import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireDoctor } from '@/lib/doctors/authz'

/**
 * The unpaginated doctor list behind every picker in the app.
 *
 * The comment here used to say "all active doctors" while there was no such
 * thing as an inactive one. There is now, and this is the filter that makes
 * deactivation mean something: a retired doctor stops being offered for new
 * work without vanishing from the records that already name them.
 *
 * `?includeId=` adds one doctor back regardless of status, so editing an
 * existing record whose doctor has since retired does not silently drop the
 * selection the moment the form loads.
 *
 * Returns a bare array — three callers rely on that shape.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireDoctor(request, 'doctor:read')
    if (auth.response) return auth.response

    const includeId = request.nextUrl.searchParams.get('includeId')

    const supabase = await createClient()

    let query = supabase
      .from('doctors')
      .select('id, name, specialist, designation, qualification, department, is_active')

    query = includeId
      ? query.or(`is_active.eq.true,id.eq.${includeId}`)
      : query.eq('is_active', true)

    const { data: doctors, error } = await query.order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json(doctors || [])
  } catch (error) {
    console.error('Error fetching doctors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch doctors' },
      { status: 500 }
    )
  }
}
