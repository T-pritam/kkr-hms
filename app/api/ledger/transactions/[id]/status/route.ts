import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { assertLedgerDateOpen } from '@/lib/ledger/closure'

/**
 * PUT /api/ledger/transactions/[id]/status
 * Updates transaction status (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !['pending', 'verified'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be pending or verified.' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get existing transaction
    const { data: existing, error: fetchError } = await supabase
      .from('daily_ledger_transactions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Verification is part of reconciling the day, so it stops when the day is
    // closed — a property of the date, not of the row.
    const locked = await assertLedgerDateOpen(supabase, existing.transaction_date, 'verify')
    if (locked) return locked

    // Update status
    const updates: any = { status }
    
    if (status === 'verified') {
      updates.verified_at = new Date().toISOString()
      updates.verified_by = payload.userId
    } else if (status === 'pending') {
      updates.verified_at = null
      updates.verified_by = null
    }

    const { data, error } = await supabase
      .from('daily_ledger_transactions')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        verified_by_user:users!verified_by(id, username),
        patient:patients(id, name)
      `)
      .single()

    if (error) {
      console.error('Update status error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction status updated',
      data 
    })
  } catch (error: any) {
    console.error('Update status error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
