import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username')
      .eq('email', email)
      .single()

    if (error || !user) {
      // Don't reveal if user exists or not
      return NextResponse.json({ success: true })
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Save reset token to dedicated table (secure approach)
    const { error: tokenError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token_hash: crypto.createHash('sha256').update(resetToken).digest('hex'),
        expires_at: resetTokenExpiry.toISOString(),
        is_used: false,
      })

    if (tokenError) {
      console.error('Error saving reset token:', tokenError)
      return NextResponse.json({ success: true }) // Don't reveal error
    }

    // Send email via Brevo Edge Function
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    console.log(baseUrl)
    const resetUrl = `${baseUrl}/change-password?token=${resetToken}`
    
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-reset-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: user.email,
        resetUrl,
        username: user.username,
        baseUrl,
      }),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Password reset error:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}
