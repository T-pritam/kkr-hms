'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SalaryDetailsModal } from '@/components/salary/salary-details-modal'
import { PayAdvanceModal } from '@/components/salary/pay-advance-modal'
import { MonthlySalaryCreditModal } from '@/components/salary/monthly-salary-credit-modal'
import { SALARY_STATUS_LABELS, SALARY_STATUS_VARIANTS, type SalaryStatus } from '@/lib/employees/constants'
import { inr, toAmount } from '@/lib/format/currency'
import { monthLabel } from '@/lib/pdf/advance-log-pdf'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { AlertTriangle, Calendar, Plus, RefreshCw } from 'lucide-react'

/**
 * Payroll for one month.
 *
 * Rebuilt onto the house shell. Two things changed beyond the styling:
 *
 *   - **The "Final Salary" column showed `calculated_salary`** — the figure
 *     *before* advances are deducted — so a row could read ₹29,000 next to
 *     ₹28,000 of advances. It now shows `final_salary`, and the pre-deduction
 *     figure is labelled as such in the details modal.
 *   - **Every figure goes through `inr()`.** The old `formatCurrency` set a
 *     *maximum* of two decimals and no minimum, which is the one formatter in
 *     the app that can print a bare `₹-0.2`. Totals that cannot meaningfully be
 *     negative are clamped.
 *
 * The salary maths, the advance caps and the settle flow are untouched.
 */

interface SalaryRecord {
  days_present: number | null
  ot_days: number | null
  calculated_salary: number | string | null
  final_salary: number | string | null
  total_advance: number | string | null
  status: string | null
}

interface EmployeeRow {
  id: string
  employee_code?: string | null
  name: string
  designation: string | null
  base_salary: number | string | null
  status: string | null
  salary_record: SalaryRecord | null
  advances?: { amount: number | string }[]
  total_advance?: number | string
}

interface Summary {
  total_advances_paid: number
  need_to_settle: number
  settled_amount: number
  grand_total: number
}

