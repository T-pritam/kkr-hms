import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * POST /api/ledger/close-employee-day
 * Closes/settles all transactions for an employee on a specific date (admin only)
 */
export async function POST(request: NextRequest) {
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
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const { employee_id, settlement_date, notes } = body

    if (!employee_id || !settlement_date) {
      return NextResponse.json({ error: 'employee_id and settlement_date are required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get all transactions for this employee on this date that are not already closed
    const { data: transactions, error: fetchError } = await supabase
      .from('daily_ledger_transactions')
      .select('*')
      .eq('created_by', employee_id)
      .eq('transaction_date', settlement_date)

    if (fetchError) {
      console.error('Fetch transactions error:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found for this employee on this date' }, { status: 404 })
    }

    // Check if already closed
    const alreadyClosed = transactions.some((txn: any) => txn.status === 'day_closed')
    if (alreadyClosed) {
      return NextResponse.json({ error: 'This employee day has already been closed' }, { status: 400 })
    }

    // Calculate totals
    let totalCredits = 0
    let totalDebits = 0

    transactions.forEach((txn: any) => {
      if (txn.transaction_type === 'credit') {
        totalCredits += parseFloat(txn.amount)
      } else if (txn.transaction_type === 'debit') {
        totalDebits += parseFloat(txn.amount)
      }
    })

    const netBalance = totalCredits - totalDebits

    // Update all transactions to day_closed status
    const { error: updateError } = await supabase
      .from('daily_ledger_transactions')
      .update({
        status: 'day_closed',
        notes: notes || 'Marked as paid'
      })
      .eq('created_by', employee_id)
      .eq('transaction_date', settlement_date)

    if (updateError) {
      console.error('Update transactions error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Employee marked as paid successfully',
      data: {
        employee_id,
        settlement_date,
        totalCredits,
        totalDebits,
        netBalance,
        transactionsClosed: transactions.length
      }
    })
  } catch (error: any) {
    console.error('Close employee day error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
