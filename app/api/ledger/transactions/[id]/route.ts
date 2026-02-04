import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * PUT /api/ledger/transactions/[id]
 * Updates a transaction (amount, payment_mode, reference_number, description)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const body = await request.json()

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

    // Check if day is closed
    if (existing.status === 'day_closed') {
      return NextResponse.json({ error: 'Cannot update closed transaction' }, { status: 400 })
    }

    // Check ownership (non-admin can only update their own)
    if (payload.role !== 'admin' && existing.created_by !== payload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build update object
    const updates: any = {}
    if (body.amount !== undefined) {
      if (body.amount <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }
      updates.amount = parseFloat(body.amount)
    }
    if (body.payment_mode !== undefined) {
      if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(body.payment_mode)) {
        return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 })
      }
      updates.payment_mode = body.payment_mode
    }
    if (body.reference_number !== undefined) {
      updates.reference_number = body.reference_number || null
    }
    if (body.description !== undefined) {
      if (!body.description || body.description.trim() === '') {
        return NextResponse.json({ error: 'Description cannot be empty' }, { status: 400 })
      }
      updates.description = body.description
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes || null
    }

    // Validate UPI requirement
    const finalPaymentMode = updates.payment_mode || existing.payment_mode
    const finalReference = updates.reference_number !== undefined ? updates.reference_number : existing.reference_number
    
    if (finalPaymentMode === 'upi' && (!finalReference || finalReference.trim() === '')) {
      return NextResponse.json({ error: 'Reference number required for UPI payments' }, { status: 400 })
    }

    // Update transaction
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
      console.error('Update transaction error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction updated successfully',
      data 
    })
  } catch (error: any) {
    console.error('Update transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/ledger/transactions/[id]
 * Deletes a transaction
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Check if day is closed
    if (existing.status === 'day_closed') {
      return NextResponse.json({ error: 'Cannot delete closed transaction' }, { status: 400 })
    }

    // Check ownership (non-admin can only delete their own)
    if (payload.role !== 'admin' && existing.created_by !== payload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete transaction
    const { error } = await supabase
      .from('daily_ledger_transactions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete transaction error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction deleted successfully'
    })
  } catch (error: any) {
    console.error('Delete transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
