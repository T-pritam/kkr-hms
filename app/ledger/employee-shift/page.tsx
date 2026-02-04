'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Eye,
  Lock,
  AlertCircle
} from 'lucide-react'
import { EmployeeShiftDetailsModal } from '@/components/ledger/employee-shift-details-modal'

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

interface ShiftSummaryData {
  settlementDate: string
  employeeSummaries: EmployeeSummary[]
}

export default function EmployeeShiftPage() {
  const [selectedDate, setSelectedDate] = useState('')
  const [data, setData] = useState<ShiftSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null)

  useEffect(() => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(today)
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchEmployeeShiftSummary()
    }
  }, [selectedDate])

  const fetchEmployeeShiftSummary = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/ledger/employee-shift-summary?date=${selectedDate}`, {
        credentials: 'include'
      })
      const result = await response.json()

      if (response.ok && result.success) {
        setData(result.data)
      } else {
        console.error('Failed to fetch summary:', result.error)
        if (response.status === 403) {
          alert('Access denied. Admin privileges required.')
        }
      }
    } catch (error) {
      console.error('Fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => 
    `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  const totalCreditsAllEmployees = data?.employeeSummaries.reduce((sum, emp) => sum + emp.totalCredits, 0) || 0
  const totalDebitsAllEmployees = data?.employeeSummaries.reduce((sum, emp) => sum + emp.totalDebits, 0) || 0
  const netBalanceAllEmployees = totalCreditsAllEmployees - totalDebitsAllEmployees

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Employee Shift Settlement
            </h1>
            <p className="text-gray-400 mt-1">
              Manage employee-wise daily transactions (Admin Only)
            </p>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full sm:w-auto"
            />
            <Button onClick={fetchEmployeeShiftSummary} variant="outline">
              Refresh
            </Button>
          </div>
        </div>

        {/* Overall Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Total Credits
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">
                {formatCurrency(totalCreditsAllEmployees)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Total Debits
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">
                {formatCurrency(totalDebitsAllEmployees)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Net Balance
              </CardTitle>
              <DollarSign className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${netBalanceAllEmployees >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(netBalanceAllEmployees)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Employee Summary Table */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Summaries</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : !data?.employeeSummaries || data.employeeSummaries.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="mx-auto h-12 w-12 mb-4" />
                <p>No employee transactions for this date</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="py-3 px-4 text-left text-gray-400">Employee Name</th>
                        <th className="py-3 px-4 text-left text-gray-400">Credits (₹)</th>
                        <th className="py-3 px-4 text-left text-gray-400">Debits (₹)</th>
                        <th className="py-3 px-4 text-left text-gray-400">Balance (₹)</th>
                        <th className="py-3 px-4 text-left text-gray-400">Transactions</th>
                        <th className="py-3 px-4 text-left text-gray-400">Status</th>
                        <th className="py-3 px-4 text-left text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.employeeSummaries.map((emp) => (
                        <tr key={emp.employeeId} className="border-b border-gray-800 hover:bg-gray-900/50">
                          <td className="py-3 px-4 text-white font-medium">
                            {emp.employeeName}
                          </td>
                          <td className="py-3 px-4 text-green-400">
                            {formatCurrency(emp.totalCredits)}
                          </td>
                          <td className="py-3 px-4 text-red-400">
                            {formatCurrency(emp.totalDebits)}
                          </td>
                          <td className={`py-3 px-4 font-bold ${emp.netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(emp.netBalance)}
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {emp.transactionCount}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs border ${
                              emp.isClosed
                                ? 'bg-purple-900/30 text-purple-400 border-purple-800'
                                : 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
                            }`}>
                              {emp.isClosed ? (
                                <>
                                  <Lock size={12} className="inline mr-1" />
                                  CLOSED
                                </>
                              ) : (
                                'PENDING'
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedEmployee(emp)
                                setShowDetailsModal(true)
                              }}
                            >
                              <Eye size={16} className="mr-2" />
                              View Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {data.employeeSummaries.map((emp) => (
                    <div
                      key={emp.employeeId}
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-white font-medium">{emp.employeeName}</h3>
                          <p className="text-sm text-gray-400 mt-1">
                            {emp.transactionCount} transactions
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs border ${
                          emp.isClosed
                            ? 'bg-purple-900/30 text-purple-400 border-purple-800'
                            : 'bg-yellow-900/30 text-yellow-400 border-yellow-800'
                        }`}>
                          {emp.isClosed ? '🔒 CLOSED' : 'PENDING'}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Credits:</span>
                          <span className="text-green-400 font-medium">
                            {formatCurrency(emp.totalCredits)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Debits:</span>
                          <span className="text-red-400 font-medium">
                            {formatCurrency(emp.totalDebits)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-gray-700 pt-2">
                          <span className="text-gray-400 font-medium">Balance:</span>
                          <span className={`font-bold ${emp.netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(emp.netBalance)}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setSelectedEmployee(emp)
                          setShowDetailsModal(true)
                        }}
                      >
                        <Eye size={16} className="mr-2" />
                        View Details
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Modal */}
      <EmployeeShiftDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false)
          setSelectedEmployee(null)
        }}
        onSuccess={fetchEmployeeShiftSummary}
        employee={selectedEmployee}
        settlementDate={selectedDate}
      />
    </DashboardLayout>
  )
}
