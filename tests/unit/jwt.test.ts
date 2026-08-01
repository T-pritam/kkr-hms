/**
 * lib/auth/jwt.ts — token minting, verification and the auth cookie contract.
 */

import { describe, it, expect, vi } from 'vitest'
import { decodeJwt } from 'jose'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  setAuthCookies,
  clearAuthCookies,
  getAccessToken,
  getRefreshToken,
} from '@/lib/auth/jwt'
import { cookieJar } from '../helpers/cookie-jar'
import { expiredToken, tamperedToken } from '../helpers/auth'

const payload = { userId: 'u1', email: 'admin@hms.test', role: 'ADMIN' }

describe('token generation', () => {
  it('stamps an access token with type "access" and a 10 minute lifetime', async () => {
    const token = await generateAccessToken(payload)
    const claims = decodeJwt(token)

    expect(claims).toMatchObject({ userId: 'u1', email: 'admin@hms.test', role: 'ADMIN', type: 'access' })
    expect(claims.exp! - claims.iat!).toBe(600)
  })

  it('stamps a refresh token with type "refresh" and a 7 day lifetime', async () => {
    const token = await generateRefreshToken(payload)
    const claims = decodeJwt(token)

    expect(claims.type).toBe('refresh')
    expect(claims.exp! - claims.iat!).toBe(7 * 24 * 60 * 60)
  })

  it('signs with HS256', async () => {
    const token = await generateAccessToken(payload)
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    expect(header.alg).toBe('HS256')
  })
})

describe('verifyToken', () => {
  it('returns the payload for a valid token', async () => {
    const token = await generateAccessToken(payload)
    await expect(verifyToken(token)).resolves.toMatchObject({ userId: 'u1', role: 'ADMIN', type: 'access' })
  })

  it('returns null for an expired token', async () => {
    await expect(verifyToken(await expiredToken())).resolves.toBeNull()
  })

  it('returns null once a valid token passes its expiry', async () => {
    const token = await generateAccessToken(payload)
    await expect(verifyToken(token)).resolves.not.toBeNull()

    vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000))
    await expect(verifyToken(token)).resolves.toBeNull()
  })

  it('returns null for a token signed with a different secret', async () => {
    await expect(verifyToken(await tamperedToken())).resolves.toBeNull()
  })

  it('returns null for a token whose payload was edited', async () => {
    const token = await generateAccessToken({ ...payload, role: 'NURSE' })
    const [header, , signature] = token.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, role: 'ADMIN', type: 'access' })).toString('base64url')

    await expect(verifyToken(`${header}.${forgedBody}.${signature}`)).resolves.toBeNull()
  })

  it.each([['garbage'], [''], ['a.b.c'], ['null']])('returns null for the malformed token %j', async (token) => {
    await expect(verifyToken(token)).resolves.toBeNull()
  })
})

describe('auth cookies', () => {
  it('sets both cookies httpOnly, lax, root-scoped, with matching lifetimes', async () => {
    await setAuthCookies('access-value', 'refresh-value')

    expect(cookieJar.inspect('accessToken')).toMatchObject({
      value: 'access-value',
      options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 },
    })
    expect(cookieJar.inspect('refreshToken')).toMatchObject({
      value: 'refresh-value',
      options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 604800 },
    })
  })

  it('marks cookies secure only in production', async () => {
    await setAuthCookies('a', 'r')
    expect(cookieJar.inspect('accessToken')?.options.secure).toBe(false)

    vi.stubEnv('NODE_ENV', 'production')
    await setAuthCookies('a', 'r')
    expect(cookieJar.inspect('accessToken')?.options.secure).toBe(true)
  })

  it('reads back the tokens it stored', async () => {
    await setAuthCookies('access-value', 'refresh-value')
    await expect(getAccessToken()).resolves.toBe('access-value')
    await expect(getRefreshToken()).resolves.toBe('refresh-value')
  })

  it('returns null when no session cookie is present', async () => {
    await expect(getAccessToken()).resolves.toBeNull()
    await expect(getRefreshToken()).resolves.toBeNull()
  })

  it('clears both cookies', async () => {
    await setAuthCookies('access-value', 'refresh-value')
    await clearAuthCookies()

    expect(cookieJar.has('accessToken')).toBe(false)
    expect(cookieJar.has('refreshToken')).toBe(false)
    expect(cookieJar.deleted).toEqual(['accessToken', 'refreshToken'])
  })
})
