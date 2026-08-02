/**
 * Medicine master.
 *
 *   GET  — search, for the discharge-advice autocomplete
 *   POST — add a name someone typed that wasn't there yet
 *
 * The list starts empty and fills up as staff use it. The point is not a
 * pharmacy catalogue — it is that "Pantoprazole", "pantoprazole" and
 * "Pantaprazole" stop being three different drugs on three different summaries.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCaseSheet } from '@/lib/case-sheet/authz'

export async function GET(request: NextRequest) {
  const auth = await requireCaseSheet(request, 'casesheet:read')
  if (auth.response) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 100)

    const supabase = await createClient()

    let query = supabase
      .from('medicines')
      .select('id, name, form, strength, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(limit)

    if (search) {
      // Commas and parentheses are PostgREST filter syntax; a drug name like
      // "Paracetamol (500)" would otherwise be parsed as a filter expression.
      query = query.ilike('name', `%${search.replace(/[,()]/g, ' ')}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error loading medicines:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load medicines' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCaseSheet(request, 'medicine:write')
  if (auth.response) return auth.response
  const { user } = auth

  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Enter the medicine name' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // Adding one that already exists is not an error — the user is mid-flow and
    // just wants something to select. Hand back the existing row.
    const { data: existing } = await supabase
      .from('medicines')
      .select('id, name, form, strength, is_active')
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, data: existing })
    }

    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

    const { data, error } = await supabase
      .from('medicines')
      .insert({
        name,
        form: text(body.form),
        strength: text(body.strength),
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id, name, form, strength, is_active')
      .single()

    if (error) {
      // Two people adding the same name at once race past the check above; the
      // unique index on lower(name) catches it.
      if (error.code === '23505') {
        const { data: raced } = await supabase
          .from('medicines')
          .select('id, name, form, strength, is_active')
          .ilike('name', name)
          .maybeSingle()
        if (raced) return NextResponse.json({ success: true, data: raced })
      }
      throw error
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating medicine:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to add the medicine' },
      { status: 500 },
    )
  }
}
