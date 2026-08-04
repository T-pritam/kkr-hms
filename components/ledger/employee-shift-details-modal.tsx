'use client'

import { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ledgerExpenseCategoryLabel } from '@/lib/format/expense'

interface EmployeeSummary {
  employeeId: string
  employeeName: string
  totalCredits: number
  totalDebits: number
  netBalance: number
  creditCount: number
  debitCount: number
  transactionCount: number
  isClosed: boolean
  transactions: any[]
}

interface EmployeeShiftDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  employee: EmployeeSummary | null
  settlementDate: string
}

export function EmployeeShiftDetailsModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  employee, 
  settlementDate 
}: EmployeeShiftDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')

  const handleSettlement = async () => {
    if (!employee) return

    if (!confirm(`Are you sure you want to mark ${employee.employeeName} as paid for ${settlementDate}? This will close all their transactions for this date.`)) {
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/ledger/close-employee-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          employee_id: employee.employeeId,
          settlement_date: settlementDate,
          notes: notes || null
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert('Employee marked as paid successfully!')
        onSuccess()
        onClose()
        setNotes('')
      } else {
        alert(data.error || 'Failed to settle employee day')
      }
    } catch (error) {
      console.error('Settlement error:', error)
      alert('Failed to settle employee day')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => 
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  const formatTime = (dateStr: string) => 
    new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (!isOpen || !employee) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4 sm:overflow-y-auto">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg sm:max-w-4xl w-full border border-border sm:my-8 max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{employee.employeeName}</h2>
            <p className="text-sm text-muted mt-1">Settlement Date: {settlementDate}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center ml-2">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface-hover rounded-lg p-4 border border-input-border">
              <p className="text-sm text-muted">Total Credits</p>
              <p className="text-2xl font-bold text-success-text mt-1">
                {formatCurrency(employee.totalCredits)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{employee.creditCount} transactions</p>
            </div>
            <div className="bg-surface-hover rounded-lg p-4 border border-input-border">
              <p className="text-sm text-muted">Total Debits</p>
              <p className="text-2xl font-bold text-destructive mt-1">
                {formatCurrency(employee.totalDebits)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{employee.debitCount} transactions</p>
            </div>
            <div className="bg-surface-hover rounded-lg p-4 border border-input-border">
              <p className="text-sm text-muted">Net Balance</p>
              <p className={`text-2xl font-bold mt-1 ${employee.netBalance >= 0 ? 'text-success-text' : 'text-destructive'}`}>
                {formatCurrency(employee.netBalance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{employee.transactionCount} total</p>
            </div>
          </div>

          {/* Transactions Table */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3">All Transactions</h3>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-hover">
                    <th className="py-3 px-4 text-left text-muted text-sm">Time</th>
                    <th className="py-3 px-4 text-left text-muted text-sm">Type</th>
                    <th className="py-3 px-4 text-left text-muted text-sm">Source</th>
                    <th className="py-3 px-4 text-left text-muted text-sm">Category</th>
                    <th className="py-3 px-4 text-left text-muted text-sm">Amount</th>
                    <th className="py-3 px-4 text-left text-muted text-sm">Mode</th>
                    <th className="py-3 px-4 text-left text-muted text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employee.transactions.map((txn: any) => (
                    <tr key={txn.id} className="border-t border-border">
                      <td className="py-3 px-4 text-foreground text-sm">
                        {formatTime(txn.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs border ${
                          txn.transaction_type === 'credit'
                            ? 'bg-success-subtle text-success-text border-success/20'
                            : 'bg-destructive-subtle text-destructive border-destructive/20'
                        }`}>
                          {txn.transaction_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground text-sm capitalize">
                        {txn.source} { txn.source === 'patient' ? ` Installment (${txn.patient?.name || 'Unknown'})` : '' }
                      </td>
                      {/* Not capitalized — it would title-case the free-text detail. */}
                      <td className="py-3 px-4 text-foreground text-sm">
                        {txn.source === 'expense'
                          ? ledgerExpenseCategoryLabel(txn.expense_category, txn.expense_category_detail) || '—'
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-foreground font-medium">
                        {formatCurrency(txn.amount)}
                      </td>
                      <td className="py-3 px-4 text-foreground text-sm capitalize">
                        {txn.payment_mode.replace('_', ' ')} { txn.reference_number && `(${txn.reference_number})` }
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs border ${
                          txn.status === 'verified'
                            ? 'bg-success-subtle text-success-text border-success/20'
                            : txn.status === 'day_closed'
                            ? 'bg-accent-subtle text-accent border-accent/20'
                            : 'bg-warning-subtle text-warning-text border-warning/20'
                        }`}>
                          {txn.status === 'day_closed' && <Lock size={10} className="inline mr-1" />}
                          {txn.status.toUpperCase().replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Settlement Form */}
          {!employee.isClosed && (
            <div className="bg-warning-subtle border border-warning/20 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-warning-text mb-3">Settlement</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="notes">Settlement Notes (Optional)</Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes (e.g., payment method, remarks)"
                    rows={3}
                    className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring mt-2"
                  />
                </div>

                <Button
                  onClick={handleSettlement}
                  disabled={loading}
                  className="w-full bg-destructive hover:bg-destructive-hover"
                >
                  {loading ? 'Processing...' : 'Mark as Paid'}
                </Button>
              </div>
            </div>
          )}

          {employee.isClosed && (
            <div className="bg-accent-subtle border border-accent/20 rounded-lg p-4 text-center">
              <Lock className="mx-auto h-12 w-12 text-accent mb-2" />
              <p className="text-accent font-semibold">This employee day has been closed</p>
              <p className="text-muted text-sm mt-1">No further changes can be made</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
