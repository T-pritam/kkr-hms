import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'

/**
 * Reusable interpretation text.
 *
 * A template with `test_id` set is offered for that test; one with a null
 * `test_id` is offered everywhere. Picking a template inserts its text into the
 * interpretation box for editing — it is a starting point, not a lock.
 */

// GET /api/lab/interpretation-templates?test_id=…
export async function GET(request: NextRequest) {
  try {
    const auth = await requireLab(request, 'catalogue:read')
    if (auth.response) return auth.response

    const testId = request.nextUrl.searchParams.get('test_id')
    const supabase = await createClient()

    let query = supabase
      .from('lab_interpretation_templates')
      .select('*')
      .eq('is_active', true)

    // Templates for this test plus the global ones.
    if (testId) query = query.or(`test_id.eq.${testId},test_id.is.null`)

    const { data, error } = await query.order('title', { ascending: true })
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error fetching interpretation templates:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch interpretation templates' },
      { status: 500 },
    )
  }
}

// POST /api/lab/interpretation-templates
export async function POST(request: NextRequest) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const body = await request.json()
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const text = typeof body?.body === 'string' ? body.body.trim() : ''

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ success: false, error: 'Template text is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('lab_interpretation_templates')
      .insert({
        test_id: body.test_id || null,
        title,
        body: text,
        is_active: body.is_active !== false,
        created_by: auth.user.id,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      { success: true, message: 'Template saved', data },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error creating interpretation template:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create interpretation template' },
      { status: 500 },
    )
  }
}
