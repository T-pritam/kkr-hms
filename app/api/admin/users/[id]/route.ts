import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken } from '@/lib/auth/jwt'

export async function PUT(
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

    const { username, email, role, status } = await request.json()
    const { id: userId } = await params

    const supabase = await createClient()

    // Check if user is admin
    const { data: existingUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (existingUser?.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot modify admin users' },
        { status: 403 }
      )
    }

    // Prevent changing role to admin
    if (role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot change role to admin' },
        { status: 403 }
      )
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        username,
        email,
        role,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    const body = await request.json()
    const { id: userId } = await params

    const supabase = await createClient()

    // Check if user is admin
    const { data: existingUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (existingUser?.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot modify admin users' },
        { status: 403 }
      )
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Prevent admin from deleting themselves
    if (userId === payload.userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if user is admin
    const { data: existingUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (existingUser?.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot delete admin users' },
        { status: 403 }
      )
    }

    const { error } = await supabase.from('users').delete().eq('id', userId)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}
