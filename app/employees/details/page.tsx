'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { TablePagination } from '@/components/ui/table-pagination'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { EmployeeFormModal } from '@/components/employees/employee-form-modal'
import { EmployeeDetailsModal } from '@/components/employees/employee-details-modal'
import { ImportEmployeeModal } from '@/components/employees/import-employee-modal'
import {
  DESIGNATIONS,
  EMPLOYEE_SORTS,
  STATUS_VARIANTS,
  type EmployeeStatus,
} from '@/lib/employees/constants'
import { inr } from '@/lib/format/currency'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Edit,
  Plus,
  Search,
  Trash2,
  Upload,
  Undo2,
} from 'lucide-react'

/**
 * The employee register.
 *
 * Rebuilt onto the house shell. Two behavioural fixes beyond the styling:
 *
 *   - **Search and paging moved to the server.** The old page fetched the whole
 *     table on every keystroke and filtered and sliced it in the browser.
 *   - **Inactive employees are reachable.** Deleting sets status to Inactive,
 *     but the page hardcoded `?status=Active`, so a deactivated employee
 *     vanished and could never be restored through the UI. The status filter is
 *     what makes the existing soft delete reversible.
 */

interface Employee {
  id: string
  employee_code: string | null
  name: string
  designation: string | null
  base_salary: number | string | null
  join_date: string | null
  status: EmployeeStatus
  phone: string | null
  updated_at: string | null
  updated_by_user?: { username?: string } | null
}

type SortKey = keyof typeof EMPLOYEE_SORTS

const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default function EmployeeDetailsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('Active')
  const [designation, setDesignation] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ employee: Employee; activate: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status,
        sort,
        dir,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (designation) params.set('designation', designation)

      const res = await fetch(`/api/employees?${params}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok || !body?.success) throw new Error(body?.error || 'Failed to load employees')

      setEmployees(body.data || [])
      setTotal(body.total || 0)
      setTotalPages(body.totalPages || 0)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, status, designation, sort, dir, debouncedSearch])

  useEffect(() => {
    void fetchEmployees()
  }, [fetchEmployees])

  useRealtimeRefetch(['employees'], fetchEmployees)

  const sortBy = (key: SortKey) => {
    if (sort === key) {
      setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setDir('asc')
    }
    setPage(1)
  }

  /** Deactivate, or bring one back. DELETE is the soft delete; PUT restores. */
  const applyStatus = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      const res = confirm.activate
        ? await fetch(`/api/employees/${confirm.employee.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'Active' }),
          })
        : await fetch(`/api/employees/${confirm.employee.id}`, {
            method: 'DELETE',
            credentials: 'include',
          })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to update the employee')

      await fetchEmployees()
      setConfirm(null)
    } catch (err: any) {
      setError(err.message)
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const filtering = Boolean(debouncedSearch || designation || status !== 'Active')

  const SortHeader = ({ label, keyName }: { label: string; keyName: SortKey }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
      <button
        type="button"
        onClick={() => sortBy(keyName)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase"
      >
        {label}
        {sort === keyName && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )

  const actionsFor = (employee: Employee) => (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={e => {
          e.stopPropagation()
          setEditing(employee)
          setFormOpen(true)
        }}
        title="Edit"
      >
        <Edit size={16} />
      </Button>
      {employee.status === 'Active' ? (
        <Button
          size="sm"
          variant="destructive"
          onClick={e => {
            e.stopPropagation()
            setConfirm({ employee, activate: false })
          }}
          title="Deactivate"
        >
          <Trash2 size={16} />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="success"
          onClick={e => {
            e.stopPropagation()
            setConfirm({ employee, activate: true })
          }}
          title="Reactivate"
        >
          <Undo2 size={16} />
        </Button>
      )}
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Employees</h1>
            <p className="text-muted">{total} on the register</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none">
              <Upload size={18} className="mr-2" />
              Import
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
              className="flex-1 sm:flex-none"
            >
              <Plus size={18} className="mr-2" />
              Add Employee
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by name, code, designation or phone"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={status}
            onChange={e => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <Select
            value={designation}
            onChange={e => {
              setDesignation(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All designations</option>
            {DESIGNATIONS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading employees…</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {filtering ? 'No employees match those filters' : 'No employees yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      <SortHeader label="Code" keyName="employee_code" />
                      <SortHeader label="Name" keyName="name" />
                      <SortHeader label="Designation" keyName="designation" />
                      <SortHeader label="Base salary" keyName="base_salary" />
                      <SortHeader label="Joined" keyName="join_date" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employees.map(employee => (
                      <tr
                        key={employee.id}
                        className="hover:bg-table-row-hover cursor-pointer"
                        onClick={() => setViewingId(employee.id)}
                      >
                        <td className="px-4 py-3 text-info font-medium">
                          {employee.employee_code || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{employee.name}</div>
                          {employee.phone && (
                            <div className="text-xs text-muted mt-0.5">{employee.phone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {employee.designation || '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground">{inr(employee.base_salary)}</td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {date(employee.join_date)}
                          <UpdatedStamp
                            by={employee.updated_by_user?.username}
                            at={employee.updated_at}
                            className="mt-0.5"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANTS[employee.status] ?? 'outline'}>
                            {employee.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{actionsFor(employee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border">
                {employees.map(employee => (
                  <div
                    key={employee.id}
                    className="p-4 space-y-3 cursor-pointer hover:bg-table-row-hover"
                    onClick={() => setViewingId(employee.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-info text-xs font-medium">
                          {employee.employee_code || '—'}
                        </div>
                        <div className="text-foreground font-medium truncate">{employee.name}</div>
                      </div>
                      <Badge variant={STATUS_VARIANTS[employee.status] ?? 'outline'}>
                        {employee.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted">Designation</div>
                        <div className="text-foreground">{employee.designation || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted">Base salary</div>
                        <div className="text-foreground">{inr(employee.base_salary)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-muted">Joined</div>
                        <div className="text-foreground">{date(employee.join_date)}</div>
                        <UpdatedStamp
                          by={employee.updated_by_user?.username}
                          at={employee.updated_at}
                        />
                      </div>
                    </div>
                    {actionsFor(employee)}
                  </div>
                ))}
              </div>
            </div>

            <TablePagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={setPage}
              onPageSizeChange={size => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </>
        )}
      </div>

      <EmployeeFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSuccess={fetchEmployees}
        employee={editing}
      />

      <EmployeeDetailsModal
        isOpen={!!viewingId}
        onClose={() => setViewingId(null)}
        employeeId={viewingId}
        onEdit={employee => {
          setViewingId(null)
          setEditing(employee)
          setFormOpen(true)
        }}
      />

      <ImportEmployeeModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={fetchEmployees}
      />

      <Modal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={
          confirm?.activate
            ? `Reactivate ${confirm.employee.name}?`
            : `Deactivate ${confirm?.employee.name ?? 'employee'}?`
        }
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={confirm?.activate ? 'default' : 'destructive'}
              onClick={applyStatus}
              disabled={busy}
            >
              {confirm?.activate ? 'Reactivate' : 'Deactivate'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          {confirm?.activate
            ? 'They will appear on the register and in payroll again.'
            : 'They drop off payroll and the active register. Their salary and advance history is kept, and you can bring them back from the Inactive filter.'}
        </p>
      </Modal>
    </DashboardLayout>
  )
}
