import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * GET /api/ledger/open-days?limit=50&include_today=false
 *
 * Every date carrying ledger activity with no active closure, oldest first.
 *
 * Until now there was no way to answer "what still needs closing?" except by
 * stepping through the date picker one day at a time, which in practice meant
 * nobody did — production has six dates of activity and not one closure. This is
 * the list that makes the backlog visible.
 *
 * Today is excluded by default: it is not late, it is in progress, and putting it
 * at the top of a "still open" list every morning trains people to ignore the list.
 */
export async function GET(request: NextRequest) {
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

    // Whole-day readers only. The banner renders nothing on a 403, so other roles
    // simply do not see it.
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Number(searchParams.get('limit') ?? 50)
    const includeToday = searchParams.get('include_today') === 'true'

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('ledger_open_days', {
      p_limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50,
      p_include_today: includeToday
    })

    if (error) {
      console.error('Get open days error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const openDays = data ?? []

    return NextResponse.json({
      success: true,
      data: {
        open_days: openDays,
        total_open: openDays.length,
        oldest_open_date: openDays.length > 0 ? openDays[0].date : null
      }
    })
  } catch (error: any) {
    console.error('Get open days error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
