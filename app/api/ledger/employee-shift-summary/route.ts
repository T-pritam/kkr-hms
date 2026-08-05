import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveClosure } from '@/lib/ledger/closure'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * GET /api/ledger/employee-shift-summary
 * Query params: date (optional, defaults to today)
 * Returns employee-wise shift summary (admin only)
 */
export async function GET(request: NextRequest) {
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

    // Admin only — the comment and the error message have always said so; the
    // condition let DOCTOR through as well. This screen exposes one operator's
    // entire day of cash and is the entry point to marking it settled.
    if (payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const supabase = await createClient()

    // Fetch all transactions for the date
    const { data: transactions, error } = await supabase
      .from('daily_ledger_transactions')
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        patient:patients!patient_id(patient_id, name)
      `)
      .eq('transaction_date', date)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get employee shift summary error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Who has already settled comes from the settlements table, not from a status
    // on the transactions. Those are different facts and were being read as one.
    const { data: settlements } = await supabase
      .from('daily_ledger_shift_settlements')
      .select('*')
      .eq('settlement_date', date)
      .eq('status', 'active')

    const settlementByEmployee = new Map<string, any>(
      (settlements ?? []).map((s: any) => [s.employee_id, s])
    )

    // Whether the date itself is closed is a separate fact again, and the screen
    // needs both: an operator can be settled on a day that is still open, and a
    // closed day can still contain operators who never settled.
    const closure = await getActiveClosure(supabase, date)

    // Group by employee
    const employeeMap = new Map<string, any>()

    transactions?.forEach((txn: any) => {
      const employeeId = txn.created_by

      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: txn.created_by_user?.username || 'Unknown',
          totalCredits: 0,
          totalDebits: 0,
          netBalance: 0,
          creditCount: 0,
          debitCount: 0,
          transactionCount: 0,
          // Per-mode split, so the modal can say how much *physical cash* is owed
          // rather than a single figure that silently includes UPI and card.
          creditsCash: 0,
          creditsUpi: 0,
          creditsCard: 0,
          creditsBankTransfer: 0,
          creditsCheque: 0,
          debitsCash: 0,
          cashExpected: 0,
          isSettled: false,
          settlement: null,
          transactions: []
        })
      }

      const empData = employeeMap.get(employeeId)
      const amount = parseFloat(txn.amount)

      if (txn.transaction_type === 'credit') {
        empData.totalCredits += amount
        empData.creditCount++

        switch (txn.payment_mode) {
          case 'cash': empData.creditsCash += amount; break
          case 'upi': empData.creditsUpi += amount; break
          case 'card': empData.creditsCard += amount; break
          case 'bank_transfer': empData.creditsBankTransfer += amount; break
          case 'cheque': empData.creditsCheque += amount; break
        }
      } else if (txn.transaction_type === 'debit') {
        empData.totalDebits += amount
        empData.debitCount++

        if (txn.payment_mode === 'cash') {
          empData.debitsCash += amount
        }
      }

      empData.transactionCount++
      empData.transactions.push(txn)
    })

    const employeeSummaries = Array.from(employeeMap.values()).map(emp => {
      const settlement = settlementByEmployee.get(emp.employeeId) ?? null
      return {
        ...emp,
        netBalance: emp.totalCredits - emp.totalDebits,
        // Only cash leaves the drawer.
        cashExpected: emp.creditsCash - emp.debitsCash,
        isSettled: settlement !== null,
        settlement
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        settlementDate: date,
        dayClosed: closure !== null,
        closure,
        employeeSummaries
      }
    })
  } catch (error: any) {
    console.error('Get employee shift summary error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
