'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Users,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Trash2,
  Edit2,
  Plus,
  ChevronRight,
  Download,
} from 'lucide-react'
import { SettleDoctorFeesModal } from '@/components/finances/settle-doctor-fees-modal'
import { SettleReferralCommissionModal } from '@/components/finances/settle-referral-commission-modal'
import { GeneralExpenseModal } from '@/components/finances/general-expense-modal'
import { Modal } from '@/components/ui/modal'
import {
  generateSalaryPDF,
  generateExpensesPDF,
  generateLedgerExpensesPDF,
  generateReferralPDF,
  generateIncomePDF,
  generateMonthlyFinancePDF,
  generateExpenseBreakdownPDF,
} from '@/lib/pdf/finance-pdf'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { expenseTypeLabel } from '@/lib/format/expense'
import { istMonth } from '@/lib/dates/ist'

/**
 * The Overview is cash-basis now (PRD v2 CR-10, Q-36): money that actually
 * moved this month. Charges never appear — they are internal (CR-15) — and a
 * doctor fee or commission counts when it is paid, not when it is priced.
 */
interface FinancialSummary {
  month_year: string
  income: {
    total_paid: number
    /** Regular, advance, discharge, misc — registration and lab are apart (round 8). */
    payments: number
    registration: number
    lab: number
    opd_receipts: number
    money_in: number
  }
  expenses: {
    general_expenses: number
    petty_cash: number
    salary_expenses: number
    ledger_expenses: number
    referral_commissions: number
    doctor_fees: number
    /** Medicine charges — always the hospital's expense, worked out from them. */
    medicine: number
    total_expenses: number
  }
  profit: {
    net_profit: number
    is_profit: boolean
    profit_margin: number
  }
  pending_settlements: {
    doctor_fees: number
    doctor_count: number
    referral_commissions: number
    referral_count: number
    total: number
    rows: Array<{
      kind: 'doctor_fee' | 'referral_commission'
      id: string
      amount: number
      who: string
      patient?: { id: string; patient_id: string; name: string } | null
    }>
  }
}

