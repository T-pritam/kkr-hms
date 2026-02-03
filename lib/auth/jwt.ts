import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-at-least-32-characters-long'
)

const ACCESS_TOKEN_EXPIRY = '10m' // 10 minutes
const REFRESH_TOKEN_EXPIRY = '7d' // 7 days

export interface TokenPayload {
  userId: string
  email: string
  role: string
  type: 'access' | 'refresh'
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
    maxAge: 10 * 60, // 10 minutes
    path: '/',
  })

  // Set refresh token (httpOnly, secure, longer-lived)
  cookieStore.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
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
