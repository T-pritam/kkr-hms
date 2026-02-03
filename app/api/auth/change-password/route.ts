import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken } from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { newPassword, token } = await request.json()

    if (!newPassword) {
      return NextResponse.json(
        { error: 'New password is required' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    let userId: string

    if (token) {
      // Reset password flow - find user by token
      const { data: user, error } = await supabase
        .from('users')
        .select('id, reset_token, reset_token_expiry')
        .eq('reset_token', token)
        .single()

      if (error || !user) {
        return NextResponse.json(
          { error: 'Invalid or expired reset token' },
          { status: 400 }
        )
      }

      if (user.reset_token_expiry && new Date(user.reset_token_expiry) < new Date()) {
        return NextResponse.json(
          { error: 'Reset token has expired' },
          { status: 400 }
        )
      }

      userId = user.id
    } else {
      // Change password flow for logged-in users
      const accessToken = await getAccessToken()
      if (!accessToken) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      const payload = await verifyToken(accessToken)
      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        )
      }

      userId = payload.userId
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12)

    // Update password
    await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        needs_password_change: false,
        reset_token: null,
        reset_token_expiry: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}
