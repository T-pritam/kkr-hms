import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * GET /api/ledger/daily-summary/[date]
 * Returns daily summary with all transactions and statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params
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

    // Fetch all transactions for the date
    const { data: transactions, error } = await supabase
      .from('daily_ledger_transactions')
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        verified_by_user:users!verified_by(id, username),
        patient:patients(id, name)
      `)
      .eq('transaction_date', date)
      .eq('created_by', payload.userId) // Ensure users only see their transactions
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get daily summary error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate statistics
    let totalCredits = 0
    let totalDebits = 0
    let totalCreditsCash = 0
    let totalCreditsUpi = 0
    let totalCreditsCard = 0
    let totalCreditsBankTransfer = 0
    let totalCreditsCheque = 0
    let creditCount = 0
    let debitCount = 0
    let isDayClosed = false

    transactions?.forEach((txn: any) => {
      if (txn.transaction_type === 'credit') {
        totalCredits += parseFloat(txn.amount)
        creditCount++

        // Breakdown by payment mode
        switch (txn.payment_mode) {
          case 'cash':
            totalCreditsCash += parseFloat(txn.amount)
            break
          case 'upi':
            totalCreditsUpi += parseFloat(txn.amount)
            break
          case 'card':
            totalCreditsCard += parseFloat(txn.amount)
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

      // Check if any transaction is closed
      if (txn.status === 'day_closed') {
        isDayClosed = true
      }
    })

    const netBalance = totalCredits - totalDebits
    const totalCreditsOther = totalCreditsBankTransfer + totalCreditsCheque
    const transactionCount = transactions?.length || 0

    const summary = {
      date,
      total_credits: totalCredits,
      total_debits: totalDebits,
      net_balance: netBalance,
      total_credits_cash: totalCreditsCash,
      total_credits_upi: totalCreditsUpi,
      total_credits_card: totalCreditsCard,
      total_credits_other: totalCreditsOther,
      credit_count: creditCount,
      debit_count: debitCount,
      transaction_count: transactionCount,
      payment_mode_summary: {
        cash: totalCreditsCash,
        upi: totalCreditsUpi,
        card: totalCreditsCard,
        bank_transfer: totalCreditsBankTransfer,
        cheque: totalCreditsCheque
      },
      transactions,
      is_day_closed: isDayClosed
    }

    return NextResponse.json({ success: true, data: summary })
  } catch (error: any) {
    console.error('Get daily summary error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
