import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/auth/jwt'

export async function POST(request: NextRequest) {
  await clearAuthCookies()
  return NextResponse.json({ success: true })
}
