import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { createLedgerTransaction } from '@/lib/ledger/transactions'
import { getActiveClosures } from '@/lib/ledger/closure'

/**
 * GET /api/ledger/transactions
 * Query params: start_date, end_date, transaction_type, source, payment_mode, status, created_by, patient_id
 * Returns filtered transactions
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

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const transactionType = searchParams.get('transaction_type')
    const source = searchParams.get('source')
    const paymentMode = searchParams.get('payment_mode')
    const status = searchParams.get('status')
    const createdBy = searchParams.get('created_by')
    const patientId = searchParams.get('patient_id')

    const supabase = await createClient()

    let query = supabase
      .from('daily_ledger_transactions')
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        verified_by_user:users!verified_by(id, username),
        patient:patients(id, name)
      `)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    // Apply filters
    if (startDate) {
      query = query.gte('transaction_date', startDate)
    }
    if (endDate) {
      query = query.lte('transaction_date', endDate)
    }
    if (transactionType) {
      query = query.eq('transaction_type', transactionType)
    }
    if (source) {
      query = query.eq('source', source)
    }
    if (paymentMode) {
      query = query.eq('payment_mode', paymentMode)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (patientId) {
      query = query.eq('patient_id', patientId)
    }

    // Role-based filtering: non-admin users can only see their own transactions
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      query = query.eq('created_by', payload.userId)
    } else if (createdBy) {
      // Admin can filter by created_by
      query = query.eq('created_by', createdBy)
    }

    const { data, error } = await query

    if (error) {
      console.error('Get transactions error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Whether an entry sits inside a closed day is a property of its date, so it
    // cannot be read off the row. One range query decorates the whole result set,
    // which is what lets the Finances table show a lock without a second endpoint.
    const rows = data ?? []
    let decorated = rows
    if (rows.length > 0) {
      const dates = rows.map((r: any) => r.transaction_date).sort()
      const closures = await getActiveClosures(supabase, dates[0], dates[dates.length - 1])
      decorated = rows.map((r: any) => ({ ...r, day_closed: closures.has(r.transaction_date) }))
    }

    return NextResponse.json({ success: true, data: decorated })
  } catch (error: any) {
    console.error('Get transactions error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/ledger/transactions
 * Creates a new transaction
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

    const body = await request.json()

    const supabase = await createClient()

    // Validation, the closed-day guard and the insert all live in lib/ledger, so
    // the settlement routes that also write here are held to the same rules.
    const result = await createLedgerTransaction(supabase, {
      transaction_date: body.transaction_date,
      transaction_type: body.transaction_type,
      source: body.source,
      amount: body.amount,
      payment_mode: body.payment_mode,
      reference_number: body.reference_number,
      patient_id: body.patient_id,
      description: body.description,
      notes: body.notes,
      expense_category: body.expense_category,
      expense_category_detail: body.expense_category_detail,
      created_by: payload.userId,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code, closure: result.closure } : {}) },
        { status: result.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction created successfully',
      data: result.rows[0]
    }, { status: 201 })
  } catch (error: any) {
    console.error('Create transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
