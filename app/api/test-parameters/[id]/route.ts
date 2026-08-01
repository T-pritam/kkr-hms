import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { normaliseParameterBody, validateParameterPayload } from '@/lib/lab/validate'

type Params = { params: Promise<{ id: string }> }

/**
 * PUT /api/test-parameters/:id
 *
 * Validates the merged row rather than the patch. The previous version enforced
 * the reference-interval invariants only on create, so a parameter could be
 * edited into an invalid state (BUGS.md #59).
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    const { data: existing, error: findError } = await supabase
      .from('test_parameters')
      .select('*')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ success: false, error: 'Parameter not found' }, { status: 404 })
    }

    const fields = normaliseParameterBody(body)

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    const check = validateParameterPayload({ ...existing, ...fields })
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }

    if (fields.code && fields.code !== existing.code) {
      const { data: clash } = await supabase
        .from('test_parameters')
        .select('id')
        .eq('test_id', existing.test_id)
        .eq('code', fields.code)
        .neq('id', id)
        .maybeSingle()

      if (clash) {
        return NextResponse.json(
          { success: false, error: `Another parameter in this test already uses the code ${fields.code}` },
          { status: 400 },
        )
      }
    }

    const { data, error } = await supabase
      .from('test_parameters')
      .update(fields)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Parameter updated', data })
  } catch (error: any) {
    console.error('Error updating test parameter:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update test parameter' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/test-parameters/:id
 *
 * Deactivates rather than destroys once the parameter has been reported on:
 * `lab_result_values.parameter_id` is ON DELETE RESTRICT, and an old report
 * must stay reproducible.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'catalogue:write')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data: existing, error: findError } = await supabase
      .from('test_parameters')
      .select('id, name')
      .eq('id', id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ success: false, error: 'Parameter not found' }, { status: 404 })
    }

    const { count } = await supabase
      .from('lab_result_values')
      .select('id', { count: 'exact', head: true })
      .eq('parameter_id', id)

    if ((count || 0) > 0) {
      const { error } = await supabase
        .from('test_parameters')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error

      return NextResponse.json({
        success: true,
        message: `"${existing.name}" already appears on ${count} report(s), so it has been deactivated rather than deleted. It will not appear on new orders.`,
      })
    }

    const { error } = await supabase.from('test_parameters').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, message: 'Parameter removed' })
  } catch (error: any) {
    console.error('Error removing test parameter:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove test parameter' },
      { status: 500 },
    )
  }
}
