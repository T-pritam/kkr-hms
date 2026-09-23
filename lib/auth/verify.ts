import { NextRequest, NextResponse } from 'next/server';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshToken,
  setAuthCookies,
  verifyToken,
  TokenPayload,
} from './jwt';

/**
 * An expired access token with a good refresh token beside it renews the
 * session rather than signing the user out mid-shift.
 *
 * Every ledger route used to hand-roll these twenty lines, and every other
 * route did without them — so the same expiry logged you out of Patients and
 * not out of the ledger. It belongs in the one guard both go through
 * (PRD v2 CR-05: "one shared auth guard").
 */
async function renewFromRefreshToken(): Promise<TokenPayload | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const payload = await verifyToken(refreshToken);
  // An access token pasted into the refresh cookie must not mint a session.
  if (!payload || payload.type !== 'refresh') return null;

  const claims = { userId: payload.userId, email: payload.email, role: payload.role };
  await setAuthCookies(await generateAccessToken(claims), await generateRefreshToken(claims));
  return payload;
}

export async function verifyAuth(request: NextRequest) {
  try {
    // Get token from Authorization header or cookies
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7)
      : request.cookies.get('accessToken')?.value;

    /**
     * Renew whenever there is no *valid* access token — missing **or expired**.
     *
     * This read `token ? verify(token) : renew()`, so a cookie that was present
     * but past its ten minutes never reached the refresh branch and the request
     * 401'd with a good seven-day refresh token sitting right beside it. That
     * is the other half of why the app died when left idle.
     *
     * A bearer token is not renewed: an API client sending an expired header
     * should be told so, not quietly handed a cookie session.
     */
    let payload = token ? await verifyToken(token) : null;
    if (!payload && !authHeader) {
      payload = await renewFromRefreshToken();
    }

    if (!payload) {
      return {
        isValid: false,
        user: null,
        error: token ? 'Invalid token' : 'No token provided'
      };
    }

    return {
      isValid: true,
      user: {
        id: payload.userId,
        email: payload.email,
        role: payload.role
      }
    };
  } catch (error) {
    return {
      isValid: false,
      user: null,
      error: error instanceof Error ? error.message : 'Auth verification failed'
    };
  }
}

export function sendUnauthorized(message: string = 'Unauthorized') {
  return NextResponse.json(
    { error: message },
    { status: 401 }
  );
}

export function sendForbidden(message: string = 'Forbidden') {
  return NextResponse.json(
    { error: message },
    { status: 403 }
  );
}
