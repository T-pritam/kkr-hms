/**
 * GET /api/auth/me and POST /api/auth/logout
 */

import { describe, it, expect } from 'vitest'
import type { NextResponse } from 'next/server'
import { GET as me } from '@/app/api/auth/me/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, signInWithRefreshTokenOnly, expiredToken, tamperedToken } from '../../helpers/auth'
import { cookieJar } from '../../helpers/cookie-jar'

describe('GET /api/auth/me', () => {
  it('returns the identity carried by the access token', async () => {
    await signInAs('DOCTOR', { userId: 'u-doc', email: 'doc@hms.test' })
    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(200)
    expect(body.user).toMatchObject({ id: 'u-doc', email: 'doc@hms.test', role: 'DOCTOR' })
  })

  it('rejects a request with no session', async () => {
    signOut()
    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects an expired token with "Invalid token"', async () => {
    cookieJar.set('accessToken', await expiredToken())
    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(401)
    expect(body.error).toBe('Invalid token')
  })

  it('rejects a token signed with the wrong secret', async () => {
    cookieJar.set('accessToken', await tamperedToken())
    const { status } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(401)
  })

  it('reads the session from cookies, not from an Authorization header', async () => {
    const { accessToken } = await signInAs('ADMIN')
    signOut()

    const { status } = await call(me, 'GET', '/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(status).toBe(401)
  })

  /**
   * The sidebar needs a name to say who is signed in, so the row is read for
   * `username` and `status` — and nothing else. The password hash, the reset
   * token and the rest of the row stay on the server.
   */
  it('does not leak the password hash or other user columns', async () => {
    await signInAs('ADMIN', { seedUser: true })
    const { body } = await call(me, 'GET', '/api/auth/me')

    expect(Object.keys(body.user).sort()).toEqual(['email', 'id', 'role', 'status', 'username'])
  })

  /**
   * `UserContext` fetches this once on mount and never retries, so an access
   * token that has expired mid-session used to leave every role-gated button
   * hidden until a hard reload happened to land after the *next* request had
   * already refreshed the cookie via middleware. This route now does that
   * refresh itself, falling back to the refresh token before giving up.
   */
  it('refreshes an expired access token from a still-valid refresh token, rather than 401ing', async () => {
    const { refreshToken } = await signInAs('RECEPTIONIST', { userId: 'u-recep', email: 'r@hms.test', seedUser: true })
    cookieJar.set('accessToken', await expiredToken('RECEPTIONIST'))
    cookieJar.set('refreshToken', refreshToken)

    const { status, body, response } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(200)
    expect(body.user).toMatchObject({ id: 'u-recep', email: 'r@hms.test', role: 'RECEPTIONIST' })

    const refreshed = (response as NextResponse).cookies.get('accessToken')
    expect(refreshed?.value).toEqual(expect.any(String))
  })

  it('also self-heals when the access token cookie is simply gone, not just expired', async () => {
    await signInWithRefreshTokenOnly('DOCTOR', { userId: 'u-doc' })

    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(200)
    expect(body.user).toMatchObject({ id: 'u-doc', role: 'DOCTOR' })
  })

  it('still refuses when neither token is valid', async () => {
    cookieJar.set('accessToken', await expiredToken('ADMIN'))
    cookieJar.set('refreshToken', await expiredToken('ADMIN', 'refresh'))

    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(401)
    expect(body.error).toBe('Invalid token')
  })

  /**
   * Was BUGS.md #2: the route echoed three JWT claims while
   * contexts/user-context.tsx typed the response as the full User, so
   * `user.username` was undefined everywhere — which is why nothing on screen
   * could say who was signed in.
   */
  it('returns the username the sidebar shows', async () => {
    await signInAs('ADMIN', { seedUser: true, username: 'admin' })
    const { body } = await call(me, 'GET', '/api/auth/me')

    expect(body.user.username).toBe('admin')
  })

  it('falls back to the e-mail handle when there is no user row', async () => {
    await signInAs('ADMIN', { userId: 'u-ghost', email: 'ghost@hms.test' })
    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(200)
    expect(body.user.username).toBe('ghost')
  })
})

describe('POST /api/auth/logout', () => {
  it('clears both auth cookies', async () => {
    await signInAs('ADMIN')
    const { status, body } = await call(logout, 'POST', '/api/auth/logout')

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(cookieJar.has('accessToken')).toBe(false)
    expect(cookieJar.has('refreshToken')).toBe(false)
    expect(cookieJar.deleted).toEqual(['accessToken', 'refreshToken'])
  })

  it('succeeds even with no active session', async () => {
    signOut()
    const { status, body } = await call(logout, 'POST', '/api/auth/logout')

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
  })
})
