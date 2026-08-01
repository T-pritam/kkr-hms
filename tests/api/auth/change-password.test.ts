/**
 * POST /api/auth/change-password
 *
 * One endpoint, three modes:
 *   - session mode  (no token in body)             -> logged-in user changes their own password
 *   - reset mode    ({ token })                    -> password reset via emailed link
 *   - validate mode ({ token, check: true })       -> "is this reset link still good?"
 *
 * There is no separate /api/auth/validate-reset-token route; app/change-password/page.tsx
 * calls this endpoint with a dummy password and check: true.
 */

import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { POST as changePassword } from '@/app/api/auth/change-password/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, hashPassword, expiredToken } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { cookieJar } from '../../helpers/cookie-jar'
import { NOW } from '../../setup'

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
const RESET_TOKEN = 'a'.repeat(64)

const post = (body: unknown) => call(changePassword, 'POST', '/api/auth/change-password', { body })

async function seedUser(overrides: Record<string, any> = {}) {
  return db.seed('users', {
    id: 'u1',
    username: 'reception',
    email: 'user@hms.test',
    password_hash: await hashPassword('OldPassword@1'),
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
    needs_password_change: true,
    ...overrides,
  })[0]
}

function seedResetToken(overrides: Record<string, any> = {}) {
  return db.seed('password_reset_tokens', {
    id: 'rt1',
    user_id: 'u1',
    token_hash: sha256(RESET_TOKEN),
    expires_at: new Date(NOW.getTime() + 3600_000).toISOString(),
    is_used: false,
    used_at: null,
    ...overrides,
  })[0]
}

describe('POST /api/auth/change-password — validation', () => {
  it('requires a new password', async () => {
    const { status, body } = await post({})
    expect(status).toBe(400)
    expect(body.error).toBe('New password is required')
  })

  it('rejects an empty new password', async () => {
    const { status, body } = await post({ newPassword: '' })
    expect(status).toBe(400)
    expect(body.error).toBe('New password is required')
  })

  it('enforces a minimum length of 8 characters', async () => {
    const { status, body } = await post({ newPassword: 'Short1!' })
    expect(status).toBe(400)
    expect(body.error).toBe('Password must be at least 8 characters long')
  })

  it('accepts exactly 8 characters', async () => {
    await seedUser()
    await signInAs('RECEPTIONIST', { userId: 'u1' })

    const { status } = await post({ newPassword: 'Exactly8' })
    expect(status).toBe(200)
  })

  it('checks the length before looking at the reset token', async () => {
    const { status, body } = await post({ newPassword: 'short', token: 'anything' })
    expect(status).toBe(400)
    expect(body.error).toBe('Password must be at least 8 characters long')
  })

  it('returns 500 when the body is not JSON', async () => {
    const { status, body } = await call(changePassword, 'POST', '/api/auth/change-password', {
      rawBody: '{oops',
    })
    expect(status).toBe(500)
    expect(body.error).toBe('An error occurred')
  })
})

