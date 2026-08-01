/**
 * middleware.ts — the edge gate in front of every page and API route.
 *
 * The real one also calls `updateSession()`, which hits Supabase Auth over the network
 * on every request; that is stubbed out in tests/setup.ts.
 */

import { describe, it, expect } from 'vitest'
import { decodeJwt } from 'jose'
import { middleware } from '@/middleware'
import { makeRequest } from '../../helpers/request'
import { signInAs, signInWithRefreshTokenOnly, signOut, expiredToken, tokenFor } from '../../helpers/auth'
import { cookieJar } from '../../helpers/cookie-jar'

const visit = (path: string, options = {}) => middleware(makeRequest('GET', path, options))

const locationOf = (response: Response) => new URL(response.headers.get('location')!)

const PUBLIC_PATHS = [
  '/login',
  '/reset-password',
  '/change-password',
  '/api/auth/login',
  '/api/auth/reset-password',
  '/api/auth/change-password',
]

const ADMIN_ONLY_PATHS = ['/employees', '/finances', '/daily-ledger/employee-ledger', '/admin']

describe('middleware — unauthenticated traffic', () => {
  it.each(PUBLIC_PATHS)('allows %s through without a session', async (path) => {
    signOut()
    const response = await visit(path)

    expect(response.status).not.toBe(307)
    expect(response.headers.get('location')).toBeNull()
  })

  it.each(['/dashboard', '/patients', '/ledger/summary', '/lab/tests', '/api/patients'])(
    'redirects %s to the login page',
    async (path) => {
      signOut()
      const response = await visit(path)

      expect(response.status).toBe(307)
      expect(locationOf(response).pathname).toBe('/login')
    }
  )

  it('remembers where the user was headed in ?from=', async () => {
    signOut()
    const response = await visit('/patients/abc-123')

    expect(locationOf(response).searchParams.get('from')).toBe('/patients/abc-123')
  })

  it('treats an expired access token as unauthenticated', async () => {
    signOut()
    const response = await visit('/dashboard', { anonymous: true, cookies: { accessToken: await expiredToken() } })

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/login')
  })

  it('rejects a refresh token presented in the accessToken cookie', async () => {
    signOut()
    const refresh = await tokenFor('ADMIN', { type: 'refresh' })
    const response = await visit('/dashboard', { anonymous: true, cookies: { accessToken: refresh } })

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/login')
  })

  it('matches public paths by prefix, so nested routes are public too', async () => {
    signOut()
    const response = await visit('/change-password?token=abc')

    expect(response.headers.get('location')).toBeNull()
  })
})

describe('middleware — authenticated traffic', () => {
  it('lets an authenticated user reach an ordinary page', async () => {
    await signInAs('NURSE')
    const response = await visit('/patients')

    expect(response.headers.get('location')).toBeNull()
  })

  it.each(['/login', '/reset-password'])('bounces a signed-in user off %s to the dashboard', async (path) => {
    await signInAs('RECEPTIONIST')
    const response = await visit(path)

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/dashboard')
  })

  it('does not bounce a signed-in user off /change-password', async () => {
    await signInAs('RECEPTIONIST')
    const response = await visit('/change-password')

    expect(response.headers.get('location')).toBeNull()
  })
})

describe('middleware — role-based access control', () => {
  it.each(ADMIN_ONLY_PATHS)('allows ADMIN into %s', async (path) => {
    await signInAs('ADMIN')
    const response = await visit(path)

    expect(response.headers.get('location')).toBeNull()
  })

  for (const role of ['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const) {
    it.each(ADMIN_ONLY_PATHS)(`redirects ${role} away from %s`, async (path) => {
      await signInAs(role)
      const response = await visit(path)

      expect(response.status).toBe(307)
      expect(locationOf(response).pathname).toBe('/dashboard')
    })
  }

  it('guards nested page paths by prefix', async () => {
    await signInAs('NURSE')
    const response = await visit('/employees/salary')

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/dashboard')
  })

  /**
   * The admin-only list holds page paths, so `/api/admin/*` does not match `/admin`.
   * Those endpoints are not defenceless — every handler under app/api/admin/ checks the
   * role itself and answers 403 (covered in admin-users.test.ts) — but the middleware
   * lets the request reach them.
   */
  it('does not gate /api/admin — the route handlers enforce the role instead', async () => {
    await signInAs('NURSE')
    const response = await visit('/api/admin/users')

    expect(response.headers.get('location')).toBeNull()
  })

  it('leaves the ledger pages open to non-admin roles', async () => {
    await signInAs('RECEPTIONIST')
    const response = await visit('/ledger/summary')

    expect(response.headers.get('location')).toBeNull()
  })
})

describe('middleware — silent access token refresh', () => {
  it('mints a fresh access token from the refresh token', async () => {
    await signInWithRefreshTokenOnly('DOCTOR', { userId: 'u-doc' })
    const response = await visit('/patients')

    const refreshed = response.cookies.get('accessToken')!
    expect(refreshed.value).toEqual(expect.any(String))
    expect(decodeJwt(refreshed.value)).toMatchObject({ userId: 'u-doc', role: 'DOCTOR', type: 'access' })
  })

  it('sets the refreshed cookie httpOnly, lax and root-scoped', async () => {
    await signInWithRefreshTokenOnly('DOCTOR')
    const response = await visit('/patients')

    expect(response.cookies.get('accessToken')).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('does not refresh from an expired refresh token', async () => {
    signOut()
    const response = await visit('/patients', {
      anonymous: true,
      cookies: { refreshToken: await expiredToken('ADMIN', 'refresh') },
    })

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/login')
  })

  it('does not accept an access token in the refreshToken cookie', async () => {
    signOut()
    const access = await tokenFor('ADMIN')
    const response = await visit('/patients', { anonymous: true, cookies: { refreshToken: access } })

    expect(response.status).toBe(307)
  })

  /**
   * Known defect — see BUGS.md #7. The refresh branch returns immediately, skipping both
   * the auth-page redirect and the admin-only check below it. A non-admin whose access
   * token has expired therefore gets one free request into /admin, /finances or /employees.
   */
  it.fails('should still enforce admin-only paths while refreshing the access token', async () => {
    await signInWithRefreshTokenOnly('NURSE')
    const response = await visit('/finances')

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/dashboard')
  })

  /** Known defect — see BUGS.md #7. Same early return skips the signed-in redirect. */
  it.fails('should still bounce a refreshing user off the login page', async () => {
    await signInWithRefreshTokenOnly('ADMIN')
    const response = await visit('/login')

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/dashboard')
  })

  /**
   * Known defect — see BUGS.md #8. The cookie lives for 20 minutes but the JWT inside it
   * expires after 10, leaving a 10-minute window where the browser holds a cookie that
   * every endpoint rejects.
   */
  it.fails('should give the refreshed cookie the same lifetime as the token it carries', async () => {
    await signInWithRefreshTokenOnly('ADMIN')
    const response = await visit('/patients')

    const claims = decodeJwt(response.cookies.get('accessToken')!.value)
    const tokenLifetime = claims.exp! - claims.iat!

    expect(response.cookies.get('accessToken')!.maxAge).toBe(tokenLifetime)
  })
})

describe('middleware — session cookies are not readable by scripts', () => {
  it('keeps the login-issued cookies httpOnly', async () => {
    await signInAs('ADMIN')

    expect(cookieJar.inspect('accessToken')?.options.httpOnly).toBe(true)
    expect(cookieJar.inspect('refreshToken')?.options.httpOnly).toBe(true)
  })
})
