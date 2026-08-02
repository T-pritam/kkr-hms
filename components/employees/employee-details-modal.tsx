'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import {
  STATUS_VARIANTS,
  SALARY_STATUS_LABELS,
  SALARY_STATUS_VARIANTS,
  type EmployeeStatus,
  type SalaryStatus,
} from '@/lib/employees/constants'
import { inr } from '@/lib/format/currency'
import { downloadPayslip } from '@/lib/pdf/payslip-pdf'
import { AlertTriangle, Download, Loader2 } from 'lucide-react'

/**
 * One employee's whole record.
 *
 * There was no such screen. Nothing in the app rendered a single employee, and
 * the one per-employee drill-down — the salary details modal — showed neither
 * designation, nor joining date, nor whether they still work here.
 *
 * Three things in one place: the record, the salary history, and the advance
 * history, with a payslip download against each month.
 */

interface EmployeeDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string | null
  onEdit?: (employee: any) => void
}

interface SalaryRow {
  id: number
  month_year: string
  base_salary: number | string
  days_present: number | null
  ot_days: number | null
  calculated_salary: number | string | null
  total_advance: number | string | null
  final_salary: number | string | null
  status: string | null
  settled_on: string | null
}

interface AdvanceRow {
  id: number
  amount: number | string
  date_given: string | null
  month_year: string
  remarks: string | null
  given_by: string | null
  created_at: string | null
  created_by_user?: { username?: string } | null
}

const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="text-sm text-foreground font-medium text-right min-w-0 break-words">
        {children}
      </span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">{children}</div>
    </section>
  )
}

export function EmployeeDetailsModal({
  isOpen,
  onClose,
  employeeId,
  onEdit,
}: EmployeeDetailsModalProps) {
  const [employee, setEmployee] = useState<any>(null)
  const [salaries, setSalaries] = useState<SalaryRow[]>([])
  const [advances, setAdvances] = useState<AdvanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!employeeId) return
    try {
      setLoading(true)

      const res = await fetch(`/api/employees/${employeeId}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.success) throw new Error(body?.error || 'Failed to load the employee')

      setEmployee(body.data)

      // Every salary month and every advance in one request. A failure here
      // leaves the record on screen without its history rather than blanking
      // the modal — the record is the part that has to render.
      const historyRes = await fetch(`/api/employees/${employeeId}/history`, {
        credentials: 'include',
      })
      const history = await historyRes.json().catch(() => ({}))

      if (historyRes.ok && history?.success) {
        setSalaries(history.data.salaries || [])
        setAdvances(history.data.advances || [])
      }

      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    if (!isOpen) return
    setSalaries([])
    setAdvances([])
    void load()
  }, [isOpen, load])

  const download = async (monthYear: string) => {
    if (!employeeId) return
    setDownloading(monthYear)
    try {
      await downloadPayslip(employeeId, monthYear)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDownloading(null)
    }
  }

  const status = (employee?.status || 'Active') as EmployeeStatus

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={employee?.name || 'Employee'}
      description={
        employee
          ? [employee.employee_code, employee.designation].filter(Boolean).join(' · ')
          : undefined
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit && employee && (
            <Button onClick={() => onEdit(employee)}>Edit</Button>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="mt-2 text-muted">Loading…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {employee && (
            <>
              <Block title="Employment">
                <Row label="Name">{employee.name || '—'}</Row>
                <Row label="Code">{employee.employee_code || '—'}</Row>
                <Row label="Designation">{employee.designation || '—'}</Row>
                <Row label="Base salary">{inr(employee.base_salary)}</Row>
                <Row label="Joined">{date(employee.join_date)}</Row>
                <Row label="Status">
                  <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>{status}</Badge>
                </Row>
              </Block>

              <Block title="Contact">
                <Row label="Phone">{employee.phone || '—'}</Row>
                <Row label="Emergency contact">
                  {[employee.emergency_contact_name, employee.emergency_contact_relation]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Row>
                <Row label="Emergency phone">{employee.emergency_contact_phone || '—'}</Row>
                <div className="md:col-span-2">
                  <Row label="Address">{employee.address || '—'}</Row>
                </div>
              </Block>

              <Block title="Personal">
                <Row label="Date of birth">{date(employee.date_of_birth)}</Row>
                <Row label="Gender">{employee.gender || '—'}</Row>
                <Row label="ID proof">
                  {employee.id_proof_type
                    ? [employee.id_proof_type, employee.id_proof_number].filter(Boolean).join(' · ')
                    : '—'}
                </Row>
              </Block>

              <Block title="Payroll">
                <Row label="Bank account">{employee.bank_account_no || '—'}</Row>
                <Row label="IFSC">{employee.bank_ifsc || '—'}</Row>
              </Block>

              {salaries.length > 0 && (
                <section className="rounded-lg border border-border overflow-hidden">
                  <h3 className="text-sm font-semibold text-foreground px-4 py-3 border-b border-border">
                    Salary history
                  </h3>
                  <div className="divide-y divide-border">
                    {salaries.map(row => (
                      <div
                        key={row.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-foreground font-medium">{row.month_year}</div>
                          <div className="text-xs text-muted mt-0.5">
                            {row.days_present ?? '—'} days
                            {row.ot_days ? ` + ${row.ot_days} OT` : ''} · advances{' '}
                            {inr(row.total_advance)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge
                            variant={
                              SALARY_STATUS_VARIANTS[(row.status || 'pending') as SalaryStatus] ??
                              'outline'
                            }
                          >
                            {SALARY_STATUS_LABELS[(row.status || 'pending') as SalaryStatus] ??
                              row.status}
                          </Badge>
                          <span className="text-sm font-semibold text-foreground">
                            {inr(row.final_salary)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => download(row.month_year)}
                            disabled={downloading === row.month_year}
                            title="Download payslip"
                          >
                            {downloading === row.month_year ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {advances.length > 0 && (
                <section className="rounded-lg border border-border overflow-hidden">
                  <h3 className="text-sm font-semibold text-foreground px-4 py-3 border-b border-border">
                    Advance history
                  </h3>
                  <div className="divide-y divide-border">
                    {advances.map(adv => (
                      <div key={adv.id} className="p-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-foreground">{date(adv.date_given)}</div>
                          <div className="text-xs text-muted mt-0.5">
                            {adv.month_year}
                            {adv.given_by ? ` · given by ${adv.given_by}` : ''}
                            {adv.remarks ? ` · ${adv.remarks}` : ''}
                          </div>
                          <UpdatedStamp
                            by={adv.created_by_user?.username}
                            at={adv.created_at}
                            action="Recorded"
                          />
                        </div>
                        <span className="text-sm font-semibold text-foreground shrink-0">
                          {inr(adv.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                <UpdatedStamp
                  by={employee.created_by_user?.username}
                  at={employee.created_at}
                  action="Added"
                />
                <UpdatedStamp
                  by={employee.updated_by_user?.username}
                  at={employee.updated_at}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
