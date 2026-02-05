'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  Lock,
  Download
} from 'lucide-react'
import { OpdEntryModal } from '@/components/ledger/opd-entry-modal'
import { ExpenseEntryModal } from '@/components/ledger/expense-entry-modal'
import { EditTransactionModal } from '@/components/ledger/edit-transaction-modal'

interface Transaction {
  id: string
  transaction_date: string
  transaction_type: 'credit' | 'debit'
  source: string
  amount: number
  payment_mode: string
  reference_number?: string
  description: string
  notes?: string
  status: string
  created_at: string
  created_by: string
  created_by_user?: { id: string; username: string }
  verified_by_user?: { id: string; username: string }
  patient?: { id: string; name: string }
}

interface DailySummary {
  date: string
  total_credits: number
  total_debits: number
  net_balance: number
  total_credits_cash: number
  total_credits_upi: number
  total_credits_card: number
  total_credits_other: number
  credit_count: number
  debit_count: number
  transaction_count: number
  payment_mode_summary: {
    cash: number
    upi: number
    card: number
    bank_transfer: number
    cheque: number
  }
  transactions: Transaction[]
  is_day_closed: boolean
}

export default function DailyLedgerSummaryPage() {
  const [selectedDate, setSelectedDate] = useState('')
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [showOpdModal, setShowOpdModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [userRole, setUserRole] = useState<string>('')

  useEffect(() => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(today)
    
    // Get user role from cookie or API
    fetchUserRole()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchDailySummary()
    }
  }, [selectedDate])

  const fetchUserRole = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setUserRole(data.role || '')
      }
    } catch (error) {
      console.error('Failed to fetch user role:', error)
    }
  }

  const fetchDailySummary = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/ledger/daily-summary/${selectedDate}`, {
        credentials: 'include'
      })
      const data = await response.json()

      if (response.ok && data.success) {
        setSummary(data.data)
      } else {
        console.error('Failed to fetch summary:', data.error)
      }
    } catch (error) {
      console.error('Fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return

    try {
      const response = await fetch(`/api/ledger/transactions/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        fetchDailySummary()
      } else {
        alert(data.error || 'Failed to delete transaction')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete transaction')
    }
  }

  const handleVerifyTransaction = async (id: string) => {
    try {
      const response = await fetch(`/api/ledger/transactions/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'verified' })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        fetchDailySummary()
      } else {
        alert(data.error || 'Failed to verify transaction')
      }
    } catch (error) {
      console.error('Verify error:', error)
      alert('Failed to verify transaction')
    }
  }

  const formatCurrency = (amount: number) => 
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  const formatTime = (dateStr: string) => 
    new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-900/30 text-green-400 border-green-800'
      case 'pending':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
      case 'day_closed':
        return 'bg-purple-900/30 text-purple-400 border-purple-800'
      default:
        return 'bg-gray-900/30 text-gray-400 border-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle size={14} />
      case 'pending':
        return <Clock size={14} />
      case 'day_closed':
        return <Lock size={14} />
      default:
        return null
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Daily Ledger Summary
            </h1>
            <p className="text-gray-400 mt-1">
              Track daily financial transactions
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full sm:w-auto"
            />
            {!summary?.is_day_closed && (
              <>
                <Button onClick={() => setShowExpenseModal(true)} variant="outline">
                  <TrendingDown size={18} className="mr-2" />
                  Add Expense
                </Button>
                <Button onClick={() => setShowOpdModal(true)}>
                  <Plus size={18} className="mr-2" />
                  Add OPD Entry
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Total Credits
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">
                {formatCurrency(summary?.total_credits || 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary?.credit_count || 0} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Total Debits
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">
                {formatCurrency(summary?.total_debits || 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary?.debit_count || 0} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Net Balance
              </CardTitle>
              <Wallet className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(summary?.net_balance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(summary?.net_balance || 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary?.transaction_count || 0} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Status
              </CardTitle>
              <Calendar className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs border ${summary?.is_day_closed ? 'bg-purple-900/30 text-purple-400 border-purple-800' : 'bg-green-900/30 text-green-400 border-green-800'}`}>
                  {summary?.is_day_closed ? '🔒 CLOSED' : '✓ OPEN'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : !summary?.transactions || summary.transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No transactions for this date
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="py-3 px-4 text-left text-gray-400">Time</th>
                      <th className="py-3 px-4 text-left text-gray-400">Type</th>
                      <th className="py-3 px-4 text-left text-gray-400">Source</th>
                      <th className="py-3 px-4 text-left text-gray-400">Amount</th>
                      <th className="py-3 px-4 text-left text-gray-400">Mode</th>
                      <th className="py-3 px-4 text-left text-gray-400">Reference</th>
                      <th className="py-3 px-4 text-left text-gray-400">Description</th>
                      <th className="py-3 px-4 text-left text-gray-400">Status</th>
                      <th className="py-3 px-4 text-left text-gray-400">Created By</th>
                      <th className="py-3 px-4 text-left text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-gray-800 hover:bg-gray-900/50">
                        <td className="py-3 px-4 text-gray-300 text-sm">
                          {formatTime(txn.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs border ${
                            txn.transaction_type === 'credit'
                              ? 'bg-green-900/30 text-green-400 border-green-800'
                              : 'bg-red-900/30 text-red-400 border-red-800'
                          }`}>
                            {txn.transaction_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-sm capitalize">
                          {txn.source}
                        </td>
                        <td className="py-3 px-4 text-white font-medium">
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-sm capitalize">
                          {txn.payment_mode.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-sm">
                          {txn.reference_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-sm max-w-xs truncate">
                          {txn.description}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs border flex items-center gap-1 w-fit ${getStatusColor(txn.status)}`}>
                            {getStatusIcon(txn.status)}
                            {txn.status.toUpperCase().replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-sm">
                          {txn.created_by_user?.username || 'Unknown'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {txn.status !== 'day_closed' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedTransaction(txn)
                                    setShowEditModal(true)
                                  }}
                                >
                                  <Edit size={16} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteTransaction(txn.id)}
                                >
                                  <Trash2 size={16} />
                                </Button>
                                {userRole === 'admin' && txn.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleVerifyTransaction(txn.id)}
                                  >
                                    <CheckCircle size={16} />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <OpdEntryModal
        isOpen={showOpdModal}
        onClose={() => setShowOpdModal(false)}
        onSuccess={fetchDailySummary}
        selectedDate={selectedDate}
      />

      <ExpenseEntryModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSuccess={fetchDailySummary}
        selectedDate={selectedDate}
      />

      <EditTransactionModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setSelectedTransaction(null)
        }}
        onSuccess={fetchDailySummary}
        transaction={selectedTransaction}
      />
    </DashboardLayout>
  )
}
