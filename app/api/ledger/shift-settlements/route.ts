import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { recordAudit } from '@/lib/audit/log'

/**
 * Shift settlements — recording that an operator handed their cash over.
 *
 * This replaces POST /api/ledger/close-employee-day, which conflated settling a
 * shift with closing the financial day and did real damage doing it:
 *
 *   * It wrote nothing durable. The only trace of a settlement was every one of
 *     that operator's rows flipping to status = 'day_closed' — and their notes
 *     being overwritten with "Marked as paid", destroying whatever had been
 *     recorded against each entry.
 *   * Because the create guard read that status, one operator settling their
 *     shift locked the whole date for every colleague, permanently.
 *
 * A settlement now writes one row here and touches no transaction at all. The
 * date's lock lives in `daily_ledger_closures` and is the admin's separate,
 * deliberate act.
 */

/** The shared 30-line token preamble every ledger route carries. */
async function authenticate() {
  let accessToken = await getAccessToken()
  if (!accessToken) {
    const refreshToken = await getRefreshToken()
    if (!refreshToken) return null

    const refreshPayload = await verifyToken(refreshToken)
    if (!refreshPayload) return null

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

  return verifyToken(accessToken)
}

/**
 * GET /api/ledger/shift-settlements?date=YYYY-MM-DD
 * Active settlements for a date. Admin and Doctor read the whole day.
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticate()
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const date = request.nextUrl.searchParams.get('date')
    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('daily_ledger_shift_settlements')
      .select(`
        *,
        employee:users!employee_id(id, username),
        settled_by_user:users!settled_by(id, username)
      `)
      .eq('settlement_date', date)
      .eq('status', 'active')

    if (error) {
      console.error('Get shift settlements error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: any) {
    console.error('Get shift settlements error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/ledger/shift-settlements
 * Body: { employee_id, settlement_date, cash_handed_over?, notes? }
 *
 * Deliberately permitted on a date that is already day-closed: it mutates no
 * ledger row and changes no total. Refusing would strand any handover that
 * happens after the day was reconciled, which is a normal thing to happen.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await authenticate()
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const { employee_id, settlement_date, cash_handed_over, notes } = body

    if (!employee_id || !settlement_date) {
      return NextResponse.json(
        { error: 'employee_id and settlement_date are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('daily_ledger_shift_settlements')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('settlement_date', settlement_date)
      .eq('status', 'active')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'This shift has already been settled' },
        { status: 409 }
      )
    }

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
      return NextResponse.json(
        { error: 'No transactions found for this employee on this date' },
        { status: 404 }
      )
    }

    const sum = (predicate: (t: any) => boolean) =>
      transactions.filter(predicate).reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0)

    const credit = (mode: string) =>
      sum((t: any) => t.transaction_type === 'credit' && t.payment_mode === mode)

    const totalCredits = sum((t: any) => t.transaction_type === 'credit')
    const totalDebits = sum((t: any) => t.transaction_type === 'debit')
    const debitsCash = sum((t: any) => t.transaction_type === 'debit' && t.payment_mode === 'cash')
    const creditsCash = credit('cash')

    const { data: settlement, error } = await supabase
      .from('daily_ledger_shift_settlements')
      .insert({
        settlement_date,
        employee_id,
        total_credits: totalCredits,
        total_debits: totalDebits,
        net_balance: totalCredits - totalDebits,
        credits_cash: creditsCash,
        credits_upi: credit('upi'),
        credits_card: credit('card'),
        credits_bank_transfer: credit('bank_transfer'),
        credits_cheque: credit('cheque'),
        debits_cash: debitsCash,
        // Only physical cash is handed over; UPI and card never touch the drawer.
        cash_expected: creditsCash - debitsCash,
        cash_handed_over: cash_handed_over ?? null,
        transaction_count: transactions.length,
        // The note belongs to the settlement, not smeared across every entry.
        notes: notes || null,
        settled_by: payload.userId,
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      // The partial unique index is the backstop for a lost race above.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This shift has already been settled' }, { status: 409 })
      }
      console.error('Create shift settlement error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await recordAudit(supabase, {
      entityType: 'ledger_shift',
      entityId: settlement.id,
      action: 'finalised',
      summary: `Settled the shift for ${settlement_date}`,
      changes: {
        cash_expected: { from: null, to: settlement.cash_expected },
        cash_handed_over: { from: null, to: settlement.cash_handed_over },
        transaction_count: { from: null, to: settlement.transaction_count }
      },
      actor: { id: payload.userId, role: payload.role }
    })

    return NextResponse.json({
      success: true,
      message: 'Shift settled successfully',
      data: settlement
    }, { status: 201 })
  } catch (error: any) {
    console.error('Create shift settlement error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
