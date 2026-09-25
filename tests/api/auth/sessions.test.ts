/**
 * When a session ends (BUGS.md #3, fixed 2026-09-25).
 *
 * A session is a 10-minute access token renewed from a 7-day refresh token.
 * Nothing used to tie either to the account, so a changed password, a reset or
 * a deactivated account left every session already issued running for up to
 * seven days. Now each token carries the user's `token_version`, and every
 * renewal — in `verifyAuth`, in the middleware and in `/api/auth/me` — re-reads
 * the user's status and version.
 *
 * The rules pinned here:
 *   * a password change or an admin reset bumps the version, and older
 *     sessions stop renewing;
 *   * a deactivated or deleted account stops renewing;
 *   * a session from before versions existed still renews — the deploy signs
 *     nobody out;
 *   * if the check cannot run at all, sessions carry on as before.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'crypto'
import { decodeJwt } from 'jose'
import { middleware } from '@/middleware'
import { verifyAuth } from '@/lib/auth/verify'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as adminReset } from '@/app/api/admin/users/[id]/reset-password/route'
import { GET as listUsers } from '@/app/api/admin/users/route'
import { PATCH as patchUser } from '@/app/api/admin/users/[id]/route'
import { POST as changePassword } from '@/app/api/auth/change-password/route'
import { generateRefreshToken } from '@/lib/auth/jwt'
import { call, makeRequest } from '../../helpers/request'
import { signInAs, signOut, hashPassword } from '../../helpers/auth'
import { cookieJar } from '../../helpers/cookie-jar'
import { db } from '../../helpers/fake-supabase'
import { aUser } from '../../helpers/seed'

const renew = () => verifyAuth(makeRequest('GET', '/api/patients'))
const visit = (path: string) => middleware(makeRequest('GET', path))

/** A signed-in user whose ten minutes have run out: only the refresh cookie is left. */
async function anExpiredSession(userId: string, refreshClaims: Record<string, unknown> = {}) {
  signOut()
  const refresh = await generateRefreshToken({
    userId,
    email: `${userId}@hms.test`,
    role: 'RECEPTIONIST',
    ...refreshClaims,
  })
  cookieJar.set('refreshToken', refresh)
}

describe('sessions — a renewal re-reads the account', () => {
  it('renews for an active user on the current version', async () => {
    aUser({ id: 'u1', token_version: 2 })
    await anExpiredSession('u1', { tv: 2 })

    expect((await renew()).isValid).toBe(true)
  })

  it('stops renewing once the password version has moved on', async () => {
    aUser({ id: 'u1', token_version: 3 })
    await anExpiredSession('u1', { tv: 2 })

    expect((await renew()).isValid).toBe(false)
  })

  it('stops renewing for a deactivated account', async () => {
    aUser({ id: 'u1', status: 'INACTIVE' })
    await anExpiredSession('u1', { tv: 0 })

    expect((await renew()).isValid).toBe(false)
  })

  it('stops renewing for an account that no longer exists', async () => {
    await anExpiredSession('u-gone', { tv: 0 })

    expect((await renew()).isValid).toBe(false)
  })

  // Sessions issued before this change carry no version at all.
  it('renews a session from before versions existed, so the deploy signs nobody out', async () => {
    aUser({ id: 'u1', token_version: 0 })
    await anExpiredSession('u1')

    expect((await renew()).isValid).toBe(true)
  })

  it('carries the version onto the renewed token', async () => {
    aUser({ id: 'u1', token_version: 4 })
    await anExpiredSession('u1', { tv: 4 })

    await renew()

    expect(decodeJwt(cookieJar.get('accessToken')!.value)).toMatchObject({ tv: 4, type: 'access' })
  })
})

describe('sessions — the middleware renews by the same rule', () => {
  it('refuses a stale version and sends the page to the login form', async () => {
    aUser({ id: 'u1', token_version: 1 })
    await anExpiredSession('u1', { tv: 0 })

    const response = await visit('/patients')

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
  })

  it('renews a current one, carrying the version', async () => {
    aUser({ id: 'u1', token_version: 1 })
    await anExpiredSession('u1', { tv: 1 })

    const response = await visit('/patients')

    expect(decodeJwt(response.cookies.get('accessToken')!.value)).toMatchObject({ userId: 'u1', tv: 1 })
  })
})

