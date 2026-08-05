import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { recordAudit } from '@/lib/audit/log'

/**
 * POST /api/ledger/reopen-day
 *
 * Reopens a closed ledger date. Admin only.
 *
 * Until now there was no way back. A day closed by mistake, or a receipt that
 * surfaced an hour after the day was reconciled, left the date frozen for good —
 * no entry could be added, amended, verified or removed, by anyone, ever.
 *
 * Reopening supersedes the active closure rather than deleting it. The old row
 * keeps the totals that were reported at the time, together with who reopened it
 * and why; the next close inserts a new version pointing back at it. So the
 * history of a corrected day is legible afterwards rather than overwritten.
 *
 * The reason is mandatory, and enforced by a CHECK constraint as well as here.
 * A reopen with no stated reason is indistinguishable from tampering.
 *
 * Note what is deliberately NOT done: later days' opening balances are not
 * recalculated. Reopening 6 February changes its closing balance, and every
 * closure after it was derived from that number. Cascading the recalculation
 * would silently rewrite reconciled history, so the response reports how many
 * later closures are affected and leaves the judgement to the admin.
 */
export async function POST(request: NextRequest) {
  try {
    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const { closure_date, reason } = body

    if (!closure_date) {
      return NextResponse.json({ error: 'closure_date is required' }, { status: 400 })
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
    if (trimmedReason.length < 10) {
      return NextResponse.json(
        { error: 'A reason of at least 10 characters is required to reopen a closed day' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: closure, error } = await supabase.rpc('reopen_ledger_day', {
      p_closure_date: closure_date,
      p_reopened_by: payload.userId,
      p_reason: trimmedReason
    })

    if (error) {
      switch (error.code) {
        case 'LC005':
          return NextResponse.json(
            { error: 'A reason of at least 10 characters is required to reopen a closed day' },
            { status: 400 }
          )
        case 'LC004':
          return NextResponse.json({ error: 'This date is not currently closed' }, { status: 409 })
        default:
          console.error('Reopen day error:', error)
          return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    const { data: laterClosures } = await supabase.rpc('ledger_closure_continuity', {
      p_from: closure_date
    })

    await recordAudit(supabase, {
      entityType: 'ledger_day',
      entityId: closure.id,
      action: 'reopened',
      summary: `Reopened the ledger for ${closure_date} (close #${closure.version})`,
      changes: {
        status: { from: 'active', to: 'superseded' },
        reason: { from: null, to: trimmedReason }
      },
      actor: { id: payload.userId, role: payload.role }
    })

    return NextResponse.json({
      success: true,
      message: 'Daily ledger reopened',
      data: {
        closure,
        later_closure_count: laterClosures ?? 0
      }
    })
  } catch (error: any) {
    console.error('Reopen day error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
