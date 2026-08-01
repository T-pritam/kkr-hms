/**
 * GET /api/auth/me and POST /api/auth/logout
 */

import { describe, it, expect } from 'vitest'
import { GET as me } from '@/app/api/auth/me/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, expiredToken, tamperedToken } from '../../helpers/auth'
import { cookieJar } from '../../helpers/cookie-jar'

describe('GET /api/auth/me', () => {
  it('returns the identity carried by the access token', async () => {
    await signInAs('DOCTOR', { userId: 'u-doc', email: 'doc@hms.test' })
    const { status, body } = await call(me, 'GET', '/api/auth/me')

    expect(status).toBe(200)
    expect(body.user).toEqual({ id: 'u-doc', email: 'doc@hms.test', role: 'DOCTOR' })
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

  it('does not leak the password hash or other user columns', async () => {
    await signInAs('ADMIN', { seedUser: true })
    const { body } = await call(me, 'GET', '/api/auth/me')

    expect(Object.keys(body.user)).toEqual(['id', 'email', 'role'])
  })

  /**
   * Known defect — see BUGS.md #2. contexts/user-context.tsx types this response as the
   * full User (username, status, needsPasswordChange), but the route only echoes three
   * JWT claims, so those fields are silently undefined everywhere in the UI.
   */
  it.fails('should return the username the client context expects', async () => {
    await signInAs('ADMIN', { seedUser: true, username: 'admin' })
    const { body } = await call(me, 'GET', '/api/auth/me')

    expect(body.user.username).toBe('admin')
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
