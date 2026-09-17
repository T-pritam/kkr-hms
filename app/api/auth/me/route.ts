import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, getRefreshToken, verifyToken, generateAccessToken } from '@/lib/auth/jwt'

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
        user: {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
        },
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
      user: {
        id: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      },
    })

    response.cookies.set('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
