/**
 * POST /api/ledger/close — mark entries closed (PRD v2, CR-06).
 *
 * Body: { ids: string[], note?: string, amount_received?: number }
 *
 * The admin ticks rows on the "Not closed" tab, across any dates and any users,
 * and closes them in one action. There is no per-user and no per-day grouping —
 * that is the whole of requirement 6. Rows already closed are skipped rather
 * than refused, so two admins closing overlapping lists is not an error.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLedger } from '@/lib/ledger/authz'
import { closeEntries } from '@/lib/ledger/entries'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLedger(request, 'ledger:close')
    if (auth.response) return auth.response

    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const result = await closeEntries(supabase, auth.user, {
      ids: Array.isArray(body?.ids) ? body.ids : [],
      note: body?.note ?? null,
      amount_received: body?.amount_received ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      closed: result.closed,
      skipped: result.skipped,
      batch: result.batch,
    })
  } catch (error: any) {
    console.error('Close ledger entries error:', error)
    return NextResponse.json({ error: error.message || 'Failed to close the entries' }, { status: 500 })
  }
}
