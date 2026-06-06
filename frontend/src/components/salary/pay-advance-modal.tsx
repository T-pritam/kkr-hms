import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { X, DollarSign, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PayAdvanceModalProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string | null
  selectedMonth: string
  employeeName: string
  onSuccess: () => void
}

interface ValidationData {
  max_allowed_advance: number
  can_add_advance: boolean
  validation_message: string | null
  scenario: string
  current_total_advances: number
  calculated_salary: number | null
  base_salary: number
  status: string | null
}

export function PayAdvanceModal({ isOpen, onClose, employeeId, selectedMonth, employeeName, onSuccess }: PayAdvanceModalProps) {
  const [loading, setLoading] = useState(false)
  const [validationLoading, setValidationLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [dateGiven, setDateGiven] = useState(new Date().toISOString().split('T')[0])
  const [remarks, setRemarks] = useState('')
  const [validation, setValidation] = useState<ValidationData | null>(null)
  const [amountError, setAmountError] = useState('')

  // Fetch validation rules when modal opens
  useEffect(() => {
    if (isOpen && employeeId && selectedMonth) {
      fetchValidationRules()
    }
  }, [isOpen, employeeId, selectedMonth])

  const fetchValidationRules = async () => {
    try {
      setValidationLoading(true)
      const response = await fetch(
        `/api/employees/${employeeId}/salary/advances/validation?month_year=${selectedMonth}`,
        { credentials: 'include' }
      )

      if (response.ok) {
        const data = await response.json()
        setValidation(data.data)
      } else {
        console.error('Failed to fetch validation rules')
      }
    } catch (error) {
      console.error('Error fetching validation rules:', error)
    } finally {
      setValidationLoading(false)
    }
  }

  // Validate amount in real-time
  useEffect(() => {
    if (!amount || !validation) {
      setAmountError('')
      return
    }

    const numAmount = parseFloat(amount)

    if (numAmount <= 0) {
      setAmountError('Advance amount must be greater than 0')
      return
    }

    if (numAmount > validation.max_allowed_advance) {
      setAmountError(
        `Advance cannot exceed ₹${validation.max_allowed_advance.toFixed(2)}`
      )
      return
    }

    setAmountError('')
  }, [amount, validation])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !dateGiven) {
      alert('Please fill in required fields')
      return
    }

    if (amountError) {
      alert(amountError)
      return
    }

    if (validation && !validation.can_add_advance) {
      alert(validation.validation_message || 'Cannot add advance at this time')
      return
    }

    try {
      setLoading(true)
      const response = await apiFetch(`/api/employees/${employeeId}/salary/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: parseFloat(amount),
          date_given: dateGiven,
          month_year: selectedMonth,
          remarks: remarks || null
        })
      })

      const data = await response.json()

      if (response.ok) {
        onSuccess()
        handleClose()
      } else {
        alert(data.error || 'Failed to add advance')
      }
    } catch (error) {
      console.error('Error adding advance:', error)
      alert('Error adding advance')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setAmount('')
    setDateGiven(new Date().toISOString().split('T')[0])
    setRemarks('')
    setAmountError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg w-full sm:max-w-md border border-border max-h-[95vh] sm:max-h-[80vh] flex flex-col overflow-hidden overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <DollarSign size={20} className="text-primary" />
            Pay Advance
          </h2>
          <button onClick={handleClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div>
            <div className="text-muted text-sm mb-2">Employee</div>
            <div className="text-foreground font-medium">{employeeName}</div>
          </div>

          {/* Validation Info */}
          {validationLoading ? (
            <div className="bg-surface-hover rounded p-3 text-foreground text-sm">
              Loading validation details...
            </div>
          ) : validation ? (
            <div className="space-y-2 bg-surface-hover rounded p-3">
              <div className="text-muted text-xs uppercase tracking-wide font-semibold">
                Validation Status
              </div>

              {/* Scenario Badge */}
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-xs bg-info-subtle text-info px-2 py-1 rounded whitespace-nowrap">
                  {validation.scenario.split(':')[0]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {validation.scenario.split(':')[1]?.trim()}
                </span>
                {validation.status && (
                  <span className={`text-xs px-2 py-1 rounded whitespace-nowrap font-semibold ${
                    validation.status === 'settled' 
                      ? 'bg-destructive-subtle text-destructive' 
                      : 'bg-success-subtle text-success-text'
                  }`}>
                    {validation.status.charAt(0).toUpperCase() + validation.status.slice(1)}
                  </span>
                )}
              </div>

              {/* Base/Calculated Salary */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Base Salary</div>
                  <div className="text-foreground font-semibold">
                    ₹{validation.base_salary.toFixed(2)}
                  </div>
                </div>
                {validation.calculated_salary !== null && (
                  <div>
                    <div className="text-muted-foreground text-xs">Calculated Salary</div>
                    <div className="text-foreground font-semibold">
                      ₹{validation.calculated_salary.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Current Advances */}
              {validation.current_total_advances > 0 && (
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs">Total Advances</div>
                  <div className="text-primary font-semibold">
                    -₹{validation.current_total_advances.toFixed(2)}
                  </div>
                </div>
              )}

              {/* Status and Limit */}
              <div className="pt-2 border-t border-input-border">
                {validation.can_add_advance ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-success-text mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-success-text font-semibold text-sm">
                        Can Add Advance
                      </div>
                      <div className="text-success-text text-xs">
                        Maximum: ₹{validation.max_allowed_advance.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-destructive font-semibold text-sm">
                        Cannot Add Advance
                      </div>
                      <div className="text-destructive text-xs">
                        {validation.validation_message}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-muted text-sm flex items-center gap-1 mb-2">
              Amount <span className="text-destructive">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder="₹ 10,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={amountError ? 'border-destructive' : ''}
              required
            />
            {amountError && (
              <div className="mt-1 flex items-start gap-1">
                <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                <span className="text-destructive text-xs">{amountError}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-muted text-sm flex items-center gap-1 mb-2">
              Date <span className="text-destructive">*</span>
            </label>
            <Input
              type="date"
              value={dateGiven}
              onChange={(e) => setDateGiven(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-muted text-sm mb-2 block">
              Month-Year
            </label>
            <Input
              value={selectedMonth}
            />
          </div>

          <div>
            <label className="text-muted text-sm mb-2 block">
              Remarks
            </label>
            <Input
              placeholder="Optional remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                validationLoading ||
                !validation?.can_add_advance ||
                !amount ||
                !!amountError
              }
              className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add Advance'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
