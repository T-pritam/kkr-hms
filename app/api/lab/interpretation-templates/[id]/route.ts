import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'

type Params = { params: Promise<{ id: string }> }

// PUT /api/lab/interpretation-templates/:id
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    const update: Record<string, any> = {}
    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title) return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 })
      update.title = title
    }
    if (body.body !== undefined) {
      const text = String(body.body).trim()
      if (!text) return NextResponse.json({ success: false, error: 'Template text is required' }, { status: 400 })
      update.body = text
    }
    if (body.test_id !== undefined) update.test_id = body.test_id || null
    if (body.is_active !== undefined) update.is_active = !!body.is_active

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lab_interpretation_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Template updated', data })
  } catch (error: any) {
    console.error('Error updating interpretation template:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update interpretation template' },
      { status: 500 },
    )
  }
}

/** DELETE deactivates rather than destroys, so reports keep their provenance. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('lab_interpretation_templates')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Template removed' })
  } catch (error: any) {
    console.error('Error removing interpretation template:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove interpretation template' },
      { status: 500 },
    )
  }
}
