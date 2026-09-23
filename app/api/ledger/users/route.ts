/**
 * GET /api/ledger/users — the names behind the ledger's "Added by" filter.
 *
 * Reception may filter the log by who added a row (Q-22), so it needs the list
 * of people who have added one. It cannot see the user register (§3.2), so this
 * returns only the id and username of users who actually appear in the ledger —
 * no e-mail, no role, no one who has never touched it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLedger } from '@/lib/ledger/authz'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLedger(request, 'ledger:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('daily_ledger_transactions')
      .select('created_by, created_by_user:users!created_by(id, username)')

    if (error) throw error

    const seen = new Map<string, { id: string; username: string }>()
    for (const row of data ?? []) {
      const user: any = Array.isArray(row.created_by_user) ? row.created_by_user[0] : row.created_by_user
      if (user?.id && !seen.has(user.id)) seen.set(user.id, { id: user.id, username: user.username })
    }

    return NextResponse.json({
      success: true,
      data: [...seen.values()].sort((a, b) => a.username.localeCompare(b.username)),
    })
  } catch (error: any) {
    console.error('Ledger users error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load users' }, { status: 500 })
  }
}
