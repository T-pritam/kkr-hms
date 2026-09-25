import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-at-least-32-characters-long'
)

/**
 * One number each, in seconds, used for both the JWT's own expiry and the
 * cookie that carries it. They were written out separately before, and drifted:
 * middleware refreshed a 10-minute token into a 20-minute cookie, so for ten
 * minutes the browser held something every endpoint rejected (BUGS.md #8).
 */
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_TTL_SECONDS}s`
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_TTL_SECONDS}s`

export interface TokenPayload {
  userId: string
  email: string
  role: string
  type: 'access' | 'refresh'
  /** The user's `token_version` when this was issued (BUGS #3). Absent = 0. */
  tv?: number
}

export async function generateAccessToken(payload: Omit<TokenPayload, 'type'>) {
  return await new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function generateRefreshToken(payload: Omit<TokenPayload, 'type'>) {
  return await new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    return verified.payload as unknown as TokenPayload
  } catch (error) {
    return null
  }
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  
  // Set access token (httpOnly, secure, short-lived)
  cookieStore.set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: '/',
  })

  // Set refresh token (httpOnly, secure, longer-lived)
  cookieStore.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    path: '/',
  })
}

export async function clearAuthCookies() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete('accessToken')
  cookieStore.delete('refreshToken')
}

export async function getAccessToken(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return cookieStore.get('accessToken')?.value || null
}

export async function getRefreshToken(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return cookieStore.get('refreshToken')?.value || null
}
