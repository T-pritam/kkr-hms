import { NextRequest, NextResponse } from 'next/server'
import {
  getAccessToken,
  getRefreshToken,
  verifyToken,
  generateAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

/**
 * The token carries an id, an e-mail and a role — no name. The sidebar needs a
 * name to say who is signed in, so it is read from the row here rather than
 * baked into the token: a rename then shows up on the next page load instead of
 * waiting out the session.
 */
async function identity(userId: string, email: string, role: string) {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('users')
      .select('username, status')
      .eq('id', userId)
      .maybeSingle()

    return {
      id: userId,
      email,
      role,
      username: data?.username ?? email.split('@')[0],
      status: data?.status ?? 'ACTIVE',
    }
  } catch {
    // Never fail the session check over a display name.
    return { id: userId, email, role, username: email.split('@')[0], status: 'ACTIVE' }
  }
}

/**
 * Who the app thinks is signed in — the one call every role-gated button
 * depends on, through `UserContext`, which fetches this exactly once on
 * mount and never retries.
 *
 * The access token lives 10 minutes. Any session left open longer than that
 * has an expired accessToken cookie the moment this runs, and this used to
 * just 401 — permanently hiding every role-gated control (a receptionist's
 * Create/Edit on Doctors and Patients included) for the rest of that SPA
 * session, because `UserContext` never asks again. Middleware refreshes the
 * cookie on the next navigation, but that is one request too late for this
 * one, which had already failed and given up. This now falls back to the
 * refresh token, the same way middleware does, before giving up — so an
 * expired-but-still-valid session repairs itself here instead of needing a
 * hard reload to win the timing race against middleware's own refresh.
 */
export async function GET(request: NextRequest) {
  try {
    const accessToken = await getAccessToken()
    const payload = accessToken ? await verifyToken(accessToken) : null

    if (payload) {
      return NextResponse.json({
        user: await identity(payload.userId, payload.email, payload.role),
      })
    }

    // A cookie set with a 10-minute maxAge is usually gone by the time it
    // expires, not merely invalid — so the common case here is no accessToken
    // at all, and the fallback below has to cover that too, not just a
    // present-but-expired token.
    const refreshToken = await getRefreshToken()
    const refreshPayload = refreshToken ? await verifyToken(refreshToken) : null

    if (!refreshPayload || refreshPayload.type !== 'refresh') {
      return NextResponse.json(
        { error: accessToken ? 'Invalid token' : 'Unauthorized' },
        { status: 401 },
      )
    }

    const newAccessToken = await generateAccessToken({
      userId: refreshPayload.userId,
      email: refreshPayload.email,
      role: refreshPayload.role,
    })

    const response = NextResponse.json({
      user: await identity(refreshPayload.userId, refreshPayload.email, refreshPayload.role),
    })

    response.cookies.set('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
