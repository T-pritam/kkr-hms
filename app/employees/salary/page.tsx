'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Calendar, TrendingUp, TrendingDown } from 'lucide-react'
import { SalaryDetailsModal } from '@/components/salary/salary-details-modal'
import { PayAdvanceModal } from '@/components/salary/pay-advance-modal'
import { MonthlySalaryCreditModal } from '@/components/salary/monthly-salary-credit-modal'

export default function EmployeeSalaryPage() {
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
    // Set default month to current month
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setSelectedMonth(defaultMonth)
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
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Employee Management</h1>
            <p className="text-gray-400 mt-1 text-sm sm:text-base">Manage employee salaries and advances</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <Button
              onClick={() => setShowMonthlySalaryCredit(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Calendar size={18} className="mr-2" />
              Monthly Salary Credit
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-orange-900/20 to-orange-800/10 border-orange-800/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-400 text-sm font-medium">Advances Paid</p>
                  <h3 className="text-2xl font-bold text-orange-400 mt-2">
                    {formatCurrency(totalAdvancesPaid)}
                  </h3>
                </div>
                <div className="bg-orange-500/20 p-3 rounded-full">
                  <TrendingDown className="text-orange-400" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-900/20 to-red-800/10 border-red-800/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-400 text-sm font-medium">Need to Settle</p>
                  <h3 className="text-2xl font-bold text-red-400 mt-2">
                    {formatCurrency(needToSettle)}
                  </h3>
                </div>
                <div className="bg-red-500/20 p-3 rounded-full">
                  <DollarSign className="text-red-400" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-800/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-400 text-sm font-medium">Settled Amount</p>
                  <h3 className="text-2xl font-bold text-green-400 mt-2">
                    {formatCurrency(settledAmount)}
                  </h3>
                </div>
                <div className="bg-green-500/20 p-3 rounded-full">
                  <TrendingUp className="text-green-400" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-800/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-400 text-sm font-medium">Grand Total</p>
                  <h3 className="text-2xl font-bold text-blue-400 mt-2">
                    {formatCurrency(grandTotal)}
                  </h3>
                </div>
                <div className="bg-blue-500/20 p-3 rounded-full">
                  <DollarSign className="text-blue-400" size={24} />
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
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No salary records found for this month
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Designation</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Base Salary</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Attendance</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Final Salary</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Total Advance</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Payment Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee: any) => {
                      const salaryRecord = employee.salary_record
                      const hasRecord = !!salaryRecord

                      return (
                        <tr
                          key={employee.id}
                          className={`border-b border-gray-800 hover:bg-gray-900/50 cursor-pointer`}
                          onClick={() => handleViewSalary(employee.id)}
                        >
                          <td className="py-3 px-4 text-white">{employee.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-800 rounded text-xs">
                              {employee.designation}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-white">
                            ₹{employee.base_salary.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {hasRecord ? (
                              <span>{salaryRecord.days_present} days + {salaryRecord.ot_days} OT</span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-white font-medium">
                            {hasRecord ? (
                              <span className={salaryRecord.status === 'settled' ? 'text-green-400' : ''}>
                                {formatCurrency(parseFloat(salaryRecord.calculated_salary))}
                              </span>
                            ) : (
                              <span className="text-gray-500">Not Created</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-orange-400 font-medium">
                            ₹{(employee.advances?.reduce((sum: number, adv: any) => sum + adv.amount, 0) || 0).toLocaleString('en-IN')}
                          </td>

                          <td className="py-3 px-4">
                            {hasRecord ? (
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${salaryRecord.status === 'settled'
                                  ? 'bg-green-900/30 text-green-400 border border-green-800'
                                  : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
                                }`}>
                                {salaryRecord.status === 'settled' ? 'Settled' : 'Pending'}
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-900/30 text-gray-400 border border-gray-800">
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
      />
    </DashboardLayout>
  )
}
