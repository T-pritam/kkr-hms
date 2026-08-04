import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, getAccessToken, getRefreshToken, generateAccessToken, setAuthCookies } from '@/lib/auth/jwt'
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

  // If access token invalid/expired, try refresh token
  if (!isAuthenticated && refreshTokenCookie) {
    const refreshPayload = await verifyToken(refreshTokenCookie.value)
    if (refreshPayload && refreshPayload.type === 'refresh') {
      // Generate new access token
      const newAccessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      })
      
      const response = NextResponse.next()
      response.cookies.set('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 20 * 60,
        path: '/',
      })
      
      isAuthenticated = true
      userRole = refreshPayload.role
      
      return response
    }
  }

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && authPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isPublicPath) {
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
     * deliberately open to reception — they hand the cash over, are asked for
     * the log more than anyone, and now add advances themselves. The salary
     * *figures* on that list are still redacted for them at the API layer, not
     * here. Checked *before* the prefix list so ordering cannot accidentally
     * expose the staff register alongside it.
     *
     * This only governs the page. The API enforces the same split itself, in
     * lib/employees/authz.ts, because middleware does not guard `/api/**` here.
     */
    const sharedPaths: { path: string; roles: string[] }[] = [
      { path: '/employees/advances', roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
      // Reception can view the salary list and add advances; the API redacts
      // every rupee figure for that role (lib/employees/authz.ts, salary:list).
      { path: '/employees/salary', roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
    ]

    const shared = sharedPaths.find(entry => pathname.startsWith(entry.path))

    if (shared) {
      if (!shared.roles.includes(userRole)) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } else {
      /**
       * `/ledger/employee-shift` is the odd one out: the rest of `/ledger` is
       * open to every role, but the shift settlement screen shows one operator's
       * whole day of cash and marks it paid. The sidebar has always hidden it
       * behind ADMIN — the guard just listed the wrong path. It named
       * `/daily-ledger/employee-ledger`, a stub page nothing links to, while the
       * live screen sat open to anyone who typed the URL.
       */
      const adminOnlyPaths = [
        '/employees',
        '/finances',
        '/daily-ledger/employee-ledger',
        '/admin',
        '/ledger/employee-shift',
      ]
      const isAdminOnlyPath = adminOnlyPaths.some(path => pathname.startsWith(path))

      if (isAdminOnlyPath && userRole !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
