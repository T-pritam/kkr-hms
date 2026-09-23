/**
 * POST /api/ledger/reopen — reopen closed entries (PRD v2, Q-04 = B).
 *
 * Body: { ids: string[], reason: string }
 *
 * A closed entry is nobody's to change, admin included. Reopening is how it
 * becomes editable again, and the reason stays on the row: it is the only
 * record of why a counted day was opened a second time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLedger } from '@/lib/ledger/authz'
import { reopenEntries } from '@/lib/ledger/entries'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLedger(request, 'ledger:close')
    if (auth.response) return auth.response

    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const result = await reopenEntries(supabase, auth.user, {
      ids: Array.isArray(body?.ids) ? body.ids : [],
      reason: body?.reason ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({ success: true, reopened: result.reopened })
  } catch (error: any) {
    console.error('Reopen ledger entries error:', error)
    return NextResponse.json({ error: error.message || 'Failed to reopen the entries' }, { status: 500 })
  }
}
