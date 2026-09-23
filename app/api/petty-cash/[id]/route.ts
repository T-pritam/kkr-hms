/**
 * PUT / DELETE /api/petty-cash/[id] — correcting the float (PRD v2, CR-02).
 *
 * Reception may change or remove its **own** entries at any time, with no lock
 * and no closing (Q-12 = A): the balance simply moves, and the admin reconciles
 * it against the cash the desk holds. Every change is kept in the history, so
 * "the balance is ₹2,000 short" always has an answer (Q-70).
 *
 * A debit that paid an employee advance is changed on the advance, not here —
 * the two are one act (CR-03).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePettyCash } from '@/lib/petty-cash/authz'
import { deleteEntry, updateEntry, validateEntry } from '@/lib/petty-cash/entries'

async function loadEntry(supabase: any, id: string) {
  const { data } = await supabase.from('petty_cash_entries').select('*').eq('id', id).maybeSingle()
  return data
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePettyCash(request, 'petty-cash:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const entry = await loadEntry(supabase, id)
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    // The kind never changes on an edit, so it is taken from the stored row:
    // a top-up that became an expense would move the balance twice over.
    const check = validateEntry({ ...body, kind: entry.kind }, user.role)
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, fieldErrors: check.fieldErrors },
        { status: check.status },
      )
    }

    const result = await updateEntry(supabase, user, entry, check.value)
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json(result.entry)
  } catch (error: any) {
    console.error('Petty cash update error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update the entry' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePettyCash(request, 'petty-cash:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const supabase = await createClient()

    const entry = await loadEntry(supabase, id)
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    const result = await deleteEntry(supabase, user, entry)
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Petty cash delete error:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete the entry' }, { status: 500 })
  }
}
