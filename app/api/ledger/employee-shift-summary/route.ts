import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
          isClosed: false,
          transactions: []
        })
      }

      const empData = employeeMap.get(employeeId)
      
      if (txn.transaction_type === 'credit') {
        empData.totalCredits += parseFloat(txn.amount)
        empData.creditCount++
      } else if (txn.transaction_type === 'debit') {
        empData.totalDebits += parseFloat(txn.amount)
        empData.debitCount++
      }

      empData.transactionCount++
      empData.transactions.push(txn)

      if (txn.status === 'day_closed') {
        empData.isClosed = true
      }
    })

    // Calculate net balance for each employee
    const employeeSummaries = Array.from(employeeMap.values()).map(emp => ({
      ...emp,
      netBalance: emp.totalCredits - emp.totalDebits
    }))

    return NextResponse.json({ 
      success: true, 
      data: {
        settlementDate: date,
        employeeSummaries
      }
    })
  } catch (error: any) {
    console.error('Get employee shift summary error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
