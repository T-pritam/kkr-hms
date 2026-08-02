/**
 * One medicine in the master list.
 *
 *   PUT    — correct a name, form or strength
 *   DELETE — retires it (is_active = false)
 *
 * Deletion is soft on purpose. Discharge summaries snapshot the medicine name
 * onto `case_sheet_medications`, so a hard delete would not corrupt an existing
 * document — but `medicine_id` would go null and the link back to the master
 * would be lost. Retiring keeps the history and takes the name out of the
 * picklist, which is all anyone actually wants.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCaseSheet(request, 'medicine:write')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const update: Record<string, unknown> = { updated_by: user.id }
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

    if (body.name !== undefined) {
      const name = text(body.name)
      if (!name) {
        return NextResponse.json(
          { success: false, error: 'Enter the medicine name' },
          { status: 400 },
        )
      }
      update.name = name
    }
    if (body.form !== undefined) update.form = text(body.form)
    if (body.strength !== undefined) update.strength = text(body.strength)
    if (body.is_active !== undefined) update.is_active = Boolean(body.is_active)

    const { data, error } = await supabase
      .from('medicines')
      .update(update)
      .eq('id', id)
      .select('id, name, form, strength, is_active')
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A medicine with that name already exists' },
          { status: 409 },
        )
      }
      throw error
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'Medicine not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error updating medicine:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update the medicine' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCaseSheet(request, 'medicine:write')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('medicines')
      .update({ is_active: false, updated_by: user.id })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ success: false, error: 'Medicine not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Medicine retired' })
  } catch (error: any) {
    console.error('Error retiring medicine:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retire the medicine' },
      { status: 500 },
    )
  }
}
