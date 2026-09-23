/**
 * GET /api/petty-cash/recipients — who the admin can hand the float to.
 *
 * The client's rule for a top-up: *"For each credit, record which receptionist
 * it was given to."* The form used to offer `/api/ledger/users`, which lists
 * whoever has ever written a ledger row — so a receptionist hired last week was
 * missing, while an admin who once recorded an OPD receipt was on the list.
 *
 * This returns the actual answer: active receptionists. Admin-only, because the
 * top-up form is admin-only; there is no other reason to enumerate users.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePettyCash } from '@/lib/petty-cash/authz'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePettyCash(request, 'petty-cash:topup')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, username')
      .eq('role', 'RECEPTIONIST')
      .eq('status', 'ACTIVE')
      .order('username', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: any) {
    console.error('Petty cash recipients error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load receptionists' }, { status: 500 })
  }
}
