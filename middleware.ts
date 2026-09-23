import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyToken,
  generateAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '@/lib/auth/jwt'
import { updateSession } from '@/lib/supabase/middleware'

const publicPaths = ['/login', '/reset-password', '/change-password', '/api/auth/login', '/api/auth/reset-password', '/api/auth/change-password']
const authPaths = ['/login', '/reset-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Update Supabase session
  const { supabaseResponse, user } = await updateSession(request)

  // Check if path is public
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path))

  // Get tokens from cookies
  const accessTokenCookie = request.cookies.get('accessToken')
  const refreshTokenCookie = request.cookies.get('refreshToken')

  let accessToken = accessTokenCookie?.value
  let isAuthenticated = false
  let userRole = null

  // Verify access token
  if (accessToken) {
    const payload = await verifyToken(accessToken)
    if (payload && payload.type === 'access') {
      isAuthenticated = true
      userRole = payload.role
    }
  }

  /**
   * The access token lasts ten minutes; the refresh token lasts a week. A
   * session left idle in between is renewed here — and three things about how
   * that was done are why the app used to need a manual reload to come back:
   *
   *   1. The new token was set on the *response* only, so the request carried
   *      on to the route handler with the old, expired cookie and 401'd
   *      anyway. Rewriting `request.cookies` and forwarding it with
   *      `NextResponse.next({ request })` is what makes the very request that
   *      triggered the renewal succeed.
   *   2. The cookie was given a 20-minute maxAge around a 10-minute token, so
   *      for ten minutes the browser held a cookie every endpoint rejected
   *      (BUGS.md #8).
   *   3. It returned early, skipping the role checks below — one free request
   *      into /admin or /finances every time a token expired (BUGS.md #7).
   */
  let refreshedToken: string | null = null

  /**
   * Stamp the renewed cookie on whatever response finally leaves. Without this
   * a redirect — off the login page, or a role bounce — would drop the token
   * that was just minted and the next request would renew all over again.
   */
  const finalize = (response: NextResponse): NextResponse => {
    if (refreshedToken) {
      response.cookies.set('accessToken', refreshedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        // The same ten minutes the token itself lasts (BUGS.md #8).
        maxAge: ACCESS_TOKEN_TTL_SECONDS,
        path: '/',
      })
    }
    return response
  }

  let refreshedResponse: NextResponse | null = null

  if (!isAuthenticated && refreshTokenCookie) {
    const refreshPayload = await verifyToken(refreshTokenCookie.value)
    if (refreshPayload && refreshPayload.type === 'refresh') {
      const newAccessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      })

      // The handler reads its cookies off the request, so the fresh token has
      // to be on the request, not just on its way back to the browser.
      request.cookies.set('accessToken', newAccessToken)
      refreshedToken = newAccessToken

      // Rebuilt, not reused: `supabaseResponse` was snapshotted from the
      // request before this mutation, so it still carries the stale cookie.
      // Supabase's own cookie writes are copied across so nothing is lost.
      refreshedResponse = NextResponse.next({ request })
      supabaseResponse.cookies.getAll().forEach(cookie => {
        refreshedResponse!.cookies.set(cookie)
      })

      isAuthenticated = true
      userRole = refreshPayload.role
    }
  }

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && authPaths.some(path => pathname.startsWith(path))) {
    return finalize(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isPublicPath) {
    /**
     * An API call gets an answer it can read. Redirecting an XHR to the login
     * *page* handed the caller a lump of HTML, so `res.json()` threw and every
     * screen said "Failed to load…" — never "you are signed out". Pages still
     * redirect, so a typed URL behaves as before.
     */
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Your session has ended. Sign in again.', code: 'SESSION_EXPIRED' },
        { status: 401 }
      )
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based access control
  if (isAuthenticated && userRole) {
    /**
     * Carve-outs inside an admin-only prefix.
     *
     * `/employees` is admin-only, but the advance log and the salary list are
     * not. Reception pays advances from petty cash (CR-03), so the advance log
     * is theirs too — the sidebar offers it, the page hides every payroll
     * figure from them, and lib/employees/authz.ts grants `advance:read` and
     * `advance:write`. This list was the one place never updated when CR-03
     * landed, so the link bounced them to /dashboard and on to /patients.
     *
     * `/employees/salary` stays ADMIN and DOCTOR: that screen *is* payroll.
     *
     * Checked *before* the prefix list so ordering cannot accidentally expose
     * the staff register alongside it. This only governs the page; the API
     * enforces the same split itself.
     */
    const sharedPaths: { path: string; roles: string[] }[] = [
      { path: '/employees/advances', roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
      { path: '/employees/salary', roles: ['ADMIN', 'DOCTOR'] },
    ]

    const shared = sharedPaths.find(entry => pathname.startsWith(entry.path))

    if (shared) {
      if (!shared.roles.includes(userRole)) {
        return finalize(NextResponse.redirect(new URL('/dashboard', request.url)))
      }
    } else {
      /**
       * `/ledger/employee-shift` and `/daily-ledger/*` were deleted with the
       * day-based ledger (CR-08), so they are gone from here too.
       */
      const adminOnlyPaths = [
        '/employees',
        '/finances',
        '/admin',
      ]
      const isAdminOnlyPath = adminOnlyPaths.some(path => pathname.startsWith(path))

      if (isAdminOnlyPath && userRole !== 'ADMIN') {
        return finalize(NextResponse.redirect(new URL('/dashboard', request.url)))
      }
    }
  }

  // A renewed session returns the rebuilt response carrying both the fresh
  // request cookie and the Set-Cookie header; everything else passes through.
  return finalize(refreshedResponse ?? supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
