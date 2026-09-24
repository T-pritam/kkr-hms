/**
 * GET /api/users — the names a payout can be attributed to.
 *
 * Just enough to fill the "given by" picker on a doctor fee or a referral
 * commission: id, username and role, for active accounts. The full user
 * administration lives behind `/api/admin/users` and stays admin-only.
 *
 * Open to whoever may pay out (`payout:write`) — admin and reception both —
 * because the person marking a fee paid is often not the person who carried the
 * cash, and reception must be able to name an admin as easily as the reverse.
 * Nothing sensitive is returned: no password hash, no contact details.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'payout:write')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('users')
      .select('id, username, role, is_active')
      .order('username')

    if (error) throw error

    // Filtered here rather than in the query: `is_active` is null on the older
    // accounts, and `.eq('is_active', true)` would quietly hide every one.
    const users = (data ?? [])
      .filter((u: any) => u.is_active !== false)
      .map((u: any) => ({ id: u.id, username: u.username, role: u.role }))

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error('Error listing users:', error)
    return NextResponse.json({ error: error.message || 'Failed to list users' }, { status: 500 })
  }
}
