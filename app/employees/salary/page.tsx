'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Calendar, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { SalaryDetailsModal } from '@/components/salary/salary-details-modal'
import { PayAdvanceModal } from '@/components/salary/pay-advance-modal'
import { MonthlySalaryCreditModal } from '@/components/salary/monthly-salary-credit-modal'

function SalaryContent() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [showSalaryDetails, setShowSalaryDetails] = useState(false)
  const [showPayAdvance, setShowPayAdvance] = useState(false)
  const [showMonthlySalaryCredit, setShowMonthlySalaryCredit] = useState(false)
  const [selectedEmployeeID, setSelectedEmployeeID] = useState<string | null>(null)
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('')

  // Summary stats
  const [totalAdvancesPaid, setTotalAdvancesPaid] = useState(0)
  const [needToSettle, setNeedToSettle] = useState(0)
  const [settledAmount, setSettledAmount] = useState(0)
  const [grandTotal, setGrandTotal] = useState(0)

  useEffect(() => {
    // Use ?month=YYYY-MM from URL if provided, otherwise default to current month
    const monthParam = searchParams.get('month')
    const isValid = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    if (isValid) {
      setSelectedMonth(monthParam)
    } else {
      const now = new Date()
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setSelectedMonth(defaultMonth)
    }
  }, [])

  useEffect(() => {
    if (selectedMonth) {
      fetchSalaryData()
    }
  }, [selectedMonth])

  const fetchSalaryData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/employees/salary?month_year=${selectedMonth}`, {
        credentials: 'include'
      })
      const data = await response.json()

      if (response.ok && data.success) {
        setEmployees(data.data || [])

        // Use summary from API response
        if (data.summary) {
          setTotalAdvancesPaid(data.summary.total_advances_paid || 0)
          setNeedToSettle(data.summary.need_to_settle || 0)
          setSettledAmount(data.summary.settled_amount || 0)
          setGrandTotal(data.summary.grand_total || 0)
        }
      } else {
        console.error('Failed to fetch:', data.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewSalary = (employeeId: string) => {
    setSelectedEmployeeID(employeeId)
    setShowSalaryDetails(true)
  }

  const handlePayAdvance = (employeeId: string, employeeName: string) => {
    setSelectedEmployeeID(employeeId)
    setSelectedEmployeeName(employeeName)
    setShowPayAdvance(true)
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Employee Management</h1>
            <p className="text-muted mt-1 text-sm sm:text-base">Manage employee salaries and advances</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 min-h-[44px] bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-auto"
            />
            <Button
              onClick={() => setShowMonthlySalaryCredit(true)}
              className="bg-success hover:bg-success-hover w-full sm:w-auto"
            >
              <Calendar size={18} className="mr-2" />
              <span className="sm:hidden">Salary Credit</span>
              <span className="hidden sm:inline">Monthly Salary Credit</span>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Paid */}
          <Card className="bg-gradient-to-br from-accent-subtle to-accent-subtle/50 border-accent/20">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-accent text-xs font-medium">Total Paid</p>
                  <h3 className="text-lg sm:text-xl font-bold text-accent mt-1 truncate">
                    {formatCurrency(totalAdvancesPaid + settledAmount)}
                  </h3>
                </div>
                <div className="bg-accent/20 p-2 rounded-full shrink-0">
                  <DollarSign className="text-accent" size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Advances Paid */}
          <Card className="bg-gradient-to-br from-primary-subtle to-primary-subtle/50 border-primary/20">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-primary text-xs font-medium">Advances Paid</p>
                  <h3 className="text-lg sm:text-xl font-bold text-primary mt-1 truncate">
                    {formatCurrency(totalAdvancesPaid)}
                  </h3>
                </div>
                <div className="bg-primary/20 p-2 rounded-full shrink-0">
                  <TrendingDown className="text-primary" size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settled Amount */}
          <Card className="bg-gradient-to-br from-success-subtle to-success-subtle/50 border-success/20">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-success-text text-xs font-medium">Settled Amount</p>
                  <h3 className="text-lg sm:text-xl font-bold text-success-text mt-1 truncate">
                    {formatCurrency(settledAmount)}
                  </h3>
                </div>
                <div className="bg-success/20 p-2 rounded-full shrink-0">
                  <TrendingUp className="text-success-text" size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Need to Settle */}
          <Card className="bg-gradient-to-br from-destructive-subtle to-destructive-subtle/50 border-destructive/20">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-destructive text-xs font-medium">Need to Settle</p>
                  <h3 className="text-lg sm:text-xl font-bold text-destructive mt-1 truncate">
                    {formatCurrency(needToSettle)}
                  </h3>
                </div>
                <div className="bg-destructive/20 p-2 rounded-full shrink-0">
                  <TrendingDown className="text-destructive" size={18} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grand Total */}
          <Card className="bg-gradient-to-br from-info-subtle to-info-subtle/50 border-info/20">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-info text-xs font-medium">Grand Total</p>
                  <h3 className="text-lg sm:text-xl font-bold text-info mt-1 truncate">
                    {formatCurrency(grandTotal)}
                  </h3>
                </div>
                <div className="bg-info/20 p-2 rounded-full shrink-0">
                  <DollarSign className="text-info" size={18} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Salary Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Salary Records - {selectedMonth}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="text-center py-12 text-muted">
                No salary records found for this month
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Designation</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Base Salary</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Attendance</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Final Salary</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Total Advance</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Payment Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee: any) => {
                      const salaryRecord = employee.salary_record
                      const hasRecord = !!salaryRecord

                      return (
                        <tr
                          key={employee.id}
                          className={`border-b border-border hover:bg-table-row-hover cursor-pointer`}
                          onClick={() => handleViewSalary(employee.id)}
                        >
                          <td className="py-3 px-4 text-foreground">{employee.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 bg-info-subtle text-info border border-info/20 rounded text-xs">
                              {employee.designation}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            ₹{employee.base_salary.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            {hasRecord ? (
                              <span>{salaryRecord.days_present} days + {salaryRecord.ot_days} OT</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-foreground font-medium">
                            {hasRecord ? (
                              <span className={salaryRecord.status === 'settled' ? 'text-success-text' : ''}>
                                {formatCurrency(parseFloat(salaryRecord.calculated_salary))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Not Created</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-primary font-medium">
                            ₹{(employee.advances?.reduce((sum: number, adv: any) => sum + adv.amount, 0) || 0).toLocaleString('en-IN')}
                          </td>

                          <td className="py-3 px-4">
                            {hasRecord ? (
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${salaryRecord.status === 'settled'
                                  ? 'bg-success-subtle text-success-text border border-success/20'
                                  : 'bg-warning-subtle text-warning-text border border-warning/20'
                                }`}>
                                {salaryRecord.status === 'settled' ? 'Settled' : 'Pending'}
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-surface text-muted border border-border">
                                Not Created
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePayAdvance(employee.id, employee.name)
                              }}
                            >
                              Add Advance
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {employees.map((employee: any) => {
                    const salaryRecord = employee.salary_record
                    const hasRecord = !!salaryRecord
                    const totalAdvance = employee.advances?.reduce((sum: number, adv: any) => sum + adv.amount, 0) || 0

                    return (
                      <div
                        key={employee.id}
                        className="bg-surface-elevated rounded-lg p-4 border border-border cursor-pointer active:bg-surface-hover transition-colors"
                        onClick={() => handleViewSalary(employee.id)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="min-w-0">
                            <h3 className="text-foreground font-semibold truncate">{employee.name}</h3>
                            <span className="inline-block mt-1 px-2 py-0.5 bg-info-subtle text-info border border-info/20 rounded text-xs">
                              {employee.designation}
                            </span>
                          </div>
                          {hasRecord ? (
                            <span className={`shrink-0 ml-2 px-2 py-1 rounded-full text-xs font-medium ${salaryRecord.status === 'settled'
                                ? 'bg-success-subtle text-success-text border border-success/20'
                                : 'bg-warning-subtle text-warning-text border border-warning/20'
                              }`}>
                              {salaryRecord.status === 'settled' ? 'Settled' : 'Pending'}
                            </span>
                          ) : (
                            <span className="shrink-0 ml-2 px-2 py-1 rounded-full text-xs font-medium bg-surface text-muted border border-border">
                              Not Created
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div>
                            <span className="text-muted text-xs">Base Salary</span>
                            <p className="text-foreground font-medium">₹{employee.base_salary.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <span className="text-muted text-xs">Final Salary</span>
                            <p className="text-foreground font-medium">
                              {hasRecord ? (
                                <span className={salaryRecord.status === 'settled' ? 'text-success-text' : ''}>
                                  {formatCurrency(parseFloat(salaryRecord.calculated_salary))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted text-xs">Attendance</span>
                            <p className="text-foreground">
                              {hasRecord ? `${salaryRecord.days_present}d + ${salaryRecord.ot_days} OT` : '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted text-xs">Total Advance</span>
                            <p className="text-primary font-medium">₹{totalAdvance.toLocaleString('en-IN')}</p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePayAdvance(employee.id, employee.name)
                          }}
                        >
                          Add Advance
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <SalaryDetailsModal
        isOpen={showSalaryDetails}
        onClose={() => {
          setShowSalaryDetails(false)
          setSelectedEmployeeID(null)
        }}
        employeeId={selectedEmployeeID}
        selectedMonth={selectedMonth}
        onSuccess={fetchSalaryData}
      />

      <PayAdvanceModal
        isOpen={showPayAdvance}
        onClose={() => {
          setShowPayAdvance(false)
          setSelectedEmployeeID(null)
          setSelectedEmployeeName('')
        }}
        employeeId={selectedEmployeeID}
        selectedMonth={selectedMonth}
        employeeName={selectedEmployeeName}
        onSuccess={fetchSalaryData}
      />

      <MonthlySalaryCreditModal
        isOpen={showMonthlySalaryCredit}
        onClose={() => setShowMonthlySalaryCredit(false)}
        onSuccess={fetchSalaryData}
        initialMonth={selectedMonth}
      />
    </DashboardLayout>
  )
}

export default function EmployeeSalaryPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex items-center justify-center h-96">
            <RefreshCw className="animate-spin h-8 w-8 text-primary" />
          </div>
        </DashboardLayout>
      }
    >
      <SalaryContent />
    </Suspense>
  )
}
