import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { normaliseLedgerCategoryDetail, validateLedgerExpenseCategory } from '@/lib/finances/validate'

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

    return NextResponse.json({ success: true, data })
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
    const {
      transaction_date,
      transaction_type,
      source,
      amount,
      payment_mode,
      reference_number,
      patient_id,
      description,
      notes,
      expense_category,
      expense_category_detail
    } = body

    // Validation
    console.log('Received transaction data:', body)
    console.log(amount, typeof amount)
    if (!transaction_date || !transaction_type || !source || !amount || !payment_mode || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    if (!['credit', 'debit'].includes(transaction_type)) {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
    }

    if (!['patient', 'opd', 'expense'].includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(payment_mode)) {
      return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 })
    }

    if (payment_mode === 'upi' && (!reference_number || reference_number.trim() === '')) {
      return NextResponse.json({ error: 'Reference number required for UPI payments' }, { status: 400 })
    }

    // Only an expense row carries a category. Forcing the pair to null on every
    // other source is what stops a credit or an OPD collection from drifting
    // into holding one, which would make the column mean two different things.
    let expenseCategory: string | null = null
    let expenseCategoryDetail: string | null = null

    if (source === 'expense') {
      const categoryError = validateLedgerExpenseCategory(expense_category)
      if (categoryError) {
        return NextResponse.json({ error: categoryError }, { status: 400 })
      }

      const detail = normaliseLedgerCategoryDetail(expense_category, expense_category_detail)
      if ('error' in detail) {
        return NextResponse.json({ error: detail.error }, { status: 400 })
      }

      expenseCategory = expense_category
      expenseCategoryDetail = detail.value
    }

    const supabase = await createClient()

    // Check if day is already closed
    const { data: existingTransactions } = await supabase
      .from('daily_ledger_transactions')
      .select('status')
      .eq('transaction_date', transaction_date)
      .eq('status', 'day_closed')
      .limit(1)

    if (existingTransactions && existingTransactions.length > 0) {
      return NextResponse.json({ 
        error: `Cannot create transaction for ${transaction_date}. The day has been closed.` 
      }, { status: 400 })
    }

    // Create transaction
    const { data, error } = await supabase
      .from('daily_ledger_transactions')
      .insert([{
        transaction_date,
        transaction_type,
        source,
        amount: parseFloat(amount),
        payment_mode,
        reference_number: reference_number || null,
        patient_id: patient_id || null,
        description,
        notes: notes || null,
        expense_category: expenseCategory,
        expense_category_detail: expenseCategoryDetail,
        created_by: payload.userId,
        status: 'pending'
      }])
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        patient:patients(id, name)
      `)
      .single()

    if (error) {
      console.error('Create transaction error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction created successfully',
      data 
    }, { status: 201 })
  } catch (error: any) {
    console.error('Create transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
