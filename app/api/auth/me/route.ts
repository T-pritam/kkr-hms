import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, verifyToken } from '@/lib/auth/jwt'

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getAccessToken()
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(accessToken)
    
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: payload.userId,
        email: payload.email,
        role: payload.role,
      },
    })
  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
