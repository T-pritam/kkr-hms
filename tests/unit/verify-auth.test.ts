/**
 * lib/auth/verify.ts — the request-based auth path used by the patient and
 * doctor-settlement routes (the other half of the codebase uses getAccessToken()).
 */

import { describe, it, expect } from 'vitest'
import { verifyAuth, sendUnauthorized, sendForbidden } from '@/lib/auth/verify'
import { makeRequest } from '../helpers/request'
import { signInAs, tokenFor, expiredToken, tamperedToken, signOut } from '../helpers/auth'
import { cookieJar } from '../helpers/cookie-jar'

describe('verifyAuth', () => {
  it('accepts a token from the accessToken cookie', async () => {
    const session = await signInAs('DOCTOR', { userId: 'u-doc' })
    const result = await verifyAuth(makeRequest('GET', '/api/patients'))

    expect(result.isValid).toBe(true)
    expect(result.user).toEqual({ id: 'u-doc', email: session.email, role: 'DOCTOR' })
  })

  it('accepts a token from the Authorization: Bearer header', async () => {
    const token = await tokenFor('ADMIN', { userId: 'u-admin' })
    const request = makeRequest('GET', '/api/patients', {
      anonymous: true,
      headers: { Authorization: `Bearer ${token}` },
    })

    const result = await verifyAuth(request)
    expect(result.isValid).toBe(true)
    expect(result.user?.id).toBe('u-admin')
  })

  it('prefers the Authorization header over the cookie', async () => {
    await signInAs('NURSE', { userId: 'u-cookie' })
    const token = await tokenFor('ADMIN', { userId: 'u-header' })

    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', { headers: { Authorization: `Bearer ${token}` } })
    )
    expect(result.user?.id).toBe('u-header')
  })

  it('rejects a request with no token', async () => {
    signOut()
    const result = await verifyAuth(makeRequest('GET', '/api/patients'))

    expect(result).toMatchObject({ isValid: false, user: null, error: 'No token provided' })
  })

  it('rejects an expired token when there is nothing to renew it from', async () => {
    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', { anonymous: true, cookies: { accessToken: await expiredToken() } })
    )
    expect(result).toMatchObject({ isValid: false, user: null, error: 'Invalid token' })
  })

  /**
   * The other half of why the app died when left idle. This read
   * `token ? verify(token) : renew()`, so a cookie that was present but past
   * its ten minutes never reached the refresh branch — and 401'd with a
   * perfectly good seven-day refresh token sitting right beside it.
   */
  it('renews an expired token from the refresh token instead of refusing', async () => {
    const { refreshToken } = await signInAs('RECEPTIONIST', { userId: 'u-recep', seedUser: true })
    cookieJar.set('refreshToken', refreshToken)

    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', { cookies: { accessToken: await expiredToken('RECEPTIONIST') } })
    )

    expect(result).toMatchObject({ isValid: true })
    expect(result.user).toMatchObject({ id: 'u-recep', role: 'RECEPTIONIST' })
  })

  /** An API client sending a stale header is told so, not handed a session. */
  it('does not renew a bearer token', async () => {
    const { refreshToken } = await signInAs('ADMIN')
    cookieJar.set('refreshToken', refreshToken)

    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', {
        anonymous: true,
        headers: { Authorization: `Bearer ${await expiredToken()}` },
      })
    )

    expect(result.isValid).toBe(false)
  })

  it('rejects a token signed with the wrong secret', async () => {
    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', { anonymous: true, cookies: { accessToken: await tamperedToken() } })
    )
    expect(result.isValid).toBe(false)
  })

  it('ignores an Authorization header that is not a Bearer scheme', async () => {
    signOut()
    const token = await tokenFor('ADMIN')
    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', { anonymous: true, headers: { Authorization: `Basic ${token}` } })
    )
    expect(result).toMatchObject({ isValid: false, error: 'No token provided' })
  })

  /**
   * Was BUGS.md #1: verifyAuth never inspected `payload.type`, so a 7-day
   * refresh token was accepted wherever a 10-minute access token was expected,
   * while the middleware refused it.
   */
  it('rejects a refresh token presented as an access token', async () => {
    const refresh = await tokenFor('ADMIN', { type: 'refresh' })
    const result = await verifyAuth(
      makeRequest('GET', '/api/patients', { anonymous: true, cookies: { accessToken: refresh } })
    )
    expect(result.isValid).toBe(false)
  })
})

describe('response helpers', () => {
  it('sendUnauthorized defaults to 401 Unauthorized', async () => {
    const response = sendUnauthorized()
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('sendForbidden defaults to 403 Forbidden and accepts a custom message', async () => {
    expect(sendForbidden().status).toBe(403)
    await expect(sendForbidden('Nope').json()).resolves.toEqual({ error: 'Nope' })
  })
})
