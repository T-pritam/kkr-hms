/**
 * GET /api/finances/summary?month_year=YYYY-MM — the Overview (PRD v2, CR-10).
 *
 * The figures and the reasoning behind them live in lib/finances/overview.ts:
 * money that actually moved in the month, on a cash basis (Q-36). This route is
 * the guard, the month, and the shape the screen reads.
 *
 * The response keeps the old key names where they still mean the same thing, so
 * the Finances page and the PDF did not need rewriting around it. What is gone
 * is gone on purpose: `total_charges` (charges are internal, CR-15),
 * `pending_receivables` (nothing is owed, Q-32 = A) and `recent_transactions`
 * (the ledger is its own screen now, CR-08).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { financeOverview } from '@/lib/finances/overview'
import { istMonth } from '@/lib/dates/ist'

export async function GET(request: NextRequest) {
  try {
    // The Overview is revenue and profit, which reception does not see (Q-05).
    const auth = await requireBilling(request, 'finance:read')
    if (auth.response) return auth.response

    const monthYear = request.nextUrl.searchParams.get('month_year') || istMonth()

    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'month_year must look like 2026-09' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const overview = await financeOverview(supabase, monthYear)

    return NextResponse.json({
      success: true,
      data: {
        month_year: overview.month_year,

        // What came in. `total_paid` is every patient payment, whatever its
        // label; OPD receipts are counted beside it, which they never were.
        income: {
          total_paid: overview.money_in.patient_payments,
          opd_receipts: overview.money_in.opd_receipts,
          money_in: overview.money_in.total,
        },

        // What went out — and only what actually went out. Doctor fees and
        // commissions are counted when they are paid, not when they are priced,
        // which is what used to make profit a comparison of two different bases.
        expenses: {
          general_expenses: overview.money_out.general_expenses,
          petty_cash: overview.money_out.petty_cash,
          salary_expenses: overview.money_out.salary,
          doctor_fees: overview.money_out.doctor_fees_paid,
          referral_commissions: overview.money_out.referral_commissions_paid,
          ledger_expenses: overview.money_out.legacy_ledger_expenses,
          total_expenses: overview.money_out.total,
        },

        profit: {
          net_profit: overview.profit.amount,
          is_profit: overview.profit.is_profit,
          profit_margin: overview.profit.margin,
        },

        // Priced, not yet paid (Q-81 b). Shown as Pending; never in money out.
        pending_settlements: {
          doctor_fees: overview.pending.doctor_fees,
          doctor_count: overview.pending.doctor_count,
          referral_commissions: overview.pending.referral_commissions,
          referral_count: overview.pending.referral_count,
          total: overview.pending.total,
          rows: overview.pending.rows,
        },
      },
    })
  } catch (error: any) {
    console.error('Error fetching financial summary:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch financial summary' },
      { status: 500 },
    )
  }
}
