import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken } from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

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
      // Reset password flow - validate token from password_reset_tokens table
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      
      const { data: resetToken, error } = await supabase
        .from('password_reset_tokens')
        .select('user_id, expires_at, is_used')
        .eq('token_hash', tokenHash)
        .single()

      if (error || !resetToken) {
        return NextResponse.json(
          { error: 'Invalid reset token' },
          { status: 400 }
        )
      }

      // Check if token has expired
      if (new Date(resetToken.expires_at) < new Date()) {
        return NextResponse.json(
          { error: 'Reset token has expired. Please request a new one.' },
          { status: 400 }
        )
      }

      // Check if token was already used
      if (resetToken.is_used) {
        return NextResponse.json(
          { error: 'Reset token has already been used' },
          { status: 400 }
        )
      }

      userId = resetToken.user_id

      // Mark token as used
      await supabase
        .from('password_reset_tokens')
        .update({ is_used: true })
        .eq('token_hash', tokenHash)
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
