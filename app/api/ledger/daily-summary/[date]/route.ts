import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { getActiveClosure } from '@/lib/ledger/closure'

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

    // ADMIN and DOCTOR reconcile the whole day, so they see every operator's rows;
    // ?user_id= is an optional filter for them. Everyone else is scoped to their own
    // rows server-side and the parameter is ignored rather than trusted.
    const seesWholeDay = payload.role === 'ADMIN' || payload.role === 'DOCTOR'
    const userIdParam = request.nextUrl.searchParams.get('user_id')
    const scopedTo = seesWholeDay ? userIdParam : payload.userId

    let query = supabase
      .from('daily_ledger_transactions')
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        verified_by_user:users!verified_by(id, username),
        patient:patients(id, name)
      `)
      .eq('transaction_date', date)
      .order('created_at', { ascending: false })

    if (scopedTo) {
      query = query.eq('created_by', scopedTo)
    }

    const { data: transactions, error } = await query

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
    let unverifiedCount = 0

    // Debits were only ever reported as one lump. Without the split there is no
    // way to tell how much physical cash left the drawer, which is exactly what a
    // closing count has to reconcile against.
    const debitModes: Record<string, number> = {
      cash: 0,
      upi: 0,
      card: 0,
      bank_transfer: 0,
      cheque: 0
    }

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

        if (txn.payment_mode in debitModes) {
          debitModes[txn.payment_mode] += parseFloat(txn.amount)
        }
      }

      if (txn.status !== 'verified') {
        unverifiedCount++
      }
    })

    const netBalance = totalCredits - totalDebits
    const totalCreditsOther = totalCreditsBankTransfer + totalCreditsCheque
    const transactionCount = transactions?.length || 0

    // Whether the day is closed is a property of the date, read from the one
    // table that records it. It used to be inferred from whether any row on the
    // date carried status = 'day_closed' — which one operator settling their
    // shift was enough to trigger, for everyone.
    const closure = await getActiveClosure(supabase, date)

    // What the next close would open with, so the dialog can show the balance
    // chain before the admin commits to it.
    const { data: previousClosure } = await supabase
      .from('daily_ledger_closures')
      .select('closing_balance, closing_cash_balance')
      .eq('status', 'active')
      .lt('closure_date', date)
      .order('closure_date', { ascending: false })
      .limit(1)
      .maybeSingle()

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
      debit_mode_summary: debitModes,
      transactions,
      is_day_closed: closure !== null,
      closure,
      unverified_count: unverifiedCount,
      opening_balance_preview: Number(previousClosure?.closing_balance ?? 0),
      opening_cash_balance_preview: Number(previousClosure?.closing_cash_balance ?? 0)
    }

    return NextResponse.json({ success: true, data: summary })
  } catch (error: any) {
    console.error('Get daily summary error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
