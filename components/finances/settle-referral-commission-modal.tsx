'use client'

import { useState, useEffect } from 'react'
import { X, Check, Search } from 'lucide-react'

interface ReferralCommission {
  id: string
  patient_id: string
  referral_commission_amount: number
  referral_settled: boolean
  patient: {
    patient_id: string
    name: string
    referred_by: string
  }
  referral?: {
    name: string
    commission_type: string
    commission_percentage?: number
    fixed_commission_amount?: number
  }
}

interface SettleReferralCommissionModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettleReferralCommissionModal({
  isOpen,
  onClose,
}: SettleReferralCommissionModalProps) {
  const [commissions, setCommissions] = useState<ReferralCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [notes, setNotes] = useState('')
  const [settling, setSettling] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchCommissions()
    }
  }, [isOpen])

  const fetchCommissions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/finances/referral-commissions?settled=false')
      const result = await response.json()

      if (result.success) {
        setCommissions(result.data)
      }
    } catch (error) {
      console.error('Error fetching referral commissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSettle = async () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one commission')
      return
    }

    if (!paymentMethod) {
      alert('Please select a payment method')
      return
    }

    try {
      setSettling(true)
      const response = await fetch('/api/finances/referral-commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_ids: selectedIds,
          payment_method: paymentMethod,
          transaction_reference: transactionRef || undefined,
          settlement_notes: notes || undefined,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert(`Successfully settled ${result.data.length} commission(s)`)
        setSelectedIds([])
        setTransactionRef('')
        setNotes('')
        fetchCommissions()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error settling referral commissions:', error)
      alert('Failed to settle referral commissions')
    } finally {
      setSettling(false)
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCommissions.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredCommissions.map((c) => c.id))
    }
  }

  const filteredCommissions = commissions.filter(
    (c) =>
      c.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.patient.patient_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.referral?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalSelectedAmount = commissions
    .filter((c) => selectedIds.includes(c.id))
    .reduce((sum, c) => sum + Number(c.referral_commission_amount || 0), 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Settle Referral Commissions
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {filteredCommissions.length} unsettled commission(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 sm:p-6 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by patient name, ID or referral..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>
        </div>

        {/* Commissions List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : filteredCommissions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No unsettled referral commissions found
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    selectedIds.length === filteredCommissions.length &&
                    filteredCommissions.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-600"
                />
                <label className="text-sm text-gray-400">
                  Select All ({filteredCommissions.length})
                </label>
              </div>

              {/* List */}
              <div className="space-y-3">
                {filteredCommissions.map((commission) => (
                  <div
                    key={commission.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.includes(commission.id)
                        ? 'bg-purple-900/20 border-purple-700'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                    }`}
                    onClick={() => toggleSelection(commission.id)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(commission.id)}
                        onChange={() => toggleSelection(commission.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-white">
                              {commission.patient.name}
                            </h3>
                            <p className="text-sm text-gray-400">
                              Patient ID: {commission.patient.patient_id}
                            </p>
                          </div>
                          <div className="text-xl font-bold text-purple-400">
                            {formatCurrency(commission.referral_commission_amount)}
                          </div>
                        </div>
                        {commission.referral && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                            <span>Referral: {commission.referral.name}</span>
                            <span className="capitalize">
                              {commission.referral.commission_type}
                              {commission.referral.commission_type === 'percentage'
                                ? ` (${commission.referral.commission_percentage}%)`
                                : ` (${formatCurrency(
                                    commission.referral.fixed_commission_amount || 0
                                  )})`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Settlement Form */}
        {selectedIds.length > 0 && (
          <div className="p-4 sm:p-6 border-t border-gray-800 bg-gray-800/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Settlement Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes..."
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-400">
                  Selected: {selectedIds.length} commission(s)
                </p>
                <p className="text-lg font-bold text-white">
                  Total: {formatCurrency(totalSelectedAmount)}
                </p>
              </div>

              <button
                onClick={handleSettle}
                disabled={settling}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {settling ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Settling...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Settle Selected
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
