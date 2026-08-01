/**
 * POST /api/auth/login
 */

import { describe, it, expect } from 'vitest'
import { decodeJwt } from 'jose'
import { POST as login } from '@/app/api/auth/login/route'
import { call } from '../../helpers/request'
import { hashPassword } from '../../helpers/auth'
import { cookieJar } from '../../helpers/cookie-jar'
import { db } from '../../helpers/fake-supabase'
import { NOW } from '../../setup'

async function seedUser(overrides: Record<string, any> = {}) {
  return db.seed('users', {
    id: 'u1',
    username: 'reception',
    email: 'user@hms.test',
    password_hash: await hashPassword('Secret@123'),
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
    needs_password_change: false,
    last_login: null,
    ...overrides,
  })[0]
}

const attempt = (body: unknown) => call(login, 'POST', '/api/auth/login', { body })

describe('POST /api/auth/login — validation', () => {
  it('rejects a missing email', async () => {
    const { status, body } = await attempt({ password: 'Secret@123' })
    expect(status).toBe(400)
    expect(body.error).toBe('Email and password are required')
  })

  it('rejects a missing password', async () => {
    const { status, body } = await attempt({ email: 'user@hms.test' })
    expect(status).toBe(400)
    expect(body.error).toBe('Email and password are required')
  })

  it('rejects an empty body', async () => {
    const { status } = await attempt({})
    expect(status).toBe(400)
  })

  it('returns 500 when the request body is not JSON', async () => {
    const { status, body } = await call(login, 'POST', '/api/auth/login', { rawBody: 'not-json' })
    expect(status).toBe(500)
    expect(body.error).toBe('An error occurred during login')
  })
})

describe('POST /api/auth/login — credentials', () => {
  it('rejects an unknown email with a generic message', async () => {
    await seedUser()
    const { status, body } = await attempt({ email: 'nobody@hms.test', password: 'Secret@123' })

    expect(status).toBe(401)
    expect(body.error).toBe('Invalid credentials')
  })

  it('rejects a wrong password with the same generic message', async () => {
    await seedUser()
    const { status, body } = await attempt({ email: 'user@hms.test', password: 'WrongPassword' })

    expect(status).toBe(401)
    expect(body.error).toBe('Invalid credentials')
  })

  it('does not set auth cookies on a failed attempt', async () => {
    await seedUser()
    await attempt({ email: 'user@hms.test', password: 'WrongPassword' })

    expect(cookieJar.has('accessToken')).toBe(false)
    expect(cookieJar.has('refreshToken')).toBe(false)
  })

  it('does not stamp last_login on a failed attempt', async () => {
    await seedUser()
    await attempt({ email: 'user@hms.test', password: 'WrongPassword' })

    expect(db.find('users', (r) => r.id === 'u1')?.last_login).toBeNull()
  })

  it('is case-sensitive on the email lookup', async () => {
    await seedUser({ email: 'user@hms.test' })
    const { status } = await attempt({ email: 'USER@HMS.TEST', password: 'Secret@123' })

    expect(status).toBe(401)
  })

  it('treats a database failure during lookup as invalid credentials', async () => {
    await seedUser()
    db.failNext('users')

    const { status, body } = await attempt({ email: 'user@hms.test', password: 'Secret@123' })
    expect(status).toBe(401)
    expect(body.error).toBe('Invalid credentials')
  })
})

describe('POST /api/auth/login — account status', () => {
  it('refuses an INACTIVE account before checking the password', async () => {
    await seedUser({ status: 'INACTIVE' })
    const { status, body } = await attempt({ email: 'user@hms.test', password: 'totally-wrong' })

    expect(status).toBe(403)
    expect(body.error).toBe('Account is inactive. Please contact administrator.')
  })

  it.each(['SUSPENDED', 'active', '', null])('refuses the non-ACTIVE status %j', async (accountStatus) => {
    await seedUser({ status: accountStatus })
    const { status } = await attempt({ email: 'user@hms.test', password: 'Secret@123' })

    expect(status).toBe(403)
  })
})

describe('POST /api/auth/login — success', () => {
  it('returns the user summary without the password hash', async () => {
    await seedUser()
    const { status, body } = await attempt({ email: 'user@hms.test', password: 'Secret@123' })

    expect(status).toBe(200)
    expect(body).toEqual({
      success: true,
      needsPasswordChange: false,
      user: { id: 'u1', email: 'user@hms.test', username: 'reception', role: 'RECEPTIONIST' },
    })
    expect(JSON.stringify(body)).not.toContain('$2')
  })

  it('surfaces needsPasswordChange so the client can force a reset', async () => {
    await seedUser({ needs_password_change: true })
    const { body } = await attempt({ email: 'user@hms.test', password: 'Secret@123' })

    expect(body.needsPasswordChange).toBe(true)
  })

  it('issues an access token and a refresh token carrying the user claims', async () => {
    await seedUser({ role: 'DOCTOR' })
    await attempt({ email: 'user@hms.test', password: 'Secret@123' })

    const access = decodeJwt(cookieJar.get('accessToken')!.value)
    const refresh = decodeJwt(cookieJar.get('refreshToken')!.value)

    expect(access).toMatchObject({ userId: 'u1', email: 'user@hms.test', role: 'DOCTOR', type: 'access' })
    expect(refresh).toMatchObject({ userId: 'u1', role: 'DOCTOR', type: 'refresh' })
  })

  it('sets both cookies httpOnly and root-scoped', async () => {
    await seedUser()
    await attempt({ email: 'user@hms.test', password: 'Secret@123' })

    expect(cookieJar.inspect('accessToken')?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    expect(cookieJar.inspect('refreshToken')?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('stamps last_login', async () => {
    await seedUser()
    await attempt({ email: 'user@hms.test', password: 'Secret@123' })

    expect(db.find('users', (r) => r.id === 'u1')?.last_login).toBe(NOW.toISOString())
  })

  it('accepts a password containing unicode and punctuation', async () => {
    await seedUser({ password_hash: await hashPassword('pässwörd!₹#42') })
    const { status } = await attempt({ email: 'user@hms.test', password: 'pässwörd!₹#42' })

    expect(status).toBe(200)
  })
})
