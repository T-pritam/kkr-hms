import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  verifyToken,
  getAccessToken,
  getRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} from '@/lib/auth/jwt'

// Helper function for token refresh
async function refreshTokenIfNeeded() {
  let accessToken = await getAccessToken()
  if (!accessToken) {
    const refreshToken = await getRefreshToken()
    if (!refreshToken) {
      return null
    }

    const refreshPayload = await verifyToken(refreshToken)
    if (!refreshPayload) {
      return null
    }

    accessToken = await generateAccessToken({
      userId: refreshPayload.userId,
      email: refreshPayload.email,
      role: refreshPayload.role,
    })

    const newRefreshToken = await generateRefreshToken({
      userId: refreshPayload.userId,
      email: refreshPayload.email,
      role: refreshPayload.role,
    })

    await setAuthCookies(accessToken, newRefreshToken)
  }

  const payload = await verifyToken(accessToken)
  if (!payload) {
    return null
  }

  return payload
}

/**
 * GET /api/finances/expenses
 * Query params: month_year (optional, YYYY-MM format)
 * Returns list of general expenses for the specified month
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await refreshTokenIfNeeded()
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin and Doctor only
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json(
        { error: 'Forbidden. Admin or Doctor access required.' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const monthYear = searchParams.get('month_year') || new Date().toISOString().slice(0, 7)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('month_year', monthYear)
      .order('expense_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error: any) {
    console.error('Error fetching expenses:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch expenses' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/finances/expenses
 * Creates a new general expense entry
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await refreshTokenIfNeeded()
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (payload.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { expense_type, amount, expense_date, remarks } = body

    if (!expense_type || !amount || !expense_date) {
      return NextResponse.json(
        { error: 'Missing required fields: expense_type, amount, expense_date' },
        { status: 400 }
      )
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      )
    }

    const month_year = expense_date.slice(0, 7)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('expenses')
      .insert([
        {
          expense_type,
          amount: parseFloat(amount),
          expense_date,
          month_year,
          remarks: remarks || null,
        },
      ])
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data?.[0],
    })
  } catch (error: any) {
    console.error('Error creating expense:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create expense' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/finances/expenses
 * Updates an existing expense entry
 */
export async function PUT(request: NextRequest) {
  try {
    const payload = await refreshTokenIfNeeded()
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (payload.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, expense_type, amount, expense_date, remarks } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing expense id' }, { status: 400 })
    }

    if (!expense_type || !amount || !expense_date) {
      return NextResponse.json(
        { error: 'Missing required fields: expense_type, amount, expense_date' },
        { status: 400 }
      )
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      )
    }

    const month_year = expense_date.slice(0, 7)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('expenses')
      .update({
        expense_type,
        amount: parseFloat(amount),
        expense_date,
        month_year,
        remarks: remarks || null,
      })
      .eq('id', id)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data?.[0],
    })
  } catch (error: any) {
    console.error('Error updating expense:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update expense' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/finances/expenses
 * Deletes an expense entry
 */
export async function DELETE(request: NextRequest) {
  try {
    const payload = await refreshTokenIfNeeded()
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (payload.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing expense id' }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase.from('expenses').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Expense deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting expense:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete expense' },
      { status: 500 }
    )
  }
}
