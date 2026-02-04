'use client'

import { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full border border-gray-800 my-8">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white">{employee.employeeName}</h2>
            <p className="text-sm text-gray-400 mt-1">Settlement Date: {settlementDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <p className="text-sm text-gray-400">Total Credits</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {formatCurrency(employee.totalCredits)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{employee.creditCount} transactions</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <p className="text-sm text-gray-400">Total Debits</p>
              <p className="text-2xl font-bold text-red-400 mt-1">
                {formatCurrency(employee.totalDebits)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{employee.debitCount} transactions</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <p className="text-sm text-gray-400">Net Balance</p>
              <p className={`text-2xl font-bold mt-1 ${employee.netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(employee.netBalance)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{employee.transactionCount} total</p>
            </div>
          </div>

          {/* Transactions Table */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">All Transactions</h3>
            <div className="overflow-x-auto border border-gray-800 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/50">
                    <th className="py-3 px-4 text-left text-gray-400 text-sm">Time</th>
                    <th className="py-3 px-4 text-left text-gray-400 text-sm">Type</th>
                    <th className="py-3 px-4 text-left text-gray-400 text-sm">Source</th>
                    <th className="py-3 px-4 text-left text-gray-400 text-sm">Amount</th>
                    <th className="py-3 px-4 text-left text-gray-400 text-sm">Mode</th>
                    <th className="py-3 px-4 text-left text-gray-400 text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employee.transactions.map((txn: any) => (
                    <tr key={txn.id} className="border-t border-gray-800">
                      <td className="py-3 px-4 text-gray-300 text-sm">
                        {formatTime(txn.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs border ${
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
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs border ${
                          txn.status === 'verified'
                            ? 'bg-green-900/30 text-green-400 border-green-800'
                            : txn.status === 'day_closed'
                            ? 'bg-purple-900/30 text-purple-400 border-purple-800'
                            : 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
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
            <div className="bg-yellow-900/10 border border-yellow-800/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-yellow-400 mb-3">Settlement</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="notes">Settlement Notes (Optional)</Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes (e.g., payment method, remarks)"
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
                  />
                </div>

                <Button
                  onClick={handleSettlement}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  {loading ? 'Processing...' : 'Mark as Paid'}
                </Button>
              </div>
            </div>
          )}

          {employee.isClosed && (
            <div className="bg-purple-900/10 border border-purple-800/50 rounded-lg p-4 text-center">
              <Lock className="mx-auto h-12 w-12 text-purple-400 mb-2" />
              <p className="text-purple-400 font-semibold">This employee day has been closed</p>
              <p className="text-gray-400 text-sm mt-1">No further changes can be made</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
