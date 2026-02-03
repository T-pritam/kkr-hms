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

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 3600000) // 1 hour

    // Save reset token
    await supabase
      .from('users')
      .update({
        reset_token: resetToken,
        reset_token_expiry: resetTokenExpiry.toISOString(),
      })
      .eq('id', user.id)

    // Send email via Brevo Edge Function
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/change-password?token=${resetToken}`
    
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
