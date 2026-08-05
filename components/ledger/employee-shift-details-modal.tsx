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
  creditsCash: number
  debitsCash: number
  /** Cash only — UPI and card never touch the drawer. */
  cashExpected: number
  /** This operator handed their cash over. Says nothing about the date's closure. */
  isSettled: boolean
  settlement: any | null
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
  const [cashHandedOver, setCashHandedOver] = useState('')

  const handleSettlement = async () => {
    if (!employee) return

    // The old copy said this would "close all their transactions for this date",
    // which is exactly what it did — and why one operator going home locked the
    // date for everyone. It records a handover and nothing else now.
    if (!confirm(
      `Record the cash handover for ${employee.employeeName} on ${settlementDate}?\n\n` +
      `This does not close the day or lock anyone else's entries.`
    )) {
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/ledger/shift-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          employee_id: employee.employeeId,
          settlement_date: settlementDate,
          cash_handed_over: cashHandedOver === '' ? null : parseFloat(cashHandedOver),
          notes: notes || null
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        onSuccess()
        onClose()
        setNotes('')
        setCashHandedOver('')
      } else {
        alert(data.error || 'Failed to record the shift settlement')
      }
    } catch (error) {
      console.error('Settlement error:', error)
      alert('Failed to record the shift settlement')
    } finally {
      setLoading(false)
    }
  }

  const variance =
    cashHandedOver === '' ? null : parseFloat(cashHandedOver) - (employee?.cashExpected ?? 0)

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
                            : 'bg-warning-subtle text-warning-text border-warning/20'
                        }`}>
                          {txn.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Settlement Form */}
          {!employee.isSettled && (
            <div className="bg-warning-subtle border border-warning/20 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-warning-text mb-1">Cash handover</h3>
              <p className="text-sm text-warning-text/90 mb-3">
                Records what this operator handed over. It does not close the day or lock
                anyone else&apos;s entries.
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Cash expected</Label>
                    <p className="text-xl font-bold text-foreground mt-2">
                      {formatCurrency(employee.cashExpected)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(employee.creditsCash)} in − {formatCurrency(employee.debitsCash)} out
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="cash_handed_over">Cash handed over</Label>
                    <input
                      id="cash_handed_over"
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashHandedOver}
                      onChange={(e) => setCashHandedOver(e.target.value)}
                      placeholder="Counted amount"
                      className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring mt-2"
                    />
                    {/* The gap is the finding — there has been nowhere to record it. */}
                    {variance !== null && variance !== 0 && (
                      <p className={`text-xs mt-1 font-medium ${variance < 0 ? 'text-destructive' : 'text-warning-text'}`}>
                        {variance < 0 ? 'Short by ' : 'Over by '}
                        {formatCurrency(Math.abs(variance))}
                      </p>
                    )}
                  </div>
                </div>

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

                <Button onClick={handleSettlement} disabled={loading} className="w-full">
                  {loading ? 'Recording…' : 'Record handover'}
                </Button>
              </div>
            </div>
          )}

          {employee.isSettled && (
            <div className="bg-accent-subtle border border-accent/20 rounded-lg p-4 text-center">
              <Lock className="mx-auto h-12 w-12 text-accent mb-2" />
              <p className="text-accent font-semibold">This shift has been settled</p>
              <p className="text-muted text-sm mt-1">
                {employee.settlement?.cash_handed_over != null
                  ? `${formatCurrency(employee.settlement.cash_handed_over)} handed over against ${formatCurrency(employee.settlement.cash_expected)} expected`
                  : `${formatCurrency(employee.settlement?.cash_expected ?? employee.cashExpected)} expected; the counted amount was not recorded`}
              </p>
              {employee.settlement?.notes && (
                <p className="text-muted text-sm mt-1 italic">{employee.settlement.notes}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
