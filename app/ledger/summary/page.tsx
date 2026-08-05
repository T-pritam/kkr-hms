'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
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
  Unlock,
  Download
} from 'lucide-react'
import { OpdEntryModal } from '@/components/ledger/opd-entry-modal'
import { ExpenseEntryModal } from '@/components/ledger/expense-entry-modal'
import { EditTransactionModal } from '@/components/ledger/edit-transaction-modal'
import { AddPatientInstallmentModal } from '@/components/ledger/add-patient-installment-modal'
import { CloseDayDialog } from '@/components/ledger/close-day-dialog'
import { ReopenDayDialog } from '@/components/ledger/reopen-day-dialog'
import { DayCloseBanner } from '@/components/ledger/day-close-banner'
import { useUser } from '@/hooks/use-user'
import { ledgerExpenseCategoryLabel } from '@/lib/format/expense'
import type { LedgerClosure } from '@/lib/ledger/closure'

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
  /** Expense rows only — null on credits and OPD collections. */
  expense_category?: string | null
  expense_category_detail?: string | null
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
  debit_mode_summary: Record<string, number>
  transactions: Transaction[]
  /** Derived from daily_ledger_closures, not from any transaction's status. */
  is_day_closed: boolean
  closure: LedgerClosure | null
  unverified_count: number
  opening_balance_preview: number
  opening_cash_balance_preview: number
}

