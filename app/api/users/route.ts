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

    // `users.status` is 'ACTIVE' or 'INACTIVE' — the same test the petty cash
    // recipients list uses. This first shipped reading an `is_active` column
    // that `users` does not have, so the query failed and the picker was empty.
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role')
      .eq('status', 'ACTIVE')
      .order('username')

    if (error) throw error

    const users = (data ?? []).map((u: any) => ({ id: u.id, username: u.username, role: u.role }))

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error('Error listing users:', error)
    return NextResponse.json({ error: error.message || 'Failed to list users' }, { status: 500 })
  }
}
