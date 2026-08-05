'use client'

import { useState, useEffect } from 'react'
import { X, Check, Search } from 'lucide-react'

interface DoctorSettlement {
  id: string
  doctor_id: string
  patient_id: string
  visit_count: number
  amount_per_visit: number
  total_amount: number
  settled: boolean
  doctor: {
    name: string
    specialist: string
  }
  /** Null on rows created by merge or create-manual, which span purposes. */
  visit_purpose: {
    id: string
    name: string
  } | null
  patient: {
    patient_id: string
    name: string
  }
}

interface SettleDoctorFeesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettleDoctorFeesModal({ isOpen, onClose }: SettleDoctorFeesModalProps) {
  const [settlements, setSettlements] = useState<DoctorSettlement[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [notes, setNotes] = useState('')
  const [settling, setSettling] = useState(false)
  /** Only meaningful — and only sent — when exactly one fee is selected. */
  const [customAmount, setCustomAmount] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchSettlements()
    }
  }, [isOpen])

  const fetchSettlements = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/finances/doctor-settlements?settled=false')
      const result = await response.json()

      if (result.success) {
        setSettlements(result.data)
      }
    } catch (error) {
      console.error('Error fetching doctor settlements:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSettle = async () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one settlement')
      return
    }

    if (!paymentMethod) {
      alert('Please select a payment method')
      return
    }

    // The API only accepts an explicit amount for a single fee — settling
    // several at once always pays each at its own total, or the hospital's
    // records would show one payment where several actually happened.
    const amountOverride =
      selectedIds.length === 1 && customAmount !== '' ? Number(customAmount) : null

    try {
      setSettling(true)
      const response = await fetch('/api/finances/doctor-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlement_ids: selectedIds,
          settlement_amount: amountOverride,
          payment_method: paymentMethod,
          transaction_reference: transactionRef || undefined,
          settlement_notes: notes || undefined,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert(`Successfully settled ${result.data.length} doctor fee(s)`)
        setSelectedIds([])
        setCustomAmount('')
        setTransactionRef('')
        setNotes('')
        fetchSettlements()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error settling doctor fees:', error)
      alert('Failed to settle doctor fees')
    } finally {
      setSettling(false)
    }
  }

  /** Prefills the override with the newly-single selection's total; clears it otherwise. */
  const syncCustomAmount = (ids: string[]) => {
    if (ids.length !== 1) {
      setCustomAmount('')
      return
    }
    const only = settlements.find((s) => s.id === ids[0])
    setCustomAmount(only ? String(Math.round(Number(only.total_amount) || 0)) : '')
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      syncCustomAmount(next)
      return next
    })
  }

  const toggleSelectAll = () => {
    const next = selectedIds.length === filteredSettlements.length ? [] : filteredSettlements.map((s) => s.id)
    setSelectedIds(next)
    syncCustomAmount(next)
  }

  // A doctor now has one row per purpose, so the purpose has to be searchable —
  // otherwise "operation" finds nothing and the operator scrolls.
  const filteredSettlements = settlements.filter((s) => {
    const q = searchQuery.toLowerCase()
    return (
      s.doctor.name.toLowerCase().includes(q) ||
      s.patient.name.toLowerCase().includes(q) ||
      s.patient.patient_id.toLowerCase().includes(q) ||
      (s.visit_purpose?.name || '').toLowerCase().includes(q)
    )
  })

  const totalSelectedAmount = settlements
    .filter((s) => selectedIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

  // The figure actually about to be paid — the typed override for a single
  // selection, or the sum of each row's own total otherwise.
  const displayTotal =
    selectedIds.length === 1 && customAmount !== '' ? Number(customAmount) || 0 : totalSelectedAmount

  // A doctor with several pending purposes (or several patients) reads as one
  // doctor's business rather than a flat, easy-to-miss list.
  const groupedByDoctor = filteredSettlements.reduce<
    Record<string, { doctor: DoctorSettlement['doctor']; rows: DoctorSettlement[] }>
  >((acc, s) => {
    if (!acc[s.doctor_id]) acc[s.doctor_id] = { doctor: s.doctor, rows: [] }
    acc[s.doctor_id].rows.push(s)
    return acc
  }, {})

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Settle Doctor Fees
            </h2>
            <p className="text-sm text-muted mt-1">
              {filteredSettlements.length} unsettled fee(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 sm:p-6 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted" />
            <input
              type="text"
              placeholder="Search by doctor, patient name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-input border border-input-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Settlements List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-12 text-muted">Loading...</div>
          ) : filteredSettlements.length === 0 ? (
            <div className="text-center py-12 text-muted">
              No unsettled doctor fees found
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    selectedIds.length === filteredSettlements.length &&
                    filteredSettlements.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border text-info focus:ring-ring"
                />
                <label className="text-sm text-muted">
                  Select All ({filteredSettlements.length})
                </label>
              </div>

              {/* List, grouped by doctor */}
              <div className="space-y-5">
                {Object.entries(groupedByDoctor).map(([doctorId, group]) => (
                  <div key={doctorId}>
                    <h4 className="text-sm font-semibold text-foreground mb-2">
                      {group.doctor.name}
                      {group.doctor.specialist && (
                        <span className="ml-2 font-normal text-muted">{group.doctor.specialist}</span>
                      )}
                    </h4>
                    <div className="space-y-3">
                      {group.rows.map((settlement) => (
                        <div
                          key={settlement.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                            selectedIds.includes(settlement.id)
                              ? 'bg-info-subtle border-info/20'
                              : 'bg-surface-hover border-input-border hover:border-border'
                          }`}
                          onClick={() => toggleSelection(settlement.id)}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(settlement.id)}
                              onChange={() => toggleSelection(settlement.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 w-4 h-4 rounded border-border text-info focus:ring-ring"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                {/* Without the purpose, two rows for the same
                                    doctor are indistinguishable and the wrong
                                    one gets paid. */}
                                <h3 className="font-semibold text-foreground">
                                  {settlement.visit_purpose?.name || 'No purpose'}
                                </h3>
                                <div className="text-xl font-bold text-info">
                                  {formatCurrency(settlement.total_amount)}
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                                <span>
                                  Patient: {settlement.patient.name} (
                                  {settlement.patient.patient_id})
                                </span>
                                <span>Visits: {settlement.visit_count}</span>
                                <span>
                                  Rate: {formatCurrency(settlement.amount_per_visit)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Settlement Form */}
        {selectedIds.length > 0 && (
          <div className="p-4 sm:p-6 border-t border-border bg-surface-hover">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2 bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-4 py-2 bg-input border border-input-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Only meaningful for one fee at a time — the API refuses an explicit
                amount across several, since one figure cannot describe several
                payments. Selecting more than one pays each at its own total. */}
            {selectedIds.length === 1 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-2">
                  Amount to settle (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customAmount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full px-4 py-2 bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted mt-1">
                  Prefilled from the calculated total — change it for a partial payment.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-2">
                Settlement Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes..."
                className="w-full px-4 py-2 bg-input border border-input-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted">
                  Selected: {selectedIds.length} settlement(s)
                </p>
                <p className="text-lg font-bold text-foreground">
                  Total: {formatCurrency(displayTotal)}
                </p>
              </div>

              <button
                onClick={handleSettle}
                disabled={settling}
                className="px-6 py-3 bg-info hover:bg-info-hover disabled:bg-surface-inset disabled:cursor-not-allowed text-foreground rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {settling ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-foreground border-t-transparent rounded-full" />
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
