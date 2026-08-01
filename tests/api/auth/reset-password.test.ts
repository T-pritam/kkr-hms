/**
 * POST /api/auth/reset-password — issue a reset link.
 *
 * The email itself is sent by the Supabase Edge Function `send-reset-email` (Brevo).
 * These tests cover everything up to and including the call to that function; whether
 * the message actually lands in an inbox is a manual check (see TESTING.md).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { call } from '../../helpers/request'
import { db } from '../../helpers/fake-supabase'
import { NOW } from '../../setup'

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: 'msg-1' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

const request = (body: unknown) => call(resetPassword, 'POST', '/api/auth/reset-password', { body })

function seedUser(overrides: Record<string, any> = {}) {
  return db.seed('users', {
    id: 'u1',
    username: 'reception',
    email: 'user@hms.test',
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
    ...overrides,
  })[0]
}

/** The raw token the route generated, recovered from the URL it sent to the edge function. */
function tokenFromEmailCall(): string {
  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  return new URL(body.resetUrl).searchParams.get('token')!
}

describe('POST /api/auth/reset-password — validation', () => {
  it('requires an email', async () => {
    const { status, body } = await request({})
    expect(status).toBe(400)
    expect(body.error).toBe('Email is required')
  })

  it('returns 500 when the body is not JSON', async () => {
    const { status, body } = await call(resetPassword, 'POST', '/api/auth/reset-password', { rawBody: 'oops' })
    expect(status).toBe(500)
    expect(body.error).toBe('An error occurred')
  })
})

describe('POST /api/auth/reset-password — account enumeration is not possible', () => {
  it('returns success for an unknown email', async () => {
    seedUser()
    const { status, body } = await request({ email: 'nobody@hms.test' })

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
  })

  it('issues no token and sends no email for an unknown email', async () => {
    const { status } = await request({ email: 'nobody@hms.test' })

    expect(status).toBe(200)
    expect(db.count('password_reset_tokens')).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the same response for known and unknown emails', async () => {
    seedUser()
    const known = await request({ email: 'user@hms.test' })
    const unknown = await request({ email: 'nobody@hms.test' })

    expect(known.status).toBe(unknown.status)
    expect(known.body).toEqual(unknown.body)
  })

  it('still returns success when the token insert fails', async () => {
    seedUser()
    db.failNext('password_reset_tokens')

    const { status, body } = await request({ email: 'user@hms.test' })
    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still returns success when the email service rejects the request', async () => {
    seedUser()
    fetchMock.mockResolvedValueOnce(new Response('upstream down', { status: 502 }))

    const { status, body } = await request({ email: 'user@hms.test' })
    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(db.count('password_reset_tokens')).toBe(1)
  })
})

describe('POST /api/auth/reset-password — token issued', () => {
  it('stores only a SHA-256 hash of the token', async () => {
    seedUser()
    await request({ email: 'user@hms.test' })

    const rawToken = tokenFromEmailCall()
    const stored = db.rows('password_reset_tokens')[0]

    expect(stored.token_hash).toBe(sha256(rawToken))
    expect(stored.token_hash).not.toBe(rawToken)
  })

  it('generates a 32-byte random token', async () => {
    seedUser()
    await request({ email: 'user@hms.test' })

    expect(tokenFromEmailCall()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates a different token on every request', async () => {
    seedUser()
    await request({ email: 'user@hms.test' })
    const first = tokenFromEmailCall()

    fetchMock.mockClear()
    await request({ email: 'user@hms.test' })
    const second = tokenFromEmailCall()

    expect(second).not.toBe(first)
    expect(db.count('password_reset_tokens')).toBe(2)
  })

  it('links the token to the user and expires it in one hour', async () => {
    seedUser({ id: 'u1' })
    await request({ email: 'user@hms.test' })

    const stored = db.rows('password_reset_tokens')[0]
    expect(stored.user_id).toBe('u1')
    expect(stored.is_used).toBe(false)
    expect(new Date(stored.expires_at).getTime() - NOW.getTime()).toBe(3600_000)
  })
})

describe('POST /api/auth/reset-password — email dispatch', () => {
  it('calls the send-reset-email edge function with the service role key', async () => {
    seedUser()
    await request({ email: 'user@hms.test' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe('https://test-project.supabase.co/functions/v1/send-reset-email')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-service-role-key',
    })
  })

  it('sends the recipient, username, base URL and a reset link carrying the raw token', async () => {
    seedUser({ email: 'user@hms.test', username: 'reception' })
    await request({ email: 'user@hms.test' })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload).toEqual({
      email: 'user@hms.test',
      username: 'reception',
      baseUrl: 'https://hms.test',
      resetUrl: expect.stringMatching(/^https:\/\/hms\.test\/change-password\?token=[0-9a-f]{64}$/),
    })
  })

  it('falls back to localhost when NEXT_PUBLIC_APP_URL is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    seedUser()
    await request({ email: 'user@hms.test' })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.baseUrl).toBe('http://localhost:3000')
    expect(payload.resetUrl).toContain('http://localhost:3000/change-password?token=')
  })

  it('sends the address stored on the account, not the one supplied by the caller', async () => {
    seedUser({ email: 'user@hms.test' })
    await request({ email: 'user@hms.test' })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).email).toBe('user@hms.test')
  })
})
