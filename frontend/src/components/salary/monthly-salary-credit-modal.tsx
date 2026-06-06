import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Users, DollarSign, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Employee {
  id: string
  name: string
  designation: string
  base_salary: number
  total_advance?: number
  salary_record?: any
  advances?: any[]
}

interface MonthlySalaryCreditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialMonth?: string
}

export function MonthlySalaryCreditModal({ isOpen, onClose, onSuccess, initialMonth }: MonthlySalaryCreditModalProps) {
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [monthYear, setMonthYear] = useState('')
  const [totalWorkingDays, setTotalWorkingDays] = useState(27)
  
  // Employee attendance data
  const [attendance, setAttendance] = useState<{ [key: string]: { days_present: number, ot_days: number } }>({})

  useEffect(() => {
    if (isOpen) {
      // Use initialMonth from parent if provided, otherwise default to current month
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const defaultMonth = initialMonth || currentMonth
      setMonthYear(defaultMonth)
      fetchSalaryData(defaultMonth)
    }
  }, [isOpen, initialMonth])

  const fetchSalaryData = async (month?: string) => {
    try {
      setLoading(true)
      const monthToFetch = month || monthYear
      const response = await apiFetch(`/api/employees/salary?month_year=${monthToFetch}`, {
        credentials: 'include'
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        setEmployees(data.data || [])
        
        // Initialize attendance with existing values or defaults
        const defaultAttendance: any = {}
        data.data?.forEach((emp: Employee) => {
          if (emp.salary_record) {
            // Employee has existing record - use those values
            defaultAttendance[emp.id] = {
              days_present: emp.salary_record.days_present,
              ot_days: emp.salary_record.ot_days
            }
          } else {
            // New record - use defaults
            defaultAttendance[emp.id] = { days_present: 27, ot_days: 0 }
          }
        })
        setAttendance(defaultAttendance)
      }
    } catch (error) {
      console.error('Error fetching salary data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAttendanceChange = (empId: string, field: 'days_present' | 'ot_days', value: string) => {
    const numValue = parseInt(value) || 0
    setAttendance(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: field === 'days_present' ? Math.min(27, Math.max(0, numValue)) : Math.min(3, Math.max(0, numValue))
      }
    }))
  }

  const calculateSalary = (baseSalary: number, daysPresent: number, otDays: number) => {
    const perDayRate = baseSalary / 30
    return baseSalary + ((daysPresent - 27 + otDays) * perDayRate)
  }

  const handleCreateRecords = async () => {
    if (!monthYear) {
      alert('Please select a month/year')
      return
    }

    const formattedMonthYear = monthYear // Already in YYYY-MM format
    
    const salaryData = employees.map(emp => ({
      employee_id: emp.id,
      base_salary: emp.base_salary,
      days_present: attendance[emp.id]?.days_present || 27,
      ot_days: attendance[emp.id]?.ot_days || 0,
      total_advance: emp.total_advance || 0
    }))

    try {
      setLoading(true)
      const response = await apiFetch('/api/employees/salary/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          month_year: formattedMonthYear,
          employees_data: salaryData
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        onSuccess()
        handleClose()
        
        let message = data.message || 'Salary records created successfully'
        if (data.skipped_settled && data.skipped_settled > 0) {
          message += `\n\nNote: ${data.skipped_settled} settled record(s) were skipped.`
        }
        alert(message)
      } else {
        alert(data.error || 'Failed to create salary records')
      }
    } catch (error) {
      console.error('Error creating salary records:', error)
      alert('Error creating salary records')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setAttendance({})
    onClose()
  }

  if (!isOpen) return null

  const settledCount = employees.filter(e => e.salary_record?.status === 'settled').length
  const editableEmployees = employees.filter(e => e.salary_record?.status !== 'settled')
  const totalBaseSalary = editableEmployees.reduce((sum, emp) => sum + emp.base_salary, 0)
  const estimatedPayout = editableEmployees.reduce((sum, emp) => {
    const att = attendance[emp.id] || { days_present: 27, ot_days: 0 }
    return sum + calculateSalary(emp.base_salary, att.days_present, att.ot_days)
  }, 0)

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg w-full sm:max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-border">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border p-4 sm:p-6 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">Monthly Salary Credit</h2>
          <button onClick={handleClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-hover p-4 rounded-lg border border-input-border">
              <div className="flex items-center gap-2 text-muted text-sm mb-2">
                <Users size={16} />
                Total Employees
              </div>
              <div className="text-foreground text-2xl font-bold">{employees.length}</div>
              {settledCount > 0 && (
                <div className="text-xs text-muted mt-1 flex items-center gap-1">
                  <Lock size={10} />
                  {settledCount} settled (locked)
                </div>
              )}
            </div>
            <div className="bg-surface-hover p-4 rounded-lg border border-input-border">
              <div className="flex items-center gap-2 text-muted text-sm mb-2">
                <DollarSign size={16} />
                Total Base Salary
              </div>
              <div className="text-foreground text-2xl font-bold">₹{totalBaseSalary.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-surface-hover p-4 rounded-lg border border-input-border">
              <div className="flex items-center gap-2 text-muted text-sm mb-2">
                <DollarSign size={16} />
                Estimated Payout
              </div>
              <div className="text-success-text text-2xl font-bold">₹{estimatedPayout.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          {/* Month Selection */}
          <div className="flex items-center gap-4 p-4 bg-surface-hover rounded-lg border border-input-border">
            <div className="flex items-center gap-2 text-muted">
              <Calendar size={20} />
              <span>Select Month/Year:</span>
            </div>
            <Input
              type="month"
              value={monthYear}
              onChange={(e) => {
                setMonthYear(e.target.value)
                fetchSalaryData(e.target.value)
              }}
              className="w-48"
            />
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-muted">Total Working Days:</span>
              <span className="text-foreground font-semibold">{totalWorkingDays}</span>
            </div>
          </div>

          {/* Employee Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-hover sticky top-0">
                <tr>
                  <th className="text-left p-3 text-muted text-sm font-medium">Employee Name</th>
                  <th className="text-left p-3 text-muted text-sm font-medium">Designation</th>
                  <th className="text-left p-3 text-muted text-sm font-medium">Base Salary</th>
                  <th className="text-left p-3 text-muted text-sm font-medium">Days Present (1-27)</th>
                  <th className="text-left p-3 text-muted text-sm font-medium">OT Days (0-3)</th>
                  <th className="text-left p-3 text-muted text-sm font-medium">Calculated Salary</th>
                  <th className="text-left p-3 text-muted text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, index) => {
                  const att = attendance[employee.id] || { days_present: 27, ot_days: 0 }
                  const calcSalary = calculateSalary(employee.base_salary, att.days_present, att.ot_days)
                  const hasRecord = !!employee.salary_record
                  const isSettled = employee.salary_record?.status === 'settled'
                  
                  return (
                    <tr key={employee.id} className={`border-t border-border ${
                      isSettled ? 'opacity-60 bg-surface-inset' : 'hover:bg-surface-hover'
                    }`}>
                      <td className="p-3 text-foreground">
                        <div className="flex items-center gap-2">
                          {isSettled && <Lock size={13} className="text-muted shrink-0" />}
                          {employee.name}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-info-subtle text-info border border-info/20 rounded text-xs">
                          {employee.designation}
                        </span>
                      </td>
                      <td className="p-3 text-foreground">₹{employee.base_salary.toLocaleString('en-IN')}</td>
                      <td className="p-3">
                        {isSettled ? (
                          <span className="text-sm text-muted">{att.days_present}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            max="27"
                            value={att.days_present}
                            onChange={(e) => handleAttendanceChange(employee.id, 'days_present', e.target.value)}
                            className="w-20"
                          />
                        )}
                      </td>
                      <td className="p-3">
                        {isSettled ? (
                          <span className="text-sm text-muted">{att.ot_days}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            max="3"
                            value={att.ot_days}
                            onChange={(e) => handleAttendanceChange(employee.id, 'ot_days', e.target.value)}
                            className="w-20"
                          />
                        )}
                      </td>
                      <td className="p-3 font-semibold">
                        <span className={isSettled ? 'text-muted' : 'text-success-text'}>
                          ₹{calcSalary.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="p-3">
                        {isSettled ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-success-subtle text-success-text border border-success/20 flex items-center gap-1 w-fit">
                            <Lock size={10} />
                            Settled
                          </span>
                        ) : hasRecord ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-warning-subtle text-warning-text border border-warning/20">
                            Pending
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-surface-hover text-muted border border-input-border">
                            New
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-border p-6 flex justify-between items-center">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {settledCount > 0 && (
              <p className="text-xs text-muted">
                {settledCount} settled record{settledCount > 1 ? 's' : ''} will be skipped
              </p>
            )}
            <Button
              onClick={handleCreateRecords}
              disabled={loading || !monthYear || editableEmployees.length === 0}
              className="bg-primary hover:bg-primary-hover"
            >
              {loading ? 'Saving...' : editableEmployees.length === 0 ? 'All Settled' : `Save ${editableEmployees.length} Record${editableEmployees.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