function SalaryContent() {
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [selectedMonth, setSelectedMonth] = useState('')

  const [showSalaryDetails, setShowSalaryDetails] = useState(false)
  const [showPayAdvance, setShowPayAdvance] = useState(false)
  const [showMonthlyCredit, setShowMonthlyCredit] = useState(false)
  const [selectedEmployeeID, setSelectedEmployeeID] = useState<string | null>(null)
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('')

  useEffect(() => {
    // ?month=YYYY-MM is how /finances deep-links in.
    const monthParam = searchParams.get('month')
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      setSelectedMonth(monthParam)
      return
    }
    const now = new Date()
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  }, [searchParams])

  const fetchSalaryData = useCallback(async () => {
    if (!selectedMonth) return
    try {
      setLoading(true)
      const res = await fetch(`/api/employees/salary?month_year=${selectedMonth}`, {
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok || !body?.success) throw new Error(body?.error || 'Failed to load payroll')

      setEmployees(body.data || [])
      setSummary(body.summary || null)
      setError('')
    } catch (err: any) {
      // The old page console.error'd, so a failed fetch was indistinguishable
      // from a month with no records.
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    void fetchSalaryData()
  }, [fetchSalaryData])

  useRealtimeRefetch(['salary_payments', 'advances'], fetchSalaryData)

  const advanceTotal = (employee: EmployeeRow) =>
    employee.advances?.reduce((sum, adv) => sum + toAmount(adv.amount), 0) ?? toAmount(employee.total_advance)

  const openAdvance = (employee: EmployeeRow) => {
    setSelectedEmployeeID(employee.id)
    setSelectedEmployeeName(employee.name)
    setShowPayAdvance(true)
  }

  const kpis = [
    {
      label: 'Total paid',
      value: inr((summary?.total_advances_paid ?? 0) + (summary?.settled_amount ?? 0), { clamp: true }),
      tone: 'text-accent',
    },
    { label: 'Advances paid', value: inr(summary?.total_advances_paid, { clamp: true }), tone: 'text-primary' },
    { label: 'Settled', value: inr(summary?.settled_amount, { clamp: true }), tone: 'text-success-text' },
    { label: 'Need to settle', value: inr(summary?.need_to_settle, { clamp: true }), tone: 'text-destructive' },
    { label: 'Grand total', value: inr(summary?.grand_total, { clamp: true }), tone: 'text-info' },
  ]

  const statusOf = (record: SalaryRecord | null): SalaryStatus | null =>
    record ? ((record.status || 'pending') as SalaryStatus) : null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Employee Salary</h1>
            <p className="text-muted">
              Payroll and advances for {selectedMonth ? monthLabel(selectedMonth) : 'this month'}.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              aria-label="Month"
              className="sm:w-44"
            />
            <Button onClick={() => setShowMonthlyCredit(true)} variant="success">
              <Calendar size={18} className="mr-2" />
              Monthly Salary Credit
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-surface rounded-lg border border-border p-4">
              <div className="text-xs text-muted uppercase tracking-wide">{kpi.label}</div>
              <div className={`text-lg font-bold mt-1 truncate ${kpi.tone}`}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading payroll…</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">No salary records found for this month</p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    {['Employee', 'Base salary', 'Attendance', 'Advances', 'Final salary', 'Status'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted uppercase"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {employees.map(employee => {
                    const record = employee.salary_record
                    const status = statusOf(record)

                    return (
                      <tr
                        key={employee.id}
                        className="hover:bg-table-row-hover cursor-pointer"
                        onClick={() => {
                          setSelectedEmployeeID(employee.id)
                          setShowSalaryDetails(true)
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="text-foreground">{employee.name}</div>
                          <div className="text-xs text-muted mt-0.5">
                            {[employee.employee_code, employee.designation]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{inr(employee.base_salary)}</td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {record
                            ? `${record.days_present ?? 0} days${record.ot_days ? ` + ${record.ot_days} OT` : ''}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground">{inr(advanceTotal(employee))}</td>
                        <td className="px-4 py-3 text-foreground font-medium">
                          {/* final_salary, not calculated_salary — the column
                              header has always said "Final" and the value has
                              always been the pre-deduction figure. */}
                          {record ? inr(record.final_salary) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {status ? (
                            <Badge variant={SALARY_STATUS_VARIANTS[status] ?? 'outline'}>
                              {SALARY_STATUS_LABELS[status] ?? status}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not created</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={e => {
                              e.stopPropagation()
                              openAdvance(employee)
                            }}
                          >
                            <Plus size={14} className="mr-1" />
                            Advance
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {employees.map(employee => {
                const record = employee.salary_record
                const status = statusOf(record)

                return (
                  <div
                    key={employee.id}
                    className="p-4 space-y-3 cursor-pointer hover:bg-table-row-hover"
                    onClick={() => {
                      setSelectedEmployeeID(employee.id)
                      setShowSalaryDetails(true)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">{employee.name}</div>
                        <div className="text-xs text-muted">{employee.designation || '—'}</div>
                      </div>
                      {status ? (
                        <Badge variant={SALARY_STATUS_VARIANTS[status] ?? 'outline'}>
                          {SALARY_STATUS_LABELS[status] ?? status}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not created</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted">Base salary</div>
                        <div className="text-foreground">{inr(employee.base_salary)}</div>
                      </div>
                      <div>
                        <div className="text-muted">Advances</div>
                        <div className="text-foreground">{inr(advanceTotal(employee))}</div>
                      </div>
                      <div>
                        <div className="text-muted">Attendance</div>
                        <div className="text-foreground">
                          {record
                            ? `${record.days_present ?? 0} days${record.ot_days ? ` + ${record.ot_days} OT` : ''}`
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted">Final salary</div>
                        <div className="text-foreground font-medium">
                          {record ? inr(record.final_salary) : '—'}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={e => {
                        e.stopPropagation()
                        openAdvance(employee)
                      }}
                    >
                      <Plus size={14} className="mr-1" />
                      Add advance
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

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
        }}
        employeeId={selectedEmployeeID}
        selectedMonth={selectedMonth}
        employeeName={selectedEmployeeName}
        onSuccess={fetchSalaryData}
      />

      <MonthlySalaryCreditModal
        isOpen={showMonthlyCredit}
        onClose={() => setShowMonthlyCredit(false)}
        initialMonth={selectedMonth}
        onSuccess={fetchSalaryData}
      />
    </DashboardLayout>
  )
}

export default function EmployeeSalaryPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="animate-spin text-muted" size={24} />
          </div>
        </DashboardLayout>
      }
    >
      <SalaryContent />
    </Suspense>
  )
}
