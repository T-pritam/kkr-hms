/**
 * GET /api/ledger/entries — the ledger log (PRD v2, CR-05).
 *
 * One endpoint replaces the three that overlapped: the one-date daily summary,
 * the Finances transactions fetch, and the employee shift summary. It takes the
 * filters from Q-22 and returns one page of rows with the totals for the whole
 * filter, so a screen needs a single request.
 *
 *   ?from&to            date range      (default: this month, IST)
 *   ?direction          credit | debit
 *   ?source             patient | registration | opd | doctor_settlement | …
 *   ?mode               cash | upi | card | bank_transfer | cheque
 *   ?added_by           a user id
 *   ?status             open | closed
 *   ?patient            a patient id
 *   ?search             matches the description
 *   ?page               50 rows a page, newest first
 *
 * Everyone with ledger access sees every row — that is the requirement. What
 * varies by caller is `can_edit` on each row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLedger } from '@/lib/ledger/authz'
import { listEntries, parseFilters } from '@/lib/ledger/entries'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLedger(request, 'ledger:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const filters = parseFilters(request.nextUrl.searchParams)
    const { rows, totals, page, page_size } = await listEntries(supabase, auth.user, filters)

    // Reception sees the entries but not the money totals (client, 26 Sep):
    // only how many rows match, so paging still reads right.
    const visibleTotals = auth.user.role === 'RECEPTIONIST' ? { count: totals.count } : totals

    return NextResponse.json({
      success: true,
      data: rows,
      totals: visibleTotals,
      page,
      page_size,
      filters,
    })
  } catch (error: any) {
    console.error('List ledger entries error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load the ledger' },
      { status: 500 },
    )
  }
}
