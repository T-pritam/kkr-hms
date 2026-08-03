'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { DESIGNATIONS, ADVANCE_WARN_PERCENT } from '@/lib/employees/constants'
import { inr, percentOf } from '@/lib/format/currency'
import { toCsv, downloadCsv, csvFilename } from '@/lib/export/csv'
import { generateAdvanceLogPDF, monthLabel } from '@/lib/pdf/advance-log-pdf'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Users,
  Wallet,
} from 'lucide-react'

/**
 * The month-wise salary advance log.
 *
 * `GET /api/employees/advances` has existed all along and returned very nearly
 * this data — and nothing ever called it. Until now the only way to see an
 * advance was one employee, one month, behind a row click on the payroll
 * screen, which reception cannot reach.
 *
 * This is the one employee screen reception can open. It is read-only for
 * everyone: paying an advance still happens from the salary page, behind
 * `advance:write`.
 */

interface AdvanceRow {
  id: number
  employee_id: string
  amount: number | string
  date_given: string | null
  remarks: string | null
  given_by: string | null
  created_at: string | null
  employee?: {
    id: string
    employee_code: string | null
    name: string
    designation: string | null
    base_salary: number | string | null
    status: string | null
  } | null
  created_by_user?: { username?: string } | null
}

interface EmployeeSubtotal {
  employee_id: string
  employee_code: string | null
  name: string
  designation: string | null
  base_salary: number
  total: number
  count: number
}

interface Summary {
  month_year: string
  total_amount: number
  advance_count: number
  employee_count: number
  largest_advance: number
  previous_month: string
  previous_total: number
}

const thisMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default function AdvanceLogPage() {
  const [rows, setRows] = useState<AdvanceRow[]>([])
  const [byEmployee, setByEmployee] = useState<EmployeeSubtotal[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [month, setMonth] = useState(thisMonth())
  const [employeeId, setEmployeeId] = useState('')
  const [designation, setDesignation] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // The employee picker. Reception can read the register through this endpoint
  // only in aggregate — the list itself needs `employee:read`, so a failure
  // here simply leaves the filter empty rather than breaking the page.
  useEffect(() => {
    fetch('/api/employees?status=all', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(body => {
        if (body?.success) setEmployees(body.data || [])
      })
      .catch(() => {})
  }, [])

  const fetchLog = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ month_year: month })
      if (employeeId) params.set('employee_id', employeeId)
      if (designation) params.set('designation', designation)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await fetch(`/api/employees/advances?${params}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok || !body?.success) throw new Error(body?.error || 'Failed to load the advance log')

      setRows(body.data || [])
      setByEmployee(body.by_employee || [])
      setSummary(body.summary || null)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [month, employeeId, designation, from, to, debouncedSearch])

  useEffect(() => {
    void fetchLog()
  }, [fetchLog])

  useRealtimeRefetch(['advances'], fetchLog)

  /** Spelled out on the export so a printed page explains itself. */
  const activeFilters = useMemo(() => {
    const parts: string[] = []
    if (employeeId) {
      parts.push(`Employee: ${employees.find(e => e.id === employeeId)?.name ?? employeeId}`)
    }
    if (designation) parts.push(`Designation: ${designation}`)
    if (from || to) parts.push(`Dates: ${from || 'start'} to ${to || 'end'}`)
    if (debouncedSearch) parts.push(`Search: "${debouncedSearch}"`)
    return parts
  }, [employeeId, designation, from, to, debouncedSearch, employees])

  const exportCsv = () => {
    const csv = toCsv(
      rows,
      [
        { header: 'Date',        value: r => r.date_given ?? '' },
        { header: 'Code',        value: r => r.employee?.employee_code ?? '' },
        { header: 'Employee',    value: r => r.employee?.name ?? '' },
        { header: 'Designation', value: r => r.employee?.designation ?? '' },
        { header: 'Month',       value: () => month },
        { header: 'Given By',    value: r => r.given_by ?? '' },
        { header: 'Recorded By', value: r => r.created_by_user?.username ?? '' },
        { header: 'Remarks',     value: r => r.remarks ?? '' },
        { header: 'Amount',      value: r => Number(r.amount ?? 0).toFixed(2) },
      ],
      {
        footer: [['TOTAL', '', '', '', '', '', '', '', (summary?.total_amount ?? 0).toFixed(2)]],
      },
    )
    downloadCsv(csv, csvFilename('Advance_Log', month))
  }

  const exportPdf = () => {
    if (!summary) return
    generateAdvanceLogPDF({
      month_year: month,
      rows: rows as any,
      by_employee: byEmployee,
      summary,
      filters: activeFilters,
    })
  }

  const change = summary && summary.previous_total > 0
    ? Math.round(((summary.total_amount - summary.previous_total) / summary.previous_total) * 100)
    : null

  const filtering = Boolean(employeeId || designation || from || to || debouncedSearch)

  const kpis = [
    {
      label: 'Total advanced',
      value: inr(summary?.total_amount, { clamp: true }),
      hint: change === null
        ? `Nothing in ${summary ? monthLabel(summary.previous_month) : 'the previous month'}`
        : `${change >= 0 ? '+' : ''}${change}% vs ${monthLabel(summary!.previous_month)}`,
      icon: Wallet,
    },
    { label: 'Advances', value: String(summary?.advance_count ?? 0), hint: 'entries this month', icon: FileText },
    { label: 'Employees', value: String(summary?.employee_count ?? 0), hint: 'took an advance', icon: Users },
    {
      label: 'Largest single',
      value: inr(summary?.largest_advance, { clamp: true }),
      hint: 'one payment',
      icon: AlertTriangle,
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Advance Log</h1>
            <p className="text-muted">
              Every salary advance paid in {monthLabel(month)}, across all staff.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="flex-1 sm:flex-none"
            >
              <FileSpreadsheet size={18} className="mr-2" />
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={exportPdf}
              disabled={!summary}
              className="flex-1 sm:flex-none"
            >
              <Download size={18} className="mr-2" />
              PDF
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(kpi => {
            const Icon = kpi.icon
            return (
              <div key={kpi.label} className="bg-surface rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted uppercase tracking-wide">{kpi.label}</span>
                  <Icon size={16} className="text-muted shrink-0" />
                </div>
                <div className="text-xl font-bold text-foreground mt-2">{kpi.value}</div>
                <div className="text-xs text-muted mt-0.5">{kpi.hint}</div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            aria-label="Month"
          />
          <Select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">All employees</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select value={designation} onChange={e => setDesignation(e.target.value)}>
            <option value="">All designations</option>
            {DESIGNATIONS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Name, code, remark or given by"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" />
            <span className="text-muted text-sm shrink-0">to</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading advances…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {filtering
                ? 'No advances match those filters'
                : `No advances were paid in ${monthLabel(month)}`}
            </p>
          </div>
        ) : (
          <>
            {/* Who took how much — the question this screen gets opened for. */}
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">By employee</h2>
                <p className="text-xs text-muted mt-0.5">
                  Share of the month&apos;s salary already drawn.
                </p>
              </div>
              <div className="divide-y divide-border">
                {byEmployee.map(emp => {
                  const share = percentOf(emp.total, emp.base_salary)
                  const heavy = share !== null && share >= ADVANCE_WARN_PERCENT

                  return (
                    <div
                      key={emp.employee_id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">
                          {emp.name}
                          {emp.employee_code && (
                            <span className="text-xs text-muted ml-2">{emp.employee_code}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {emp.designation || '—'} · {emp.count} advance{emp.count === 1 ? '' : 's'}
                          {emp.base_salary > 0 && <> · base {inr(emp.base_salary)}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {share !== null && (
                          <Badge variant={heavy ? 'warning' : 'outline'}>
                            {Math.round(share)}% of salary
                          </Badge>
                        )}
                        <span className="text-foreground font-semibold">{inr(emp.total)}</span>
                      </div>
                    </div>
                  )
                })}
                <div className="p-4 flex items-center justify-between bg-surface-hover">
                  <span className="text-sm font-semibold text-foreground">
                    Total — {byEmployee.length} employee{byEmployee.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-foreground font-bold">
                    {inr(summary?.total_amount, { clamp: true })}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Every advance</h2>
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      {['Date', 'Employee', 'Given by', 'Remarks'].map(header => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-xs font-medium text-muted uppercase"
                        >
                          {header}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(row => (
                      <tr key={row.id} className="hover:bg-table-row-hover">
                        <td className="px-4 py-3 text-sm text-muted">{date(row.date_given)}</td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{row.employee?.name ?? '—'}</div>
                          <div className="text-xs text-muted mt-0.5">
                            {[row.employee?.employee_code, row.employee?.designation]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{row.given_by || '—'}</div>
                          <UpdatedStamp
                            by={row.created_by_user?.username}
                            at={row.created_at}
                            action="Recorded"
                            className="mt-0.5"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-muted max-w-[260px] truncate">
                          {row.remarks || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground font-medium">
                          {inr(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border">
                {rows.map(row => (
                  <div key={row.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">
                          {row.employee?.name ?? '—'}
                        </div>
                        <div className="text-xs text-muted">{date(row.date_given)}</div>
                      </div>
                      <span className="text-foreground font-semibold shrink-0">
                        {inr(row.amount)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted">Given by</div>
                        <div className="text-foreground">{row.given_by || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted">Designation</div>
                        <div className="text-foreground">{row.employee?.designation || '—'}</div>
                      </div>
                      {row.remarks && (
                        <div className="col-span-2">
                          <div className="text-muted">Remarks</div>
                          <div className="text-foreground">{row.remarks}</div>
                        </div>
                      )}
                    </div>
                    <UpdatedStamp
                      by={row.created_by_user?.username}
                      at={row.created_at}
                      action="Recorded"
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
