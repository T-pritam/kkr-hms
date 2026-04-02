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

/**
 * GET /api/finances/summary
 * Query params: month_year (YYYY-MM format, defaults to current month)
 * Returns comprehensive financial summary for the specified month
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
    const monthYear =
      searchParams.get('month_year') ||
      new Date().toISOString().slice(0, 7)

    const supabase = await createClient()

    // Calculate date range for the month
    const [year, month] = monthYear.split('-').map(Number)
    const startDate = `${monthYear}-01`
    const endDate = `${monthYear}-${new Date(year, month, 0).getDate()}`

    // ===== INCOME: Aggregate by transaction dates =====

    // Revenue from installment payments in this month (by payment_date)
    const { data: monthInstallments } = await supabase
      .from('patient_billing_installments')
      .select('amount, payment_date, patient_billing_id')
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)

    const totalPaid =
      monthInstallments?.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) || 0

    // Get unique billing IDs that had transactions this month
    const activeBillingIds = new Set(
      monthInstallments?.map((i) => i.patient_billing_id).filter(Boolean) || []
    )

    // Charges incurred in this month (by charge_date)
    const { data: monthCharges } = await supabase
      .from('patient_charges')
      .select('amount, qty, charge_date')
      .gte('charge_date', startDate)
      .lte('charge_date', endDate)

    const totalCharges =
      monthCharges?.reduce((sum, c) => sum + (Number(c.amount) * (Number(c.qty) || 1)), 0) || 0

    // Commission from billings that belong to this month (by month_year)
    const { data: patientBilling } = await supabase
      .from('patient_billing')
      .select('referral_commission_amount, total_charges, patient_paid_amount, referral_commission_included_in_package, total_doctor_fees, doctor_fees_included_in_package')
      .eq('month_year', monthYear)

    const totalCommission =
      patientBilling?.reduce(
        (sum, b) => {
          if (b.referral_commission_included_in_package) return sum
          return sum + (Number(b.referral_commission_amount) || 0)
        },
        0
      ) || 0

    const totalDoctorFees =
      patientBilling?.reduce(
        (sum, b) => {
          if (b.doctor_fees_included_in_package) return sum
          return sum + (Number(b.total_doctor_fees) || 0)
        },
        0
      ) || 0

    // Pending receivables: total_charges from all billings in this month minus what's been paid
    const totalBillingCharges =
      patientBilling?.reduce((sum, b) => sum + (Number(b.total_charges) || 0), 0) || 0
    const totalBillingPaid =
      patientBilling?.reduce((sum, b) => sum + (Number(b.patient_paid_amount) || 0), 0) || 0
    const pendingReceivables = totalBillingCharges - totalBillingPaid

    // Billing count: billings from this month + those with transactions this month
    const billingCount = new Set([
      ...(patientBilling ? Array.from({ length: patientBilling.length }, (_, i) => i) : []),
      ...activeBillingIds,
    ]).size || patientBilling?.length || 0

    // ===== EXPENSES =====

    // General expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('month_year', monthYear)

    const totalExpense =
      expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0

    // Salaries
    const { data: salaries } = await supabase
      .from('salary_payments')
      .select('*')
      .eq('month_year', monthYear)

    const totalSalary =
      salaries?.reduce((sum, s) => {
        if (s.status === 'settled') {
          return sum + (Number(s.calculated_salary) || 0)
        } else {
          return sum + (Number(s.total_advance) || 0)
        }
      }, 0) || 0

    // Ledger debit expenses
    const { data: ledgerExpenses } = await supabase
      .from('daily_ledger_transactions')
      .select('*')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .eq('transaction_type', 'debit')
      .eq('source', 'expense')

    const ledgerExpenseTotal =
      ledgerExpenses?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0

    // ===== TOTALS: Commission & doctor fees are expenses =====
    const totalExpenses = totalExpense + totalSalary + ledgerExpenseTotal + totalCommission + totalDoctorFees
    const netIncome = totalPaid
    const netProfit = netIncome - totalExpenses

    // ===== PENDING SETTLEMENTS (global, not month-filtered) =====
    const { data: unsettledDoctorVisits } = await supabase
      .from('doctor_visit_settlements')
      .select('*, doctor:doctors(*), patient:patients(*)')
      .eq('settled', false)
      .is('deleted_at', null)

    const totalUnsettledDoctorFees =
      unsettledDoctorVisits?.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0) || 0

    const { data: unsettledReferrals } = await supabase
      .from('patient_billing')
      .select('*, patient:patients(*)')
      .eq('referral_settled', false)
      .gt('referral_commission_amount', 0)

    const totalUnsettledCommissions =
      unsettledReferrals?.reduce(
        (sum, r) => sum + (Number(r.referral_commission_amount) || 0),
        0
      ) || 0

    // ===== TRANSACTIONS for the month =====
    const { data: recentTransactions } = await supabase
      .from('daily_ledger_transactions')
      .select(`
        id,
        transaction_date,
        transaction_type,
        source,
        amount,
        payment_mode,
        description,
        status,
        reference_number,
        patient_id,
        users!created_by(id, username),
        created_at,
        patient:patients(id, name, patient_id)
      `)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    // Payment mode breakdown
    const { data: allTransactions } = await supabase
      .from('daily_ledger_transactions')
      .select('payment_mode, amount, transaction_type')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)

    const paymentModeBreakdown = allTransactions?.reduce(
      (acc: any, t: any) => {
        const mode = t.payment_mode || 'other'
        if (!acc[mode]) acc[mode] = { credit: 0, debit: 0 }
        if (t.transaction_type === 'credit') {
          acc[mode].credit += Number(t.amount) || 0
        } else {
          acc[mode].debit += Number(t.amount) || 0
        }
        return acc
      },
      {}
    )

    return NextResponse.json({
      success: true,
      data: {
        month_year: monthYear,
        income: {
          total_charges: totalCharges,
          total_paid: totalPaid,
          total_commission: totalCommission,
          pending_receivables: pendingReceivables,
          net_income: netIncome,
          billing_count: patientBilling?.length || 0,
        },
        expenses: {
          general_expenses: totalExpense,
          salary_expenses: totalSalary,
          ledger_expenses: ledgerExpenseTotal,
          referral_commissions: totalCommission,
          doctor_fees: totalDoctorFees,
          total_expenses: totalExpenses,
        },
        profit: {
          net_profit: netProfit,
          is_profit: netProfit >= 0,
          profit_margin: netIncome > 0 ? (netProfit / netIncome) * 100 : 0,
        },
        pending_settlements: {
          doctor_fees: totalUnsettledDoctorFees,
          doctor_count: unsettledDoctorVisits?.length || 0,
          referral_commissions: totalUnsettledCommissions,
          referral_count: unsettledReferrals?.length || 0,
        },
        recent_transactions: recentTransactions || [],
      },
    })
  } catch (error: any) {
    console.error('Error fetching financial summary:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch financial summary',
      },
      { status: 500 }
    )
  }
}