export default function DailyLedgerSummaryPage() {

  const { user } = useUser()

  const [selectedDate, setSelectedDate] = useState('')
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [showOpdModal, setShowOpdModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showInstallmentModal, setShowInstallmentModal] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [showReopenDialog, setShowReopenDialog] = useState(false)
  const [closureRefreshKey, setClosureRefreshKey] = useState(0)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

  // Roles are upper case (types/auth.ts). The page used to fetch /api/auth/me into
  // its own `userRole` and read `data.role`, but that route returns `{ user: { role } }`
  // — so the value was always '' and every role-gated control stayed hidden.
  const userRole = user?.role ?? ''
  const canVerify = userRole === 'ADMIN' || userRole === 'DOCTOR'
  // Closing reconciles the day's cash and locks the period; narrower than reading it.
  const canCloseDay = userRole === 'ADMIN'

  useEffect(() => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(today)
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchDailySummary()
    }
  }, [selectedDate])

  const fetchDailySummary = async () => {
    try {
      setLoading(true)
      // No user_id filter: the route scopes non-privileged roles to their own rows
      // on the server. Sending it here re-scoped admins to themselves, which is why
      // the whole-day totals and the closed/open flag were never right for them.
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

  useRealtimeRefetch(
    ['daily_ledger_transactions', 'daily_ledger_closures', 'daily_ledger_shift_settlements', 'expenses'],
    fetchDailySummary
  )

  /** After a close or reopen, both the day and the open-day backlog have moved. */
  const handleClosureChanged = () => {
    fetchDailySummary()
    setClosureRefreshKey((key) => key + 1)
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

  // A row is pending or verified. 'day_closed' used to appear here too, which is
  // how one status came to mean both "reviewed" and "the period is locked".
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-success-subtle text-success-text border-success/20'
      case 'pending':
        return 'bg-warning-subtle text-warning-text border-warning/20'
      default:
        return 'bg-surface text-muted border-border'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle size={14} />
      case 'pending':
        return <Clock size={14} />
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Daily Ledger Summary
            </h1>
            <p className="text-muted mt-1">
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
                <Button onClick={() => setShowInstallmentModal(true)} variant="outline">
                  <Plus size={18} className="mr-2" />
                  Add Patient Installment
                </Button>
                <Button onClick={() => setShowOpdModal(true)}>
                  <Plus size={18} className="mr-2" />
                  Add OPD Entry
                </Button>
              </>
            )}

            {/* The close action had no UI at all — /api/ledger/close-day existed
                and nothing in the app ever called it. */}
            {canCloseDay && !summary?.is_day_closed && (summary?.transaction_count ?? 0) > 0 && (
              <Button onClick={() => setShowCloseDialog(true)} variant="outline">
                <Lock size={18} className="mr-2" />
                Close Day
              </Button>
            )}
            {canCloseDay && summary?.is_day_closed && (
              <Button onClick={() => setShowReopenDialog(true)} variant="outline">
                <Unlock size={18} className="mr-2" />
                Reopen Day
              </Button>
            )}
          </div>
        </div>

        <DayCloseBanner
          date={selectedDate}
          closure={summary?.closure ?? null}
          canReopen={canCloseDay}
          onReopen={() => setShowReopenDialog(true)}
          refreshKey={closureRefreshKey}
        />

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                Total Credits
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-success-text" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success-text">
                {formatCurrency(summary?.total_credits || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.credit_count || 0} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                Total Debits
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(summary?.total_debits || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.debit_count || 0} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                Net Balance
              </CardTitle>
              <Wallet className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(summary?.net_balance || 0) >= 0 ? 'text-success-text' : 'text-destructive'}`}>
                {formatCurrency(summary?.net_balance || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.transaction_count || 0} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                Status
              </CardTitle>
              <Calendar className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs border ${summary?.is_day_closed ? 'bg-accent-subtle text-accent border-accent/20' : 'bg-success-subtle text-success-text border-success/20'}`}>
                  {summary?.is_day_closed ? '🔒 CLOSED' : '✓ OPEN'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.is_day_closed
                  ? `Close #${summary.closure?.version ?? 1}${
                      summary.closure?.closed_by_user?.username
                        ? ` · ${summary.closure.closed_by_user.username}`
                        : ''
                    }`
                  : (summary?.unverified_count ?? 0) > 0
                    ? `${summary?.unverified_count} unverified`
                    : 'All entries verified'}
              </p>
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
              <div className="text-center py-12 text-muted">Loading...</div>
            ) : !summary?.transactions || summary.transactions.length === 0 ? (
              <div className="text-center py-12 text-muted">
                No transactions for this date
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-3 px-4 text-left text-muted">Time</th>
                      <th className="py-3 px-4 text-left text-muted">Type</th>
                      <th className="py-3 px-4 text-left text-muted">Source</th>
                      <th className="py-3 px-4 text-left text-muted">Amount</th>
                      <th className="py-3 px-4 text-left text-muted">Mode</th>
                      <th className="py-3 px-4 text-left text-muted">Reference</th>
                      <th className="py-3 px-4 text-left text-muted">Description</th>
                      <th className="py-3 px-4 text-left text-muted">Status</th>
                      <th className="py-3 px-4 text-left text-muted">Created By</th>
                      <th className="py-3 px-4 text-left text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-border hover:bg-table-row-hover">
                        <td className="py-3 px-4 text-foreground text-sm">
                          {new Date(txn.created_at).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs border ${
                            txn.transaction_type === 'credit'
                              ? 'bg-success-subtle text-success-text border-success/20'
                              : 'bg-destructive-subtle text-destructive border-destructive/20'
                          }`}>
                            {txn.transaction_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-foreground text-sm capitalize">
                          {txn.source} { txn.source == 'patient' ? `(${txn.patient?.name || 'Unknown'})` : '' }
                          {txn.source === 'expense' && txn.expense_category && (
                            // Not capitalized — it would title-case the free text.
                            <span className="block text-xs text-muted normal-case">
                              {ledgerExpenseCategoryLabel(txn.expense_category, txn.expense_category_detail)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-foreground font-medium">
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="py-3 px-4 text-foreground text-sm capitalize">
                          {txn.payment_mode.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-4 text-foreground text-sm">
                          {txn.reference_number || '-'}
                        </td>
                        <td className="py-3 px-4 text-foreground text-sm max-w-xs truncate">
                          {txn.description}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs border flex items-center gap-1 w-fit ${getStatusColor(txn.status)}`}>
                            {getStatusIcon(txn.status)}
                            {txn.status.toUpperCase().replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-foreground text-sm">
                          {txn.created_by_user?.username || 'Unknown'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {!summary.is_day_closed && (
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
                                {canVerify && txn.status === 'pending' && (
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

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {summary.transactions.map((txn) => (
                    <div key={txn.id} className="bg-surface-elevated rounded-lg p-3 border border-border space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`shrink-0 px-2 py-1 rounded-full text-xs border font-medium ${
                            txn.transaction_type === 'credit'
                              ? 'bg-success-subtle text-success-text border-success/20'
                              : 'bg-destructive-subtle text-destructive border-destructive/20'
                          }`}>
                            {txn.transaction_type === 'credit' ? '+' : '-'}
                          </span>
                          <span className={`font-bold text-lg ${
                            txn.transaction_type === 'credit' ? 'text-success-text' : 'text-destructive'
                          }`}>
                            {formatCurrency(txn.amount)}
                          </span>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded-full text-xs border flex items-center gap-1 ${getStatusColor(txn.status)}`}>
                          {getStatusIcon(txn.status)}
                          {txn.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="text-sm text-foreground">{txn.description}</div>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>{new Date(txn.created_at).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="capitalize">{txn.source}{txn.source === 'patient' ? ` (${txn.patient?.name || 'Unknown'})` : ''}</span>
                        {txn.source === 'expense' && txn.expense_category && (
                          <span>{ledgerExpenseCategoryLabel(txn.expense_category, txn.expense_category_detail)}</span>
                        )}
                        <span className="capitalize">{txn.payment_mode.replace('_', ' ')}</span>
                        {txn.reference_number && <span>Ref: {txn.reference_number}</span>}
                        <span>By: {txn.created_by_user?.username || 'Unknown'}</span>
                      </div>

                      {!summary.is_day_closed && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setSelectedTransaction(txn)
                              setShowEditModal(true)
                            }}
                          >
                            <Edit size={14} className="mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteTransaction(txn.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                          {canVerify && txn.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleVerifyTransaction(txn.id)}
                            >
                              <CheckCircle size={14} />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
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

      <AddPatientInstallmentModal
        isOpen={showInstallmentModal}
        onClose={() => setShowInstallmentModal(false)}
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

      {summary && (
        <CloseDayDialog
          isOpen={showCloseDialog}
          onClose={() => setShowCloseDialog(false)}
          onSuccess={handleClosureChanged}
          date={selectedDate}
          totals={summary}
        />
      )}

      <ReopenDayDialog
        isOpen={showReopenDialog}
        onClose={() => setShowReopenDialog(false)}
        onSuccess={handleClosureChanged}
        date={selectedDate}
        closure={summary?.closure ?? null}
      />
    </DashboardLayout>
  )
}