export default function FinancesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(
    istMonth()
  )
  const [activeTab, setActiveTab] = useState<'overview' | 'settlements' | 'expenses'>(
    'overview'
  )
  const [doctorFeesModalOpen, setDoctorFeesModalOpen] = useState(false)
  // The Medicine line opens the charges behind it, for the month shown.
  const [medicineOpen, setMedicineOpen] = useState(false)
  const [medicineRows, setMedicineRows] = useState<any[] | null>(null)
  const [referralModalOpen, setReferralModalOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expenses, setExpenses] = useState<any[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any | null>(null)


  useEffect(() => {
    fetchSummary()
    if (activeTab === 'expenses') {
      fetchExpenses()
    }
  }, [selectedMonth, activeTab])

  useRealtimeRefetch(
    ['expenses', 'doctor_visit_settlements', 'referrals', 'salary_payments', 'patient_billing', 'patient_charges'],
    () => {
      fetchSummary()
      if (activeTab === 'expenses') fetchExpenses()
    }
  )

  const fetchSummary = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/finances/summary?month_year=${selectedMonth}`)
      const result = await response.json()

      if (result.success) {
        setSummary(result.data)
      }
    } catch (error) {
      console.error('Error fetching financial summary:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * The charges behind the Medicine line, for the month on screen. Loaded
   * on demand rather than with the summary: it is a list of patients, which the
   * Overview does not need until someone asks what the figure is made of.
   */
  const loadMedicine = async () => {
    setMedicineRows(null)
    try {
      const response = await fetch(`/api/finances/medicine?month=${selectedMonth}`)
      const result = await response.json()
      setMedicineRows(response.ok ? result.rows ?? [] : [])
    } catch (error) {
      console.error('Error fetching the lab & medicine breakdown:', error)
      setMedicineRows([])
    }
  }

  const fetchExpenses = async () => {
    try {
      setExpensesLoading(true)
      const response = await fetch(`/api/finances/expenses?month_year=${selectedMonth}`)
      const result = await response.json()

      if (result.success) {
        setExpenses(result.data)
      }
    } catch (error) {
      console.error('Error fetching expenses:', error)
    } finally {
      setExpensesLoading(false)
    }
  }

  const handleDeleteExpense = async (id: number) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      try {
        const response = await fetch(`/api/finances/expenses?id=${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const result = await response.json()
        if (result.success) {
          fetchExpenses()
          fetchSummary()
        } else {
          alert(result.error || 'Failed to delete expense')
        }
      } catch (error) {
        console.error('Error deleting expense:', error)
        alert('Failed to delete expense')
      }
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getMonthOptions = () => {
    const options = []
    const today = new Date()

    for (let i = 0; i < 12; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)

      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")

      const value = `${year}-${month}`

      const label = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })

      options.push({ value, label })
    }

    return options
  }

  if (loading && !summary) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="animate-spin h-8 w-8 text-primary" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Finances</h1>
            <p className="text-muted mt-1">Financial overview and management</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 min-h-[44px] bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {getMonthOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              onClick={fetchSummary}
              disabled={loading}
              className={`px-4 py-2 ${loading ? 'bg-surface-inset cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'} text-foreground rounded-lg flex items-center justify-center gap-2 transition-colors`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{loading ? 'Loading...' : 'Refresh'}</span>
            </button>

            {summary && (
              <button
                onClick={async () => {
                  try { await generateMonthlyFinancePDF(selectedMonth, summary) }
                  catch { alert('Failed to generate PDF') }
                }}
                className="px-4 py-2 bg-info hover:bg-info-hover text-foreground rounded-lg flex items-center justify-center gap-2 transition-colors"
                title="Download Monthly Finance Report"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Monthly PDF</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-border -mx-3 px-3 sm:mx-0 sm:px-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 min-h-[44px] font-medium whitespace-nowrap transition-colors ${activeTab === 'overview'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-foreground'
              }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-3 min-h-[44px] font-medium whitespace-nowrap transition-colors ${activeTab === 'settlements'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-foreground'
              }`}
          >
            Settlements
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-3 min-h-[44px] font-medium whitespace-nowrap transition-colors ${activeTab === 'expenses'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted hover:text-foreground'
              }`}
          >
            Expenses
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && summary && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Total Revenue */}
              <Card className="bg-gradient-to-br from-success-subtle to-success-subtle/50 border-success/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-success-text" />
                    Money in
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {formatCurrency(summary.income.money_in)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">
                    patient payments and OPD receipts
                  </p>
                </CardContent>
              </Card>

              {/* Total Expenses */}
              <Card className="bg-gradient-to-br from-destructive-subtle to-destructive-subtle/50 border-destructive/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-destructive" />
                    Total Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {formatCurrency(summary.expenses.total_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">
                    Salaries + General + Ledger + Doctor + Referral
                  </p>
                </CardContent>
              </Card>

              {/* Net Profit */}
              <Card
                className={`bg-gradient-to-br ${summary.profit.is_profit
                    ? 'from-info-subtle to-info-subtle/50 border-info/20'
                    : 'from-warning-subtle to-warning-subtle/50 border-warning/20'
                  }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted flex items-center gap-2">
                    {summary.profit.is_profit ? (
                      <TrendingUp className="h-4 w-4 text-info" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-warning-text" />
                    )}
                    Net {summary.profit.is_profit ? 'Profit' : 'Loss'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-2xl sm:text-3xl font-bold ${summary.profit.is_profit ? 'text-info' : 'text-warning-text'
                      }`}
                  >
                    {formatCurrency(Math.abs(summary.profit.net_profit))}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">
                    {summary.profit.profit_margin.toFixed(1)}% margin
                  </p>
                </CardContent>
              </Card>

            </div>

            {/* Income & Expense Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Income Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-success-text" />
                      Income Breakdown
                    </span>
                    <button
                      onClick={async () => {
                        try { await generateIncomePDF(selectedMonth, summary) }
                        catch { alert('Failed to generate PDF') }
                      }}
                      className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
                      title="Download Income Report"
                    >
                      <Download className="h-4 w-4 text-muted hover:text-foreground" />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Payments + registration + lab, each its own line (round 8) —
                      the same split as the patient's Overview. */}
                  {([
                    ['Patient payments', summary.income.payments],
                    ['Registration fees', summary.income.registration],
                    ['Lab tests', summary.income.lab],
                  ] as const).map(([label, amount]) => (
                    <div key={label} className="flex justify-between items-center pb-2 border-b border-border">
                      <span className="text-muted">{label}</span>
                      <span className="font-semibold text-success-text">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pb-2 border-b border-border">
                    <span className="text-muted">OPD receipts</span>
                    <span className="font-semibold text-success-text">
                      {formatCurrency(summary.income.opd_receipts)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-foreground">Money in</span>
                    <span className="font-bold text-xl text-success-text">
                      {formatCurrency(summary.income.money_in)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Expense Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-destructive" />
                      Expense Breakdown
                    </span>
                    <button
                      onClick={async () => {
                        try { await generateExpenseBreakdownPDF(selectedMonth, summary) }
                        catch { alert('Failed to generate PDF') }
                      }}
                      className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
                      title="Download Expense Breakdown PDF"
                    >
                      <Download className="h-4 w-4 text-muted hover:text-foreground" />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {/* Salary Payments — navigate to salary page */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <button
                      onClick={() => router.push(`/employees/salary?month=${selectedMonth}`)}
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        Salary Payments
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.salary_expenses)}
                      </span>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try { await generateSalaryPDF(selectedMonth) }
                        catch { alert('Failed to generate PDF') }
                      }}
                      className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-inset transition-all"
                      title="Download Salary PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-muted" />
                    </button>
                  </div>

                  {/* General Expenses — switch to Expenses tab */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <button
                      onClick={() => setActiveTab('expenses')}
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        General Expenses
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.general_expenses)}
                      </span>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try { await generateExpensesPDF(selectedMonth) }
                        catch { alert('Failed to generate PDF') }
                      }}
                      className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-inset transition-all"
                      title="Download Expenses PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-muted" />
                    </button>
                  </div>

                  {/* Petty cash — what the desk spent, as one line (Q-69 = A) */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <Link
                      href="/petty-cash"
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        Petty cash spent
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.petty_cash)}
                      </span>
                    </Link>
                  </div>

                  {/* Ledger Expenses — the log itself, filtered to expense debits (CR-08) */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <Link
                      href="/ledger/summary?direction=debit&source=expense"
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        Ledger Expenses
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.ledger_expenses)}
                      </span>
                    </Link>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try { await generateLedgerExpensesPDF(selectedMonth) }
                        catch { alert('Failed to generate PDF') }
                      }}
                      className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-inset transition-all"
                      title="Download Ledger Expenses PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-muted" />
                    </button>
                  </div>

                  {/* Referral Commissions */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <button
                      onClick={() => setActiveTab('settlements')}
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        Referral Commissions
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.referral_commissions)}
                      </span>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try { await generateReferralPDF(selectedMonth) }
                        catch { alert('Failed to generate PDF') }
                      }}
                      className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-inset transition-all"
                      title="Download Referral Commissions PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-muted" />
                    </button>
                  </div>

                  {/* Doctor Fees */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <button
                      onClick={() => setActiveTab('settlements')}
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        Doctor Fees
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.doctor_fees)}
                      </span>
                    </button>
                  </div>

                  {/* Medicine the hospital carries for its patients (round 8).
                      Worked out from the medicine charges, so the drill-down is
                      the same query, not a second copy. */}
                  <div className="flex items-center py-2 px-2 border-b border-border hover:bg-surface-hover rounded-lg transition-colors group">
                    <button
                      onClick={() => {
                        setMedicineOpen(true)
                        void loadMedicine()
                      }}
                      className="flex-1 flex justify-between items-center cursor-pointer"
                    >
                      <span className="text-muted group-hover:text-foreground flex items-center gap-1 transition-colors">
                        Medicine (on patients&apos; behalf)
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.expenses.medicine)}
                      </span>
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-2 px-2">
                    <span className="font-semibold text-foreground">Total Expenses</span>
                    <span className="font-bold text-xl text-destructive">
                      {formatCurrency(summary.expenses.total_expenses)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

          </>
        )}

        {/* Settlements Tab */}
        {activeTab === 'settlements' && summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Doctor Settlements */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-info" />
                    Doctor Settlements
                  </span>
                  {summary.pending_settlements.doctor_count > 0 && (
                    <span className="px-2 py-1 text-xs bg-primary text-foreground rounded-full">
                      {summary.pending_settlements.doctor_count} pending
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-sm text-muted mb-1">Total Unsettled Amount</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(summary.pending_settlements.doctor_fees)}
                  </p>
                </div>
                <button
                  onClick={() => setDoctorFeesModalOpen(true)}
                  className="w-full px-4 py-2 bg-info hover:bg-info-hover text-foreground rounded-lg transition-colors"
                >
                  View & Settle Doctor Fees
                </button>
              </CardContent>
            </Card>

            {/* Referral Commissions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-accent" />
                    Referral Commissions
                  </span>
                  {summary.pending_settlements.referral_count > 0 && (
                    <span className="px-2 py-1 text-xs bg-primary text-foreground rounded-full">
                      {summary.pending_settlements.referral_count} pending
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-sm text-muted mb-1">Total Unsettled Amount</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(summary.pending_settlements.referral_commissions)}
                  </p>
                </div>
                <button
                  onClick={() => setReferralModalOpen(true)}
                  className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-foreground rounded-lg transition-colors"
                >
                  View & Settle Commissions
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* The Transactions tab and the Day Close tab are gone (PRD v2 CR-08).
            Every entry now lives in one log, the Ledger, where closing is per
            row rather than per day. */}
        {/* Expenses Tab */}
        {activeTab === 'expenses' && summary && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              <Card className="bg-gradient-to-br from-destructive-subtle to-destructive-subtle/50 border-destructive/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted">Salary Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-destructive">
                    {formatCurrency(summary.expenses.salary_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">Employee costs</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-warning-subtle to-warning-subtle/50 border-warning/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted">General Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-warning-text">
                    {formatCurrency(summary.expenses.general_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">{expenses.length} transactions</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-info-subtle to-info-subtle/50 border-info/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted">Ledger Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-info">
                    {formatCurrency(summary.expenses.ledger_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">Daily ledger transaction debits</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-accent-subtle to-accent-subtle/50 border-accent/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted">Total Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {formatCurrency(summary.expenses.total_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-muted mt-1">
                    {summary.expenses.total_expenses > 0
                      ? `${((summary.expenses.salary_expenses / summary.expenses.total_expenses) * 100).toFixed(0)}% salary`
                      : '0%'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Expenses Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary" />
                    Hospital Expenses - {new Date(`${selectedMonth}-01`).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </CardTitle>
                  <Button
                    onClick={() => setShowAddForm(true)}
                    className="bg-primary hover:bg-primary-hover"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {expensesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="animate-spin h-8 w-8 text-primary" />
                  </div>
                ) : expenses.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 text-muted font-medium">Expense Type</th>
                          <th className="text-left py-3 px-4 text-muted font-medium">Date</th>
                          <th className="text-right py-3 px-4 text-muted font-medium">Amount</th>
                          <th className="text-left py-3 px-4 text-muted font-medium hidden md:table-cell">Mode</th>
                          <th className="text-left py-3 px-4 text-muted font-medium hidden sm:table-cell">Remarks</th>
                          <th className="text-left py-3 px-4 text-muted font-medium hidden md:table-cell">Added by</th>
                          <th className="text-center py-3 px-4 text-muted font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id} className="border-b border-border">
                            {/* No `capitalize` — it would title-case the detail into "Misc - (Broken Window Pane)". */}
                            <td className="py-3 px-4 text-foreground">
                              {expenseTypeLabel(expense.expense_type, expense.expense_type_detail)}
                            </td>
                            <td className="py-3 px-4 text-muted">
                              {new Date(expense.expense_date).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="py-3 px-4 text-right text-primary font-semibold">
                              {formatCurrency(expense.amount)}
                            </td>
                            <td className="py-3 px-4 text-muted hidden md:table-cell text-sm capitalize">
                              {(expense.payment_mode || 'cash').replace('_', ' ')}
                            </td>
                            <td className="py-3 px-4 text-muted hidden sm:table-cell text-sm">
                              {expense.remarks || '-'}
                            </td>
                            <td className="py-3 px-4 text-muted hidden md:table-cell text-sm">
                              {expense.created_by_user?.username || '—'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingExpense(expense)
                                    setShowAddForm(true)
                                  }}
                                  className="text-info hover:text-info p-1"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="text-destructive hover:text-destructive p-1"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted">
                    No general expenses recorded for this month
                  </div>
                )}
              </CardContent>
            </Card>

            {/*
              Priced but not yet paid (Q-81 b). These are the hospital's
              left-offs: they are listed here so nothing is forgotten, and they
              are deliberately absent from Money out, because no money has left.
            */}
            {summary.pending_settlements.rows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Still to pay</span>
                    <span className="text-base font-semibold text-warning-text">
                      {formatCurrency(summary.pending_settlements.total)}
                    </span>
                  </CardTitle>
                  <p className="text-sm text-muted">
                    Doctor fees and referral commissions already priced. They are not counted in
                    money out until they are paid.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {summary.pending_settlements.rows.map((row) => (
                      <div
                        key={`${row.kind}-${row.id}`}
                        className="flex items-center justify-between py-2 gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-foreground truncate">
                            {row.kind === 'doctor_fee' ? row.who : 'Referral commission'}
                          </p>
                          {row.patient && (
                            <Link
                              href={`/patients/${row.patient.id}`}
                              className="text-xs text-muted hover:text-primary"
                            >
                              {row.patient.patient_id} {row.patient.name}
                            </Link>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-warning-subtle text-warning-text border border-warning/30">
                            Pending
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatCurrency(row.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {doctorFeesModalOpen && (
        <SettleDoctorFeesModal
          isOpen={doctorFeesModalOpen}
          onClose={() => {
            setDoctorFeesModalOpen(false)
            fetchSummary()
          }}
        />
      )}

      {medicineOpen && (
        <Modal
          isOpen={medicineOpen}
          onClose={() => setMedicineOpen(false)}
          size="lg"
          title="Medicine"
          description={`Medicine charged to patients in ${selectedMonth}. The patient's payments cover it and the pharmacy bills us, so each is one of the hospital's expenses.`}
        >
          {medicineRows === null ? (
            <p className="text-sm text-muted py-6 text-center">Loading…</p>
          ) : medicineRows.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">
              Nothing marked Included this month.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {medicineRows.map((row: any) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    {row.patient ? (
                      <Link
                        href={`/patients/${row.patient.id}`}
                        className="text-info hover:underline font-medium"
                      >
                        {row.patient.patient_id} {row.patient.name}
                      </Link>
                    ) : (
                      <span className="text-muted">Unknown patient</span>
                    )}
                    <span className="block text-xs text-muted">
                      {row.description} · {row.charge_date}
                    </span>
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(row.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-3 text-sm">
                <span className="font-semibold text-foreground">
                  Total — {medicineRows.length} charge{medicineRows.length === 1 ? '' : 's'}
                </span>
                <span className="font-bold text-foreground">
                  {formatCurrency(medicineRows.reduce((t: number, r: any) => t + Number(r.amount || 0), 0))}
                </span>
              </div>
            </div>
          )}
        </Modal>
      )}

      {referralModalOpen && (
        <SettleReferralCommissionModal
          isOpen={referralModalOpen}
          onClose={() => {
            setReferralModalOpen(false)
            fetchSummary()
          }}
        />
      )}

      {/* {expenseModalOpen && (
        <GeneralExpenseModal
          isOpen={expenseModalOpen}
          onClose={() => {
            setExpenseModalOpen(false)
            fetchSummary()
          }}
          monthYear={selectedMonth}
        />
      )} */}

      {showAddForm && (
        <GeneralExpenseModal
          isOpen={showAddForm}
          onClose={() => {
            setShowAddForm(false)
            setEditingExpense(null)
            fetchSummary()
            fetchExpenses()
          }}
          monthYear={selectedMonth}
          initialExpense={editingExpense}
        />
      )}

    </DashboardLayout>
  )
}
