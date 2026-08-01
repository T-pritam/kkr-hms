import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'

type Params = { params: Promise<{ id: string }> }

const WRITABLE = [
  'name', 'code', 'category', 'description', 'sample_type',
  'method', 'interpretation_template', 'price', 'is_active',
] as const

// GET /api/lab-tests/:id
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:read')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('lab_tests')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Lab test not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lab test' },
      { status: 500 },
    )
  }
}

// PUT /api/lab-tests/:id
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()

    const update: Record<string, any> = {}
    for (const field of WRITABLE) {
      if (body[field] === undefined) continue
      if (field === 'code') { update.code = String(body.code).trim().toUpperCase(); continue }
      if (field === 'name') { update.name = String(body.name).trim(); continue }
      if (field === 'price') {
        const price = Number(body.price)
        if (!isFinite(price) || price < 0) {
          return NextResponse.json(
            { success: false, error: 'Price must be zero or more' },
            { status: 400 },
          )
        }
        update.price = price
        continue
      }
      update[field] = body[field] === '' ? null : body[field]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const supabase = await createClient()

    if (update.code) {
      const { data: existing } = await supabase
        .from('lab_tests')
        .select('id')
        .eq('code', update.code)
        .neq('id', id)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Test code already exists' },
          { status: 400 },
        )
      }
    }

    const { data, error } = await supabase
      .from('lab_tests')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Lab test not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ success: true, message: 'Lab test updated successfully', data })
  } catch (error: any) {
    console.error('Error updating lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update lab test' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/lab-tests/:id
 *
 * Retires the test rather than deleting it once it has been ordered. The old
 * handler issued a hard delete and let the database's ON DELETE RESTRICT
 * surface as a raw 500 (BUGS.md #58); a retired test simply stops appearing on
 * new orders while old reports stay intact.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: test, error: findError } = await supabase
      .from('lab_tests')
      .select('id, name')
      .eq('id', id)
      .single()

    if (findError || !test) {
      return NextResponse.json({ success: false, error: 'Lab test not found' }, { status: 404 })
    }

    const { count } = await supabase
      .from('lab_order_items')
      .select('id', { count: 'exact', head: true })
      .eq('test_id', id)

    if ((count || 0) > 0) {
      const { error } = await supabase
        .from('lab_tests')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

      return NextResponse.json({
        success: true,
        message: `"${test.name}" has been ordered ${count} time(s), so it has been retired rather than deleted. It will not appear on new orders.`,
      })
    }

    const { error } = await supabase.from('lab_tests').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, message: 'Lab test deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete lab test' },
      { status: 500 },
    )
  }
}
