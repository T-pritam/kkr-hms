'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Edit2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inr } from '@/lib/format/currency'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { downloadPayslip } from '@/lib/pdf/payslip-pdf'
import { Download } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Advance {
  id: number
  amount: number
  date_given: string
  remarks: string | null
  /** Who physically handed over the cash — free text, often not a system user. */
  given_by?: string | null
  created_at?: string | null
  created_by_user?: { username?: string } | null
}

interface SalaryDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string | null
  selectedMonth: string
  onSuccess: () => void
  onAddAdvance: () => void
  advanceRefreshKey: number
}

export function SalaryDetailsModal({ isOpen, onClose, employeeId, selectedMonth, onSuccess, onAddAdvance, advanceRefreshKey }: SalaryDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloadingSlip, setDownloadingSlip] = useState(false)
  const [employeeData, setEmployeeData] = useState<any>(null)
  const [salaryRecord, setSalaryRecord] = useState<any>(null)
  const [advances, setAdvances] = useState<Advance[]>([])
  const [isEditing, setIsEditing] = useState(false)

  // Edit form state
  const [baseSalary, setBaseSalary] = useState('')
  const [daysPresent, setDaysPresent] = useState('')
  const [otDays, setOtDays] = useState('')

  useEffect(() => {
    if (isOpen && employeeId && selectedMonth) {
      fetchSalaryData()
    }
  }, [isOpen, employeeId, selectedMonth, advanceRefreshKey])

  const fetchSalaryData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/employees/salary?month_year=${selectedMonth}`, {
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

  const handleMarkSettled = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/employees/salary/settle`, {
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
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
              {employeeData.name} - {selectedMonth}
            </h2>
            {/* Code, designation, joining date and employment status: on the
                table all along, shown by this modal for the first time. */}
            <p className="text-xs text-muted mt-0.5">
              {[
                employeeData.employee_code,
                employeeData.designation,
                employeeData.join_date ? `joined ${employeeData.join_date}` : null,
                employeeData.status && employeeData.status !== 'Active' ? employeeData.status : null,
              ].filter(Boolean).join(' \u00b7 ') || '\u2014'}
            </p>
          </div>
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
                <span className="text-foreground font-medium">{inr(baseSalary)}</span>
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
                  <span className="text-foreground font-semibold">{inr(calculatedSalary)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Advances Deducted:</span>
                  <span className="text-primary font-medium">{`- ${inr(totalAdvancesAmount)}`}</span>
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
                      {inr(finalSalary)}
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
              onClick={onAddAdvance}
              size="sm"
              className="bg-primary hover:bg-primary-hover"
            >
              Add Advance
            </Button>
          </div>

          {advances.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-input-border">
                    <th className="text-left py-2 px-4 text-muted">Date Given</th>
                    <th className="text-left py-2 px-4 text-muted">Given By</th>
                    <th className="text-left py-2 px-4 text-muted">Amount</th>
                    <th className="text-left py-2 px-4 text-muted">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((advance) => (
                    <tr key={advance.id} className="border-b border-border hover:bg-surface-hover">
                      <td className="py-3 px-4 text-foreground">{advance.date_given}</td>
                      <td className="py-3 px-4 text-foreground">
                        {advance.given_by || '-'}
                        <UpdatedStamp
                          by={advance.created_by_user?.username}
                          at={advance.created_at}
                          action="Recorded"
                        />
                      </td>
                      <td className="py-3 px-4 text-primary font-medium">
                        {inr(advance.amount)}
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
              <p className="text-muted">Total Advances: <span className="text-primary font-bold">{inr(totalAdvancesAmount)}</span></p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-input-border">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          {/* Until now an employee had nothing to take away when they were paid:
              the only advance figure in any document was the summed total. */}
          <Button
            variant="outline"
            className="flex-1"
            disabled={downloadingSlip}
            onClick={async () => {
              if (!employeeId) return
              setDownloadingSlip(true)
              try {
                await downloadPayslip(employeeId, selectedMonth)
              } catch (err: any) {
                setError(err.message)
              } finally {
                setDownloadingSlip(false)
              }
            }}
          >
            <Download size={16} className="mr-2" />
            {downloadingSlip ? 'Preparing...' : 'Payslip'}
          </Button>
          {salaryRecord && salaryRecord.status !== 'settled' && (
            <Button
              onClick={handleMarkSettled}
              disabled={loading}
              className="flex-1 bg-success hover:bg-success-hover"
            >
              Settle ({inr(finalSalary)})
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
