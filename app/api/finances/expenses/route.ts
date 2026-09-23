import { NextRequest, NextResponse } from 'next/server'
import { requireBilling } from '@/lib/billing/authz'
import { PAYMENT_MODES } from '@/lib/ledger/transactions'
import { createClient } from '@/lib/supabase/server'
import {
  verifyToken,
  getAccessToken,
  getRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} from '@/lib/auth/jwt'
import { normaliseExpenseDetail, validateExpenseType } from '@/lib/finances/validate'
import { istMonth } from '@/lib/dates/ist'

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
    const auth = await requireBilling(request, 'finance:read')
    if (auth.response) return auth.response

    const searchParams = request.nextUrl.searchParams
    const monthYear = searchParams.get('month_year') || istMonth()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('expenses')
      .select('*, created_by_user:users!created_by(id, username)')
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
    const auth = await requireBilling(request, 'expense:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const { expense_type, amount, expense_date, remarks, expense_type_detail } = body

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

    // Q-39 = A: an expense without a word about what it was for tells nobody
    // anything a month later — the same rule petty cash has.
    if (!String(remarks ?? '').trim()) {
      return NextResponse.json(
        { error: 'Say what this expense was for', fieldErrors: { remarks: 'Required' } },
        { status: 400 }
      )
    }

    const paymentMode = String(body.payment_mode ?? 'cash')
    if (!PAYMENT_MODES.includes(paymentMode as any)) {
      return NextResponse.json(
        { error: 'Choose how this was paid', fieldErrors: { payment_mode: 'Choose a payment mode' } },
        { status: 400 }
      )
    }

    // After the amount check, deliberately: the two run in this order today and
    // the error a caller sees for a bad amount should not change because a
    // second rule was added above it.
    const typeError = validateExpenseType(expense_type)
    if (typeError) {
      return NextResponse.json({ error: typeError }, { status: 400 })
    }

    const detail = normaliseExpenseDetail(expense_type, expense_type_detail)
    if ('error' in detail) {
      return NextResponse.json({ error: detail.error }, { status: 400 })
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
          remarks: remarks.trim(),
          expense_type_detail: detail.value,
          // How the money left, and who recorded it — neither was ever kept
          // on a general expense, though the ledger kept both (CR-07).
          payment_mode: paymentMode,
          created_by: user.id,
          updated_by: user.id,
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
    const auth = await requireBilling(request, 'expense:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const { id, expense_type, amount, expense_date, remarks, expense_type_detail } = body

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

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('expenses')
      .select('expense_type')
      .eq('id', id)
      .single()

    // The allow-list applies to what the user is putting in, not to what is
    // already there. `expense_type` was unconstrained free text for the life of
    // this table, so a live row may hold a value outside the eight; rejecting it
    // here would mean nobody could fix that row's amount without also
    // reclassifying it. Changing the type does have to land on a valid one.
    if (!existing || expense_type !== existing.expense_type) {
      const typeError = validateExpenseType(expense_type)
      if (typeError) {
        return NextResponse.json({ error: typeError }, { status: 400 })
      }
    }

    // The detail is checked either way — including on a legacy Miscellaneous row
    // that has never had one, which is the point: those get filled in the first
    // time anyone touches them.
    const detail = normaliseExpenseDetail(expense_type, expense_type_detail)
    if ('error' in detail) {
      return NextResponse.json({ error: detail.error }, { status: 400 })
    }

    const month_year = expense_date.slice(0, 7)

    const { data, error } = await supabase
      .from('expenses')
      .update({
        expense_type,
        amount: parseFloat(amount),
        expense_date,
        month_year,
        remarks: remarks || null,
        expense_type_detail: detail.value,
        ...(body.payment_mode ? { payment_mode: String(body.payment_mode) } : {}),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
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
    const auth = await requireBilling(request, 'expense:write')
    if (auth.response) return auth.response
    const { user } = auth

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
