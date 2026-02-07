import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TokenPayload } from './jwt';

export async function verifyAuth(request: NextRequest) {
  try {
    // Get token from Authorization header or cookies
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7)
      : request.cookies.get('accessToken')?.value;

    if (!token) {
      return {
        isValid: false,
        user: null,
        error: 'No token provided'
      };
    }

    const payload = await verifyToken(token);
    
    if (!payload) {
      return {
        isValid: false,
        user: null,
        error: 'Invalid token'
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
