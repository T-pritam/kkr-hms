/**
 * Session helpers. Tokens are minted with the real `jose` signer and the real
 * JWT_SECRET, so every signature, claim and expiry check in the app runs for real.
 */

import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { cookieJar } from './cookie-jar'
import { db } from './fake-supabase'

export type Role = 'ADMIN' | 'DOCTOR' | 'NURSE' | 'RECEPTIONIST' | 'LAB_TECHNICIAN'

export interface Session {
  userId: string
  email: string
  role: Role
  accessToken: string
  refreshToken: string
}

const secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-at-least-32-characters-long')

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${String(++sequence).padStart(4, '0')}`

/**
 * Start a session for the given role. Sets both auth cookies in the jar, which
 * `makeRequest` then copies onto outgoing requests.
 *
 * `seedUser: true` also inserts the matching row into the fake `users` table, which
 * the handful of routes that re-read the role from the database require.
 */
export async function signInAs(
  role: Role,
  options: { userId?: string; email?: string; seedUser?: boolean; username?: string } = {}
): Promise<Session> {
  const userId = options.userId ?? nextId('user')
  const email = options.email ?? `${role.toLowerCase()}@hms.test`

  const payload = { userId, email, role }
  const accessToken = await generateAccessToken(payload)
  const refreshToken = await generateRefreshToken(payload)

  cookieJar.set('accessToken', accessToken, { httpOnly: true, path: '/' })
  cookieJar.set('refreshToken', refreshToken, { httpOnly: true, path: '/' })

  if (options.seedUser) {
    db.seed('users', {
      id: userId,
      email,
      username: options.username ?? role.toLowerCase(),
      role,
      status: 'ACTIVE',
      needs_password_change: false,
    })
  }

  return { userId, email, role, accessToken, refreshToken }
}

/** Clear the session — subsequent requests go out unauthenticated. */
export function signOut(): void {
  cookieJar.clear()
}

/** A session where only the refresh token survives, as when the access token expires. */
export async function signInWithRefreshTokenOnly(
  role: Role,
  options: { userId?: string; email?: string } = {}
): Promise<Session> {
  const session = await signInAs(role, options)
  cookieJar.delete('accessToken')
  return session
}

/** A correctly signed token that expired an hour ago. */
export async function expiredToken(
  role: Role = 'ADMIN',
  type: 'access' | 'refresh' = 'access'
): Promise<string> {
  const issued = Math.floor(Date.now() / 1000) - 7200
  return new SignJWT({ userId: 'user-expired', email: 'expired@hms.test', role, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issued)
    .setExpirationTime(issued + 600)
    .sign(secret())
}

/** A well-formed token signed with the wrong secret. */
export async function tamperedToken(role: Role = 'ADMIN'): Promise<string> {
  return new SignJWT({ userId: 'user-forged', email: 'forged@hms.test', role, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode('a-completely-different-secret-value-32ch'))
}

/** Mint a token without installing it — for `Authorization: Bearer` header tests. */
export async function tokenFor(
  role: Role,
  options: { userId?: string; email?: string; type?: 'access' | 'refresh' } = {}
): Promise<string> {
  const payload = {
    userId: options.userId ?? nextId('user'),
    email: options.email ?? `${role.toLowerCase()}@hms.test`,
    role,
  }
  return options.type === 'refresh' ? generateRefreshToken(payload) : generateAccessToken(payload)
}

/**
 * Hash a password for fixtures. Cost 4 rather than the app's 12 — `bcrypt.compare`
 * reads the cost from the hash, so login still verifies correctly and the suite
 * doesn't spend seconds per test on key stretching.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 4)
}
