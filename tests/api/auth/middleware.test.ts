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

const ADMIN_ONLY_PATHS = [
  '/employees',
  '/finances',
  '/admin',
]

describe('middleware — unauthenticated traffic', () => {
  it.each(PUBLIC_PATHS)('allows %s through without a session', async (path) => {
    signOut()
    const response = await visit(path)

    expect(response.status).not.toBe(307)
    expect(response.headers.get('location')).toBeNull()
  })

  it.each(['/dashboard', '/patients', '/ledger/summary', '/lab/tests'])(
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

  /** Was BUGS.md #7: the refresh branch returned early, skipping this check. */
  it('still enforces admin-only paths while refreshing the access token', async () => {
    await signInWithRefreshTokenOnly('NURSE')
    const response = await visit('/finances')

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/dashboard')
  })

  it('still bounces a refreshing user off the login page', async () => {
    await signInWithRefreshTokenOnly('ADMIN')
    const response = await visit('/login')

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/dashboard')
  })

  /** Was BUGS.md #8: a 20-minute cookie around a 10-minute token. */
  it('gives the refreshed cookie the same lifetime as the token it carries', async () => {
    await signInWithRefreshTokenOnly('ADMIN')
    const response = await visit('/patients')

    const claims = decodeJwt(response.cookies.get('accessToken')!.value)
    const tokenLifetime = claims.exp! - claims.iat!

    expect(response.cookies.get('accessToken')!.maxAge).toBe(tokenLifetime)
  })
})

/**
 * The reason the app used to need a manual reload after ten minutes idle.
 *
 * Middleware renewed the access token and set it on the *response*, so the
 * request carried on to the route handler with the old, expired cookie and
 * 401'd anyway. The user saw "Failed to load…" on every button, reloaded, and
 * the next request — now carrying the renewed cookie — worked.
 */
describe('middleware — a renewed token reaches the handler in the same pass', () => {
  it('rewrites the request cookie, not just the response', async () => {
    await signInWithRefreshTokenOnly('ADMIN')
    const request = makeRequest('GET', '/api/patients')
    const before = request.cookies.get('accessToken')?.value

    await middleware(request)

    const after = request.cookies.get('accessToken')?.value
    expect(after).toEqual(expect.any(String))
    expect(after).not.toBe(before)

    // And it is a token the handler will actually accept.
    const claims = decodeJwt(after!)
    expect(claims.type).toBe('access')
    expect(claims.role).toBe('ADMIN')
  })

  it('keeps the renewed cookie when the request is redirected anyway', async () => {
    await signInWithRefreshTokenOnly('NURSE')

    // A nurse renewing on the way into /finances: bounced, but still renewed.
    const response = await visit('/finances')

    expect(response.status).toBe(307)
    expect(response.cookies.get('accessToken')?.value).toEqual(expect.any(String))
  })
})

/**
 * An expired XHR used to be 307'd to the login *page*, so the caller got HTML,
 * `res.json()` threw, and every screen said "Failed to load…" instead of
 * anything about being signed out.
 */
describe('middleware — an API call gets an answer it can read', () => {
  it('answers 401 JSON rather than redirecting', async () => {
    signOut()
    const response = await visit('/api/patients')

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('still redirects a page, so a typed URL lands on the login form', async () => {
    signOut()
    const response = await visit('/patients')

    expect(response.status).toBe(307)
    expect(locationOf(response).pathname).toBe('/login')
  })
})

describe('middleware — session cookies are not readable by scripts', () => {
  it('keeps the login-issued cookies httpOnly', async () => {
    await signInAs('ADMIN')

    expect(cookieJar.inspect('accessToken')?.options.httpOnly).toBe(true)
    expect(cookieJar.inspect('refreshToken')?.options.httpOnly).toBe(true)
  })
})
