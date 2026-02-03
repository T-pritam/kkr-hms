import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken } from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(accessToken)
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: userId } = await params
    const supabase = await createClient()

    // Get user details
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get default password from environment
    const defaultPassword = process.env.DEFAULT_PASSWORD || 'Welcome@123'

    // Hash the default password
    const passwordHash = await bcrypt.hash(defaultPassword, 12)

    // Update user password and set needs_password_change flag
    await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        needs_password_change: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return NextResponse.json({ 
      success: true,
      message: 'Password reset to default. User must change on next login.'
    })
  } catch (error) {
    console.error('Error resetting password:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}
