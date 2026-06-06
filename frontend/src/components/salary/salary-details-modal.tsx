import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Edit2, DollarSign, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Advance {
  id: number
  amount: number
  date_given: string
  remarks: string | null
}

interface SalaryDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string | null
  selectedMonth: string
  onSuccess: () => void
}

export function SalaryDetailsModal({ isOpen, onClose, employeeId, selectedMonth, onSuccess }: SalaryDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [employeeData, setEmployeeData] = useState<any>(null)
  const [salaryRecord, setSalaryRecord] = useState<any>(null)
  const [advances, setAdvances] = useState<Advance[]>([])
  const [isEditing, setIsEditing] = useState(false)

  // Edit form state
  const [baseSalary, setBaseSalary] = useState('')
  const [daysPresent, setDaysPresent] = useState('')
  const [otDays, setOtDays] = useState('')

  // Add advance state
  const [showAddAdvance, setShowAddAdvance] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split('T')[0])
  const [advanceRemarks, setAdvanceRemarks] = useState('')
  const [validationLoading, setValidationLoading] = useState(false)
  const [validation, setValidation] = useState<any>(null)
  const [amountError, setAmountError] = useState('')

  useEffect(() => {
    if (isOpen && employeeId && selectedMonth) {
      fetchSalaryData()
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
    if (!advanceAmount || !validation) {
      setAmountError('')
      return
    }

    const numAmount = parseFloat(advanceAmount)

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
  }, [advanceAmount, validation])

  const fetchSalaryData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiFetch(`/api/employees/salary?month_year=${selectedMonth}`, {
        credentials: 'include'
      })
      const data = await response.json()

      if (response.ok && data.success && data.data) {
        const emp = data.data.find((e: any) => e.id === employeeId)
        if (emp) {
          setEmployeeData(emp)

          // Always show advances from the employee object
          setAdvances(emp.advances || [])

          if (emp.salary_record) {
            setSalaryRecord(emp.salary_record)
            setBaseSalary(emp.salary_record.base_salary.toString())
            setDaysPresent(emp.salary_record.days_present.toString())
            setOtDays(emp.salary_record.ot_days.toString())
            setIsEditing(false)
          } else {
            setSalaryRecord(null)
            setBaseSalary(emp.base_salary.toString())
            setDaysPresent('27')
            setOtDays('0')
            // Show form immediately for creating new record
            setIsEditing(true)
          }
        }
      }
    } catch (err) {
      console.error('Error fetching salary data:', err)
      setError('Failed to load salary data')
    } finally {
      setLoading(false)
    }
  }

  const calculateSalary = (base: number, days: number, ot: number) => {
    return base - ((27 - days) * (base / 30)) + (ot * (base / 30))
  }

  const handleCreateOrUpdateSalary = async () => {
    try {
      const base = parseFloat(baseSalary)
      const days = parseInt(daysPresent)
      const ot = parseInt(otDays)

      // Validation
      if (days < 0 || days > 27) {
        alert('Days present must be between 0 and 27')
        return
      }
      if (ot < 0 || ot > 3) {
        alert('OT days must be between 0 and 3')
        return
      }
      if (ot > 0 && days !== 27) {
        alert('OT days can only be added when attendance is 27 days')
        return
      }

      setLoading(true)
      const endpoint = salaryRecord
        ? `/api/employees/salary/${salaryRecord.id}`
        : `/api/employees/salary/monthly`

      const method = salaryRecord ? 'PATCH' : 'POST'

      const body = salaryRecord
        ? {
          base_salary: base,
          days_present: days,
          ot_days: ot
        }
        : {
          month_year: selectedMonth,
          employees_data: [
            {
              employee_id: employeeId,
              base_salary: base,
              days_present: days,
              ot_days: ot
            }
          ]
        }

      const response = await fetch(endpoint, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const responseData = await response.json()

      if (response.ok && responseData.success) {
        setIsEditing(false)
        await fetchSalaryData()
        onSuccess()
        alert('Salary saved successfully')
      } else {
        alert(responseData.error || 'Failed to save salary')
      }
    } catch (err) {
      console.error('Error saving salary:', err)
      alert('Error saving salary')
    } finally {
      setLoading(false)
    }
  }

  const handleAddAdvance = async () => {
    try {
      if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
        alert('Please enter a valid advance amount')
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

      setLoading(true)
      const response = await apiFetch(`/api/employees/${employeeId}/salary/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: parseFloat(advanceAmount),
          date_given: advanceDate,
          month_year: selectedMonth,
          remarks: advanceRemarks || null
        })
      })

      const data = await response.json()

      if (response.ok) {
        await fetchSalaryData()
        await fetchValidationRules()
        setShowAddAdvance(false)
        setAdvanceAmount('')
        setAdvanceRemarks('')
        setAdvanceDate(new Date().toISOString().split('T')[0])
        setAmountError('')
        onSuccess()
      } else {
        alert(data.error || 'Failed to add advance')
      }
    } catch (err) {
      console.error('Error adding advance:', err)
      alert('Error adding advance')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkSettled = async () => {
    try {
      setLoading(true)
      const response = await apiFetch(`/api/employees/salary/settle`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          month_year: selectedMonth
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        await fetchSalaryData()
        onSuccess()
        alert('Salary marked as settled')
      } else {
        alert(data.error || 'Failed to mark as settled')
      }
    } catch (err) {
      console.error('Error marking settled:', err)
      alert('Error marking salary as settled')
    } finally {
      setLoading(false)
    }
  }

  const totalAdvancesAmount = advances.reduce((sum, adv) => sum + parseFloat(adv.amount.toString()), 0)

  // Calculate final salary correctly - final_salary from DB is already (calculated_salary - advances)
  let finalSalary = 0
  let calculatedSalary = 0

  if (salaryRecord) {
    // Use final_salary from database (already deducted advances)
    finalSalary = parseFloat(salaryRecord.final_salary?.toString() || '0') || 0
    calculatedSalary = parseFloat(salaryRecord.calculated_salary?.toString() || '0') || 0
  } else {
    // Calculate based on form inputs
    const base = parseFloat(baseSalary) || 0
    const days = parseInt(daysPresent) || 0
    const ot = parseInt(otDays) || 0
    calculatedSalary = base > 0 ? calculateSalary(base, days, ot) : 0
    finalSalary = calculatedSalary - totalAdvancesAmount
  }

  if (!isOpen || !employeeData) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-0">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-2xl sm:mx-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            {employeeData.name} - {selectedMonth}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="bg-destructive-subtle border border-destructive/20 text-destructive p-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Salary Details Section */}
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <DollarSign size={20} />
            {salaryRecord ? 'Salary Details' : 'Create Salary Record'}
          </h3>

          {isEditing || !salaryRecord ? (
            <div className="space-y-3 bg-surface-hover p-4 rounded">
              <div>
                <label className="block text-sm text-muted mb-1">Base Salary</label>
                <Input
                  type="number"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className="bg-surface-inset border-border text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Days Present</label>
                <Input
                  type="number"
                  min="0"
                  max="27"
                  value={daysPresent}
                  onChange={(e) => setDaysPresent(e.target.value)}
                  className="bg-surface-inset border-border text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">OT Days</label>
                <Input
                  type="number"
                  min="0"
                  max="3"
                  value={otDays}
                  onChange={(e) => setOtDays(e.target.value)}
                  className="bg-surface-inset border-border text-foreground"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateOrUpdateSalary}
                  disabled={loading}
                  className="flex-1 bg-success hover:bg-success-hover"
                >
                  Save
                </Button>
                <Button
                  onClick={() => {
                    if (salaryRecord) {
                      setIsEditing(false)
                    } else {
                      onClose()
                    }

                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-surface-hover p-4 rounded space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">Base Salary:</span>
                <span className="text-foreground font-medium">₹{parseFloat(baseSalary).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Days Present:</span>
                <span className="text-foreground font-medium">{daysPresent}/27</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">OT Days:</span>
                <span className="text-foreground font-medium">{otDays}</span>
              </div>

              {/* Salary Breakdown */}
              <div className="border-t border-input-border pt-3 mt-3 space-y-2">
                <div className="flex justify-between bg-surface-inset/50 p-2 rounded">
                  <span className="text-foreground font-medium">Calculated Salary:</span>
                  <span className="text-foreground font-semibold">₹{calculatedSalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Advances Deducted:</span>
                  <span className="text-primary font-medium">-₹{totalAdvancesAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>

              </div>
              <div className="border-t border-input-border pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-muted">Final Salary:</span>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-full border ${salaryRecord.status === 'settled'
                        ? 'bg-success-subtle text-success-text border border-success/20'
                        : 'bg-warning-subtle text-warning-text border border-warning/20'
                      }`}>
                      {salaryRecord.status}
                    </span>
                    <span className="text-success-text font-bold text-lg">
                      ₹{(finalSalary || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {salaryRecord && salaryRecord.status !== 'settled' && (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  className="w-full mt-3"
                >
                  <Edit2 size={16} className="mr-2" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Advances Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Plus size={20} />
              Advances Given
            </h3>
            <Button
              onClick={() => setShowAddAdvance(!showAddAdvance)}
              size="sm"
              className="bg-primary hover:bg-primary-hover"
            >
              Add Advance
            </Button>
          </div>

          {showAddAdvance && (
            <div className="space-y-3 bg-surface-hover p-4 rounded">
              {/* Validation Info */}
              {validationLoading ? (
                <div className="bg-surface-inset rounded p-3 text-foreground text-sm">
                  Loading validation details...
                </div>
              ) : validation ? (
                <div className="space-y-2 bg-surface-inset rounded p-3">
                  <div className="text-foreground text-xs uppercase tracking-wide font-semibold">
                    Validation Status
                  </div>

                  {/* Scenario Badge */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-xs bg-info-subtle text-info px-2 py-1 rounded whitespace-nowrap">
                      {validation.scenario.split(':')[0]}
                    </span>
                    <span className="text-xs text-muted">
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
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <div>
                      <div className="text-muted">Base Salary</div>
                      <div className="text-foreground font-semibold">
                        ₹{validation.base_salary.toFixed(2)}
                      </div>
                    </div>
                    {validation.calculated_salary !== null && (
                      <div>
                        <div className="text-muted">Calculated Salary</div>
                        <div className="text-foreground font-semibold">
                          ₹{validation.calculated_salary.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Current Advances */}
                  {validation.current_total_advances > 0 && (
                    <div className="text-xs">
                      <div className="text-muted">Total Advances</div>
                      <div className="text-primary font-semibold">
                        -₹{validation.current_total_advances.toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Status and Limit */}
                  <div className="pt-2 border-t border-border">
                    {validation.can_add_advance ? (
                      <div className="flex items-start gap-2">
                        <CheckCircle size={14} className="text-success-text mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-success-text font-semibold text-xs">
                            Can Add Advance
                          </div>
                          <div className="text-success-text text-xs">
                            Maximum: ₹{validation.max_allowed_advance.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-destructive font-semibold text-xs">
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
                <label className="block text-sm text-muted mb-1">Amount</label>
                <Input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="Enter advance amount"
                  className={`bg-surface-inset border-border text-foreground ${amountError ? 'border-destructive' : ''}`}
                />
                {amountError && (
                  <div className="mt-1 flex items-start gap-1">
                    <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                    <span className="text-destructive text-xs">{amountError}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Date Given</label>
                <Input
                  type="date"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="bg-surface-inset border-border text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Remarks</label>
                <Input
                  type="text"
                  value={advanceRemarks}
                  onChange={(e) => setAdvanceRemarks(e.target.value)}
                  placeholder="Optional remarks"
                  className="bg-surface-inset border-border text-foreground"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddAdvance}
                  disabled={
                    loading ||
                    validationLoading ||
                    !validation?.can_add_advance ||
                    !advanceAmount ||
                    !!amountError
                  }
                  className="flex-1 bg-success hover:bg-success-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </Button>
                <Button
                  onClick={() => {
                    setShowAddAdvance(false)
                    setAdvanceAmount('')
                    setAdvanceRemarks('')
                    setAdvanceDate(new Date().toISOString().split('T')[0])
                    setAmountError('')
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {advances.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-input-border">
                    <th className="text-left py-2 px-4 text-muted">Date Given</th>
                    <th className="text-left py-2 px-4 text-muted">Amount</th>
                    <th className="text-left py-2 px-4 text-muted">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((advance) => (
                    <tr key={advance.id} className="border-b border-border hover:bg-surface-hover">
                      <td className="py-3 px-4 text-foreground">{advance.date_given}</td>
                      <td className="py-3 px-4 text-primary font-medium">
                        ₹{parseFloat(advance.amount.toString()).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-muted">{advance.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted">No advances given</div>
          )}

          {advances.length > 0 && (
            <div className="text-right border-t border-input-border pt-4">
              <p className="text-muted">Total Advances: <span className="text-primary font-bold">₹{totalAdvancesAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-input-border">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          {salaryRecord && salaryRecord.status !== 'settled' && (
            <Button
              onClick={handleMarkSettled}
              disabled={loading}
              className="flex-1 bg-success hover:bg-success-hover"
            >
              Settle (₹{finalSalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })})
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
