import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { recordAudit } from '@/lib/audit/log'

/**
 * POST /api/ledger/close-day
 *
 * Closes the financial day. Admin only.
 *
 * The work is done by the `close_ledger_day` database function, which holds the
 * existence check, the totals and the insert inside one transaction. It used to
 * be three separate round-trips from here, followed by a bulk update flipping
 * every transaction on the date to status = 'day_closed'. That update is gone:
 * closing is recorded once, against the date, in `daily_ledger_closures`.
 *
 * `opening_balance` is no longer accepted from the request. The browser was
 * choosing the number that anchors the day's balance chain, and nothing
 * reconciled it against the previous day. It is now derived server-side.
 *
 * Unverified entries do not block a close. Closing is a cash reconciliation, and
 * a day cannot be held open because the person who verifies entries has gone
 * home. The count is returned as a warning and stored on the closure row.
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

    // Admin only. Closing reconciles the day's cash and locks the period; it is
    // narrower than the read side, which DOCTOR also has.
    if (payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const { closure_date, notes } = body

    if (!closure_date) {
      return NextResponse.json({ error: 'closure_date is required' }, { status: 400 })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(closure_date)) {
      return NextResponse.json({ error: 'closure_date must be a YYYY-MM-DD date' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: closure, error } = await supabase.rpc('close_ledger_day', {
      p_closure_date: closure_date,
      p_closed_by: payload.userId,
      p_notes: notes ?? null
    })

    if (error) {
      // Mapped on the code the function raises, never on message text.
      switch (error.code) {
        case 'LC003':
          return NextResponse.json({ error: 'Cannot close a date in the future' }, { status: 400 })
        case 'LC002':
          return NextResponse.json({ error: 'No transactions found for this date' }, { status: 404 })
        case 'LC001':
        // 23505 means another admin won the race to the partial unique index.
        case '23505':
          return NextResponse.json({ error: 'This date has already been closed' }, { status: 409 })
        default:
          console.error('Close day error:', error)
          return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // Reopening an earlier day would change its closing balance, which every
    // later closure was calculated from. We warn rather than cascade — see the
    // reopen route.
    const { data: laterClosures } = await supabase.rpc('ledger_closure_continuity', {
      p_from: closure_date
    })

    await recordAudit(supabase, {
      entityType: 'ledger_day',
      entityId: closure.id,
      action: 'finalised',
      summary: `Closed the daily ledger for ${closure_date} (close #${closure.version})`,
      changes: {
        total_credits: { from: null, to: closure.total_credits },
        total_debits: { from: null, to: closure.total_debits },
        net_balance: { from: null, to: closure.net_balance },
        closing_cash_balance: { from: null, to: closure.closing_cash_balance },
        unverified_count: { from: null, to: closure.unverified_count }
      },
      actor: { id: payload.userId, role: payload.role }
    })

    return NextResponse.json({
      success: true,
      message: 'Daily ledger closed successfully',
      data: {
        closure,
        warnings: {
          unverified_count: closure.unverified_count ?? 0,
          later_closure_count: laterClosures ?? 0
        }
      }
    })
  } catch (error: any) {
    console.error('Close day error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
