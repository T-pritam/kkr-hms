/**
 * /api/petty-cash — the desk's cash float (PRD v2, CR-02).
 *
 *   GET   the statement, oldest entry first in the running balance, newest
 *         first on screen, with the totals. ?from&to&kind
 *   POST  one entry. Reception may add an expense; the opening balance and
 *         top-ups are the admin's (Q-13).
 *
 * There is no status and no closing here, by design: the balance is checked
 * against the cash in the drawer, not signed off in the app.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePettyCash } from '@/lib/petty-cash/authz'
import { createEntry, listEntries, validateEntry } from '@/lib/petty-cash/entries'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePettyCash(request, 'petty-cash:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const params = request.nextUrl.searchParams
    const { rows, totals } = await listEntries(supabase, auth.user, {
      from: params.get('from'),
      to: params.get('to'),
      kind: params.get('kind'),
    })

    return NextResponse.json({ success: true, data: rows, totals })
  } catch (error: any) {
    console.error('Petty cash list error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load petty cash' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePettyCash(request, 'petty-cash:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json().catch(() => ({}))

    const check = validateEntry(body, user.role)
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, fieldErrors: check.fieldErrors },
        { status: check.status },
      )
    }

    const supabase = await createClient()
    const result = await createEntry(supabase, user, check.value)

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json(result.entry, { status: 201 })
  } catch (error: any) {
    console.error('Petty cash create error:', error)
    return NextResponse.json({ error: error.message || 'Failed to save the entry' }, { status: 500 })
  }
}
