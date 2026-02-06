import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * POST /api/ledger/close-day
 * Closes the entire daily ledger for a specific date (admin only)
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
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const { closure_date, opening_balance, notes } = body

    if (!closure_date) {
      return NextResponse.json({ error: 'closure_date is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Check if already closed
    const { data: existingClosure } = await supabase
      .from('daily_ledger_closures')
      .select('*')
      .eq('closure_date', closure_date)
      .single()

    if (existingClosure) {
      return NextResponse.json({ error: 'This date has already been closed' }, { status: 400 })
    }

    // Get all transactions for the date
    const { data: transactions, error: fetchError } = await supabase
      .from('daily_ledger_transactions')
      .select('*')
      .eq('transaction_date', closure_date)

    if (fetchError) {
      console.error('Fetch transactions error:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found for this date' }, { status: 404 })
    }

    // Calculate statistics
    let totalCredits = 0
    let totalDebits = 0
    let totalCreditsCash = 0
    let totalCreditsUpi = 0
    let totalCreditsBankTransfer = 0
    let totalCreditsCheque = 0
    let creditCount = 0
    let debitCount = 0

    transactions.forEach((txn: any) => {
      if (txn.transaction_type === 'credit') {
        totalCredits += parseFloat(txn.amount)
        creditCount++

        switch (txn.payment_mode) {
          case 'cash':
            totalCreditsCash += parseFloat(txn.amount)
            break
          case 'upi':
            totalCreditsUpi += parseFloat(txn.amount)
            break
          case 'bank_transfer':
            totalCreditsBankTransfer += parseFloat(txn.amount)
            break
          case 'cheque':
            totalCreditsCheque += parseFloat(txn.amount)
            break
        }
      } else if (txn.transaction_type === 'debit') {
        totalDebits += parseFloat(txn.amount)
        debitCount++
      }
    })

    const netBalance = totalCredits - totalDebits
    const totalCreditsOther = totalCreditsBankTransfer + totalCreditsCheque
    const closingBalance = (opening_balance || 0) + netBalance

    // Update all transactions to day_closed
    const { error: updateError } = await supabase
      .from('daily_ledger_transactions')
      .update({ status: 'day_closed' })
      .eq('transaction_date', closure_date)

    if (updateError) {
      console.error('Update transactions error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Create closure record
    const { data: closure, error: closureError } = await supabase
      .from('daily_ledger_closures')
      .insert([{
        closure_date,
        total_credits: totalCredits,
        total_debits: totalDebits,
        net_balance: netBalance,
        total_credits_cash: totalCreditsCash,
        total_credits_upi: totalCreditsUpi,
        total_credits_other: totalCreditsOther,
        transaction_count: transactions.length,
        credit_count: creditCount,
        debit_count: debitCount,
        closed_by: payload.userId,
        notes: notes || null,
        opening_balance: opening_balance || 0,
        closing_balance: closingBalance
      }])
      .select()
      .single()

    if (closureError) {
      console.error('Create closure error:', closureError)
      return NextResponse.json({ error: closureError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Daily ledger closed successfully',
      data: {
        closure_date,
        totalCredits,
        totalDebits,
        netBalance,
        closingBalance,
        transactionCount: transactions.length,
        creditCount,
        debitCount,
        closedAt: closure.closed_at,
        closedBy: payload.userId
      }
    })
  } catch (error: any) {
    console.error('Close day error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
