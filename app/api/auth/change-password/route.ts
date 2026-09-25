import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  verifyToken,
  getAccessToken,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/**
 * Change a password — with a reset link's token, or as the signed-in user.
 *
 * Two fixes live here:
 *
 * **Asking whether a reset link is valid is its own request (BUGS #4).** The
 * page used to send a dummy password, `'testtestt'`, with `check: true`, and
 * the flag was read only *after* the length rule — so any call where `check`
 * was present but falsy fell through and set the password to that dummy.
 * Now a request carrying `check` at all is validate-only, is answered before
 * anything else, and never changes a password.
 *
 * **A new password ends the old sessions (BUGS #3).** The user's
 * `token_version` is bumped, so every session issued before the change stops
 * renewing within ten minutes (`lib/auth/session-version.ts`). The browser
 * that made the change is given a fresh session carrying the new version, so
 * the person who just changed their password is not thrown out with the rest.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { newPassword, token } = body
    const supabase = createServiceClient()

    // ── Validate-only: is this reset link still good? ───────────────────────
    if (body.check !== undefined) {
      if (!token) {
        return NextResponse.json({ error: 'A reset token is required' }, { status: 400 })
      }
      const refusal = await checkResetToken(supabase, token)
      if (refusal) return refusal
      return NextResponse.json({ success: true, message: 'Token is valid' }, { status: 200 })
    }

    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    let userId: string
    let sessionMode = false

    if (token) {
      const refusal = await checkResetToken(supabase, token)
      if (refusal) return refusal

      const { data: resetToken } = await supabase
        .from('password_reset_tokens')
        .select('user_id')
        .eq('token_hash', hashToken(token))
        .single()
      userId = resetToken!.user_id
    } else {
      // The signed-in user changing their own password.
      const accessToken = await getAccessToken()
      if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const payload = await verifyToken(accessToken)
      if (!payload || payload.type !== 'access') {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }

      userId = payload.userId
      sessionMode = true
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, email, role, token_version')
      .eq('id', userId)
      .single()

    const passwordHash = await bcrypt.hash(newPassword, 12)
    const tokenVersion = (Number(user?.token_version) || 0) + 1

    await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        needs_password_change: false,
        reset_token: null,
        reset_token_expiry: null,
        token_version: tokenVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (token) {
      await supabase
        .from('password_reset_tokens')
        .update({ is_used: true, used_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('token_hash', hashToken(token))
    }

    // This browser keeps a session, on the new version; every other one ends.
    if (sessionMode && user) {
      const claims = { userId: user.id, email: user.email, role: user.role, tv: tokenVersion }
      await setAuthCookies(await generateAccessToken(claims), await generateRefreshToken(claims))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}

/** A refusal for a reset token that is unknown, expired or used; null if it is good. */
async function checkResetToken(
  supabase: ReturnType<typeof createServiceClient>,
  token: string
): Promise<NextResponse | null> {
  const { data: resetToken, error } = await supabase
    .from('password_reset_tokens')
    .select('user_id, expires_at, is_used')
    .eq('token_hash', hashToken(token))
    .single()

  if (error || !resetToken) {
    return NextResponse.json({ error: 'Invalid reset token' }, { status: 400 })
  }
  if (new Date(resetToken.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Reset Link has expired. Please generate a new one.' },
      { status: 400 }
    )
  }
  if (resetToken.is_used) {
    return NextResponse.json({ error: 'Reset token has already been used' }, { status: 400 })
  }
  return null
}