describe('POST /api/auth/change-password — session mode', () => {
  it('requires a session', async () => {
    signOut()
    const { status, body } = await post({ newPassword: 'NewPassword@1' })

    expect(status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects an expired session token', async () => {
    cookieJar.set('accessToken', await expiredToken())
    const { status, body } = await post({ newPassword: 'NewPassword@1' })

    expect(status).toBe(401)
    expect(body.error).toBe('Invalid token')
  })

  it('replaces the stored hash with one that verifies against the new password', async () => {
    await seedUser()
    await signInAs('RECEPTIONIST', { userId: 'u1' })

    const { status, body } = await post({ newPassword: 'NewPassword@1' })
    expect(status).toBe(200)
    expect(body).toEqual({ success: true })

    const stored = db.find('users', (r) => r.id === 'u1')!.password_hash
    await expect(bcrypt.compare('NewPassword@1', stored)).resolves.toBe(true)
    await expect(bcrypt.compare('OldPassword@1', stored)).resolves.toBe(false)
  })

  it('hashes with a cost factor of 12', async () => {
    await seedUser()
    await signInAs('RECEPTIONIST', { userId: 'u1' })
    await post({ newPassword: 'NewPassword@1' })

    expect(db.find('users', (r) => r.id === 'u1')!.password_hash).toMatch(/^\$2[aby]?\$12\$/)
  })

  it('clears the needs_password_change flag and stamps updated_at', async () => {
    await seedUser({ needs_password_change: true })
    await signInAs('RECEPTIONIST', { userId: 'u1' })
    await post({ newPassword: 'NewPassword@1' })

    const user = db.find('users', (r) => r.id === 'u1')!
    expect(user.needs_password_change).toBe(false)
    expect(user.updated_at).toBe(NOW.toISOString())
  })

  it('clears the legacy reset_token columns', async () => {
    await seedUser({ reset_token: 'legacy', reset_token_expiry: '2026-01-01' })
    await signInAs('RECEPTIONIST', { userId: 'u1' })
    await post({ newPassword: 'NewPassword@1' })

    const user = db.find('users', (r) => r.id === 'u1')!
    expect(user.reset_token).toBeNull()
    expect(user.reset_token_expiry).toBeNull()
  })

  it('changes only the caller’s own password', async () => {
    await seedUser({ id: 'u1' })
    const otherHash = await hashPassword('OtherPassword@1')
    db.seed('users', { id: 'u2', email: 'other@hms.test', password_hash: otherHash, role: 'NURSE' })

    await signInAs('RECEPTIONIST', { userId: 'u1' })
    await post({ newPassword: 'NewPassword@1' })

    expect(db.find('users', (r) => r.id === 'u2')!.password_hash).toBe(otherHash)
  })

  /**
   * Known defect — see BUGS.md #3. Changing a password leaves every previously issued
   * access and refresh token valid; there is no session invalidation or token version.
   */
  it.fails('should invalidate existing sessions after a password change', async () => {
    await seedUser()
    await signInAs('RECEPTIONIST', { userId: 'u1' })
    await post({ newPassword: 'NewPassword@1' })

    expect(cookieJar.has('accessToken')).toBe(false)
  })
})

describe('POST /api/auth/change-password — reset-token mode', () => {
  it('rejects a token that does not exist', async () => {
    await seedUser()
    const { status, body } = await post({ newPassword: 'NewPassword@1', token: 'unknown-token' })

    expect(status).toBe(400)
    expect(body.error).toBe('Invalid reset token')
  })

  it('rejects an expired token', async () => {
    await seedUser()
    seedResetToken({ expires_at: new Date(NOW.getTime() - 1000).toISOString() })

    const { status, body } = await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })
    expect(status).toBe(400)
    expect(body.error).toBe('Reset Link has expired. Please generate a new one.')
  })

  it('rejects a token that was already used', async () => {
    await seedUser()
    seedResetToken({ is_used: true })

    const { status, body } = await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })
    expect(status).toBe(400)
    expect(body.error).toBe('Reset token has already been used')
  })

  it('checks expiry before use', async () => {
    await seedUser()
    seedResetToken({ is_used: true, expires_at: new Date(NOW.getTime() - 1000).toISOString() })

    const { body } = await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })
    expect(body.error).toBe('Reset Link has expired. Please generate a new one.')
  })

  it('matches the token by its SHA-256 hash, never storing the raw value', async () => {
    await seedUser()
    seedResetToken()

    expect(db.rows('password_reset_tokens')[0].token_hash).not.toBe(RESET_TOKEN)
    const { status } = await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })
    expect(status).toBe(200)
  })

  it('sets the new password without needing a session', async () => {
    await seedUser()
    seedResetToken()
    signOut()

    const { status, body } = await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })
    expect(status).toBe(200)
    expect(body).toEqual({ success: true })

    const stored = db.find('users', (r) => r.id === 'u1')!.password_hash
    await expect(bcrypt.compare('NewPassword@1', stored)).resolves.toBe(true)
  })

  it('burns the token so it cannot be replayed', async () => {
    await seedUser()
    seedResetToken()

    await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })

    const tokenRow = db.find('password_reset_tokens', (r) => r.id === 'rt1')!
    expect(tokenRow.is_used).toBe(true)
    expect(tokenRow.used_at).toBe(NOW.toISOString())

    const replay = await post({ newPassword: 'Another@123', token: RESET_TOKEN })
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('Reset token has already been used')
  })

  it('resets the password of the token owner, not of the current session', async () => {
    await seedUser({ id: 'u1' })
    db.seed('users', { id: 'u2', email: 'other@hms.test', password_hash: await hashPassword('Other@1234') })
    seedResetToken({ user_id: 'u1' })
    await signInAs('ADMIN', { userId: 'u2' })

    await post({ newPassword: 'NewPassword@1', token: RESET_TOKEN })

    await expect(bcrypt.compare('NewPassword@1', db.find('users', (r) => r.id === 'u1')!.password_hash)).resolves.toBe(true)
    await expect(bcrypt.compare('Other@1234', db.find('users', (r) => r.id === 'u2')!.password_hash)).resolves.toBe(true)
  })
})

describe('POST /api/auth/change-password — validate-only mode (check: true)', () => {
  it('confirms a good token without changing anything', async () => {
    const user = await seedUser()
    seedResetToken()

    const { status, body } = await post({ newPassword: 'testtestt', token: RESET_TOKEN, check: true })

    expect(status).toBe(200)
    expect(body).toEqual({ success: true, message: 'Token is valid' })
    expect(db.find('users', (r) => r.id === 'u1')!.password_hash).toBe(user.password_hash)
    expect(db.find('password_reset_tokens', (r) => r.id === 'rt1')!.is_used).toBe(false)
  })

  it('reports an expired token', async () => {
    await seedUser()
    seedResetToken({ expires_at: new Date(NOW.getTime() - 1000).toISOString() })

    const { status, body } = await post({ newPassword: 'testtestt', token: RESET_TOKEN, check: true })
    expect(status).toBe(400)
    expect(body.error).toBe('Reset Link has expired. Please generate a new one.')
  })

  it('reports an unknown token', async () => {
    const { status, body } = await post({ newPassword: 'testtestt', token: 'nope', check: true })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid reset token')
  })

  /**
   * Known defect — see BUGS.md #4. `check` is only consulted after the password-length
   * gate, and any falsy-but-present value falls through to a real password change. The
   * client sends the literal dummy password 'testtestt', so a validation call that lost
   * its flag would silently set every user's password to that string.
   */
  it.fails('should not change the password when check is present but falsy', async () => {
    const user = await seedUser()
    seedResetToken()

    await post({ newPassword: 'testtestt', token: RESET_TOKEN, check: false })

    expect(db.find('users', (r) => r.id === 'u1')!.password_hash).toBe(user.password_hash)
  })
})