describe('sessions — what moves the version', () => {
  it('login puts the current version into both tokens', async () => {
    signOut()
    aUser({ id: 'u1', email: 'a@hms.test', password_hash: await hashPassword('Secret@123'), token_version: 5 })

    const { status } = await call(login, 'POST', '/api/auth/login', {
      body: { email: 'a@hms.test', password: 'Secret@123' },
      anonymous: true,
    })

    expect(status).toBe(200)
    expect(decodeJwt(cookieJar.get('accessToken')!.value)).toMatchObject({ tv: 5 })
    expect(decodeJwt(cookieJar.get('refreshToken')!.value)).toMatchObject({ tv: 5 })
  })

  it('an admin reset ends the user’s sessions', async () => {
    aUser({ id: 'u1', token_version: 0 })
    await signInAs('ADMIN')

    expect((await call(adminReset, 'POST', '/api/admin/users/u1/reset-password', { params: { id: 'u1' } })).status).toBe(200)
    expect(db.find('users', (r) => r.id === 'u1')!.token_version).toBe(1)

    await anExpiredSession('u1', { tv: 0 })
    expect((await renew()).isValid).toBe(false)
  })

  it('a forgotten-password reset ends every session too', async () => {
    aUser({ id: 'u1', token_version: 0 })
    db.seed('password_reset_tokens', {
      user_id: 'u1',
      token_hash: createHash('sha256').update('reset-me').digest('hex'),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      is_used: false,
    })
    signOut()

    const { status } = await call(changePassword, 'POST', '/api/auth/change-password', {
      body: { newPassword: 'Brand@New1', token: 'reset-me' },
      anonymous: true,
    })

    expect(status).toBe(200)
    expect(db.find('users', (r) => r.id === 'u1')!.token_version).toBe(1)
    // Nobody was signed in, so no new session is handed out.
    expect(cookieJar.has('accessToken')).toBe(false)
  })
})

describe('sessions — when the check cannot run', () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY
  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved
  })

  // Failing closed would sign everyone out on an infrastructure blip, and
  // nothing a caller sends can cause this.
  it('keeps the session as it always did', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await anExpiredSession('u-anyone', { tv: 9 })

    expect((await renew()).isValid).toBe(true)
  })

  it('keeps it when the database read fails', async () => {
    aUser({ id: 'u1', token_version: 7 })
    await anExpiredSession('u1', { tv: 0 })
    db.failNext('users')

    expect((await renew()).isValid).toBe(true)
  })
})

describe('the admin user list and edit (BUGS #5, #6, #70)', () => {
  it('caps the page size', async () => {
    await signInAs('ADMIN')
    for (let i = 0; i < 3; i++) aUser({ id: `u${i}` })

    const { body } = await call(listUsers, 'GET', '/api/admin/users', { query: { pageSize: '100000' } })

    expect(body.pageSize).toBe(100)
  })

  it('keeps a quote or a backslash in the search from escaping the value', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'o"brien\\\\x' })
    aUser({ id: 'u2', username: 'someone-else' })

    const { status, body } = await call(listUsers, 'GET', '/api/admin/users', { query: { search: 'o"brien' } })

    expect(status).toBe(200)
    expect(body.users.map((u: { id: string }) => u.id)).toEqual(['u1'])
  })

  it('applies only the four editable fields', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', role: 'NURSE', needs_password_change: false })

    const { status } = await call(patchUser, 'PATCH', '/api/admin/users/u1', {
      params: { id: 'u1' },
      body: { status: 'INACTIVE', needs_password_change: true, id: 'hijacked' },
    })

    expect(status).toBe(200)
    expect(db.find('users', (r) => r.id === 'u1')).toMatchObject({ status: 'INACTIVE', needs_password_change: false })
  })

  it('refuses a patch with nothing it may change', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1' })

    const { status } = await call(patchUser, 'PATCH', '/api/admin/users/u1', {
      params: { id: 'u1' },
      body: { password_hash: 'x' },
    })

    expect(status).toBe(400)
  })
})
