'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Users,
  Calendar,
  CreditCard,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  FileText,
  Trash2,
  Edit2,
  Plus,
} from 'lucide-react'
import { SettleDoctorFeesModal } from '@/components/finances/settle-doctor-fees-modal'
import { SettleReferralCommissionModal } from '@/components/finances/settle-referral-commission-modal'
import { GeneralExpenseModal } from '@/components/finances/general-expense-modal'

interface FinancialSummary {
  month_year: string
  income: {
    total_charges: number
    total_paid: number
    total_commission: number
    pending_receivables: number
    net_income: number
    billing_count: number
  }
  expenses: {
    general_expenses: number
    salary_expenses: number
    ledger_expenses: number
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
  }
  recent_transactions: any[]
  payment_mode_breakdown: any
}

export default function FinancesPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  )
  const [activeTab, setActiveTab] = useState<'overview' | 'settlements' | 'transactions' | 'expenses'>(
    'overview'
  )
  const [doctorFeesModalOpen, setDoctorFeesModalOpen] = useState(false)
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
          <RefreshCw className="animate-spin h-8 w-8 text-orange-600" />
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
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Finances</h1>
            <p className="text-gray-400 mt-1">Financial overview and management</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-600"
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
              className={`px-4 py-2 ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'} text-white rounded-lg flex items-center justify-center gap-2 transition-colors`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{loading ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'overview'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'settlements'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            Settlements
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'transactions'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'expenses'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-400 hover:text-white'
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
              <Card className="bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-green-500" />
                    Total Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {formatCurrency(summary.income.total_paid)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">
                    {summary.income.billing_count} billing records
                  </p>
                </CardContent>
              </Card>

              {/* Total Expenses */}
              <Card className="bg-gradient-to-br from-red-900/20 to-red-800/10 border-red-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    Total Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {formatCurrency(summary.expenses.total_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">
                    Salaries + General + Ledger
                  </p>
                </CardContent>
              </Card>

              {/* Net Profit */}
              <Card
                className={`bg-gradient-to-br ${summary.profit.is_profit
                    ? 'from-blue-900/20 to-blue-800/10 border-blue-800/30'
                    : 'from-yellow-900/20 to-yellow-800/10 border-yellow-800/30'
                  }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    {summary.profit.is_profit ? (
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-yellow-500" />
                    )}
                    Net {summary.profit.is_profit ? 'Profit' : 'Loss'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-2xl sm:text-3xl font-bold ${summary.profit.is_profit ? 'text-blue-400' : 'text-yellow-400'
                      }`}
                  >
                    {formatCurrency(Math.abs(summary.profit.net_profit))}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">
                    {summary.profit.profit_margin.toFixed(1)}% margin
                  </p>
                </CardContent>
              </Card>

              {/* Pending Receivables */}
              <Card className="bg-gradient-to-br from-orange-900/20 to-orange-800/10 border-orange-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    Pending Receivables
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {formatCurrency(summary.income.pending_receivables)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">To be collected</p>
                </CardContent>
              </Card>
            </div>

            {/* Income & Expense Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Income Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-500" />
                    Income Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                    <span className="text-gray-400">Total Charges</span>
                    <span className="font-semibold text-white">
                      {formatCurrency(summary.income.total_charges)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                    <span className="text-gray-400">Amount Received</span>
                    <span className="font-semibold text-green-400">
                      {formatCurrency(summary.income.total_paid)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                    <span className="text-gray-400">Referral Commission</span>
                    <span className="font-semibold text-red-400">
                      - {formatCurrency(summary.income.total_commission)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-white">Net Income</span>
                    <span className="font-bold text-xl text-green-400">
                      {formatCurrency(summary.income.net_income)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Expense Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-red-500" />
                    Expense Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary Stats */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                      <span className="text-gray-400">Salary Payments</span>
                      <span className="font-semibold text-white">
                        {formatCurrency(summary.expenses.salary_expenses)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                      <span className="text-gray-400">General Expenses</span>
                      <span className="font-semibold text-white">
                        {formatCurrency(summary.expenses.general_expenses)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                      <span className="text-gray-400">Ledger Expenses*</span>
                      <span className="font-semibold text-white">
                        {formatCurrency(summary.expenses.ledger_expenses)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="font-semibold text-white">Total Expenses</span>
                      <span className="font-bold text-xl text-red-400">
                        {formatCurrency(summary.expenses.total_expenses)}
                      </span>
                    </div>
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
                    <Users className="h-5 w-5 text-blue-500" />
                    Doctor Settlements
                  </span>
                  {summary.pending_settlements.doctor_count > 0 && (
                    <span className="px-2 py-1 text-xs bg-orange-600 text-white rounded-full">
                      {summary.pending_settlements.doctor_count} pending
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Total Unsettled Amount</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(summary.pending_settlements.doctor_fees)}
                  </p>
                </div>
                <button
                  onClick={() => setDoctorFeesModalOpen(true)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
                    <Receipt className="h-5 w-5 text-purple-500" />
                    Referral Commissions
                  </span>
                  {summary.pending_settlements.referral_count > 0 && (
                    <span className="px-2 py-1 text-xs bg-orange-600 text-white rounded-full">
                      {summary.pending_settlements.referral_count} pending
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Total Unsettled Amount</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(summary.pending_settlements.referral_commissions)}
                  </p>
                </div>
                <button
                  onClick={() => setReferralModalOpen(true)}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  View & Settle Commissions
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && summary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-500" />
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.recent_transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-2 text-gray-400 font-medium">
                          Date
                        </th>
                        <th className="text-left py-3 px-2 text-gray-400 font-medium hidden sm:table-cell">
                          Patient
                        </th>
                        <th className="text-left py-3 px-2 text-gray-400 font-medium hidden md:table-cell">
                          Type
                        </th>
                        <th className="text-left py-3 px-2 text-gray-400 font-medium hidden md:table-cell">
                          Created By
                        </th>
                        <th className="text-left py-3 px-2 text-gray-400 font-medium">
                          Description
                        </th>
                        <th className="text-right py-3 px-2 text-gray-400 font-medium">
                          Amount
                        </th>
                        <th className="text-center py-3 px-2 text-gray-400 font-medium hidden md:table-cell">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_transactions.map((txn: any) => (
                        <tr key={txn.id} className="border-b border-gray-800/50">
                          <td className="py-3 px-2 text-sm text-white">
                            {new Date(txn.transaction_date).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-2 text-sm hidden sm:table-cell">
                            <span className="text-gray-300">
                              {txn.patient?.name ? (
                                <span className="font-medium">{txn.patient.name}</span>
                              ) : (
                                <span className="text-gray-500 italic">---</span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-sm hidden md:table-cell">
                            <span
                              className={`px-2 py-1 rounded text-xs ${txn.transaction_type === 'credit'
                                  ? 'bg-green-900/30 text-green-400'
                                  : 'bg-red-900/30 text-red-400'
                                }`}
                            >
                              {txn.transaction_type}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-sm hidden md:table-cell">
                            {txn.users?.username || 'System'}
                          </td>
                          <td className="py-3 px-2 text-sm text-gray-300">
                            <div>
                              {txn.description}
                              <span className="sm:hidden block text-xs text-gray-500 mt-0.5">
                                {txn.transaction_type} • {txn.payment_mode}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`py-3 px-2 text-sm text-right font-semibold ${txn.transaction_type === 'credit'
                                ? 'text-green-400'
                                : 'text-red-400'
                              }`}
                          >
                            {txn.transaction_type === 'credit' ? '+' : '-'}
                            {formatCurrency(txn.amount)}
                          </td>
                          <td className="py-3 px-2 text-center hidden md:table-cell">
                            <span
                              className={`px-2 py-1 rounded text-xs ${txn.status === 'verified'
                                  ? 'bg-blue-900/30 text-blue-400'
                                  : txn.status === 'day_closed'
                                    ? 'bg-gray-700/50 text-gray-400'
                                    : 'bg-yellow-900/30 text-yellow-400'
                                }`}
                            >
                              {txn.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  No transactions found for this month
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && summary && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card className="bg-gradient-to-br from-red-900/20 to-red-800/10 border-red-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Salary Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-red-500">
                    {formatCurrency(summary.expenses.salary_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">Employee costs</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border-yellow-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">General Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-yellow-500">
                    {formatCurrency(summary.expenses.general_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">{expenses.length} transactions</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Ledger Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-500">
                    {formatCurrency(summary.expenses.ledger_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">Daily ledger transaction debits</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border-purple-800/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {formatCurrency(summary.expenses.total_expenses)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">
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
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    Hospital Expenses - {new Date(`${selectedMonth}-01`).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </CardTitle>
                  <Button
                    onClick={() => setShowAddForm(true)}
                    className="bg-orange-600 hover:bg-orange-700"
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
                    <RefreshCw className="animate-spin h-8 w-8 text-orange-600" />
                  </div>
                ) : expenses.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left py-3 px-4 text-gray-400 font-medium">Expense Type</th>
                          <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                          <th className="text-right py-3 px-4 text-gray-400 font-medium">Amount</th>
                          <th className="text-left py-3 px-4 text-gray-400 font-medium hidden sm:table-cell">Remarks</th>
                          <th className="text-center py-3 px-4 text-gray-400 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id} className="border-b border-gray-800/50">
                            <td className="py-3 px-4 text-white capitalize">{expense.expense_type}</td>
                            <td className="py-3 px-4 text-gray-400">
                              {new Date(expense.expense_date).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="py-3 px-4 text-right text-orange-500 font-semibold">
                              {formatCurrency(expense.amount)}
                            </td>
                            <td className="py-3 px-4 text-gray-400 hidden sm:table-cell text-sm">
                              {expense.remarks || '-'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingExpense(expense)
                                    setShowAddForm(true)
                                  }}
                                  className="text-blue-400 hover:text-blue-300 p-1"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="text-red-400 hover:text-red-300 p-1"
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
                  <div className="text-center py-12 text-gray-400">
                    No general expenses recorded for this month
                  </div>
                )}
              </CardContent>
            </Card>
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
