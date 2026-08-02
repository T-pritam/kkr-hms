'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  DESIGNATIONS,
  EMPLOYEE_STATUSES,
  GENDERS,
  ID_PROOF_TYPES,
  RELATIONS,
} from '@/lib/employees/constants'
import type { FieldErrors } from '@/lib/case-sheet/types'
import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

/**
 * Adding and editing an employee.
 *
 * Replaces `create-employee-modal.tsx` and `edit-employee-modal.tsx`, which
 * were the same five inputs written out twice — the field markup was
 * byte-identical between them.
 *
 * The required block is exactly what it has always been: name, designation,
 * base salary and joining date. Everything added sits behind a collapsed
 * header, so the desk is no slower than it was.
 *
 * The employee code is prefilled from a *peek* at the counter. Untouched, it is
 * omitted from the request and the server allocates the real code under a row
 * lock — two people adding staff at once both see EMP/26/007 and must not both
 * get it.
 */

interface EmployeeFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (employee?: any) => void
  /** Omit to add a new employee. */
  employee?: any | null
}

interface FormState {
  employee_code: string
  name: string
  designation: string
  base_salary: string
  join_date: string
  status: string
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_relation: string
  emergency_contact_phone: string
  date_of_birth: string
  gender: string
  id_proof_type: string
  id_proof_number: string
  bank_account_no: string
  bank_ifsc: string
}

const todayLocal = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const EMPTY: FormState = {
  employee_code: '',
  name: '',
  designation: '',
  base_salary: '',
  join_date: todayLocal(),
  status: 'Active',
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  date_of_birth: '',
  gender: '',
  id_proof_type: '',
  id_proof_number: '',
  bank_account_no: '',
  bank_ifsc: '',
}

const dateValue = (v: unknown) => (v ? String(v).slice(0, 10) : '')

function toForm(employee: any): FormState {
  return {
    employee_code: employee.employee_code || '',
    name: employee.name || '',
    designation: employee.designation || '',
    base_salary: employee.base_salary == null ? '' : String(employee.base_salary),
    join_date: dateValue(employee.join_date),
    status: employee.status || 'Active',
    phone: employee.phone || '',
    address: employee.address || '',
    emergency_contact_name: employee.emergency_contact_name || '',
    emergency_contact_relation: employee.emergency_contact_relation || '',
    emergency_contact_phone: employee.emergency_contact_phone || '',
    date_of_birth: dateValue(employee.date_of_birth),
    gender: employee.gender || '',
    id_proof_type: employee.id_proof_type || '',
    id_proof_number: employee.id_proof_number || '',
    bank_account_no: employee.bank_account_no || '',
    bank_ifsc: employee.bank_ifsc || '',
  }
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** A folded-away group. The count is what stops it reading as incomplete. */
function Section({
  title,
  filled,
  total,
  open,
  onToggle,
  children,
}: {
  title: string
  filled: number
  total: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors rounded-lg"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {title}
        </span>
        <span className="text-xs text-muted shrink-0">
          {filled > 0 ? `${filled} of ${total} filled` : 'Optional'}
        </span>
      </button>
      {open && <div className="border-t border-border px-4 py-4 space-y-4">{children}</div>}
    </section>
  )
}

export function EmployeeFormModal({
  isOpen,
  onClose,
  onSuccess,
  employee,
}: EmployeeFormModalProps) {
  const mode = employee ? 'edit' : 'create'

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [codeTouched, setCodeTouched] = useState(false)

  const update = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as string]
      return next
    })
  }

  useEffect(() => {
    if (!isOpen) return

    setError('')
    setFieldErrors({})
    setOpen({})
    setCodeTouched(false)

    if (employee) {
      setForm(toForm(employee))
      // An existing code was issued once; it is never re-issued.
      setCodeTouched(true)
      return
    }

    setForm({ ...EMPTY, join_date: todayLocal() })

    // Suggest the next code. A failure is not worth blocking on — the field
    // starts blank and the server issues one anyway.
    let cancelled = false
    fetch('/api/employees/next-code', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(body => {
        if (cancelled || !body?.data?.employee_code) return
        setForm(prev =>
          prev.employee_code ? prev : { ...prev, employee_code: body.data.employee_code },
        )
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isOpen, employee])

  const filled = (...fields: (keyof FormState)[]) =>
    fields.filter(f => String(form[f] ?? '').trim() !== '').length

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})

    const payload: Record<string, any> = {
      ...form,
      base_salary: form.base_salary === '' ? null : Number(form.base_salary),
    }

    // An untouched suggestion is not a choice — drop it and let the server
    // allocate from the counter.
    if (mode === 'create' && !codeTouched) delete payload.employee_code
    if (mode === 'create') delete payload.status

    try {
      const res = await fetch(
        mode === 'edit' ? `/api/employees/${employee.id}` : '/api/employees',
        {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        },
      )

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors)
        throw new Error(body?.error || 'Failed to save the employee')
      }

      onSuccess(body?.data)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const err = (field: string) => fieldErrors[field] as string | undefined

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={mode === 'edit' ? 'Edit employee' : 'Add an employee'}
      description="Four fields are required. Everything else can be filled in later."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" disabled={saving}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {mode === 'edit' ? 'Save changes' : 'Add employee'}
          </Button>
        </div>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="rounded-lg border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Employment</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="name" label="Employee name" required error={err('name')}>
              <Input
                id="name"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                disabled={saving}
                placeholder="Full name"
                autoFocus
              />
            </Field>

            <Field
              id="employee_code"
              label="Employee code"
              error={err('employee_code')}
              hint={
                mode === 'create' && !codeTouched
                  ? 'Next available code. Change it if you need to.'
                  : undefined
              }
            >
              <Input
                id="employee_code"
                value={form.employee_code}
                onChange={e => {
                  setCodeTouched(true)
                  update('employee_code', e.target.value)
                }}
                disabled={saving}
                placeholder="EMP/26/007"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="designation" label="Designation" required error={err('designation')}>
              <Select
                id="designation"
                value={form.designation}
                onChange={e => update('designation', e.target.value)}
                disabled={saving}
              >
                <option value="">Select…</option>
                {DESIGNATIONS.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="base_salary"
              label="Base salary (monthly)"
              required
              error={err('base_salary')}
            >
              <Input
                id="base_salary"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.base_salary}
                onChange={e => update('base_salary', e.target.value)}
                disabled={saving}
                placeholder="25000"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="join_date" label="Joining date" required error={err('join_date')}>
              <Input
                id="join_date"
                type="date"
                value={form.join_date}
                onChange={e => update('join_date', e.target.value)}
                disabled={saving}
              />
            </Field>

            {mode === 'edit' && (
              <Field
                id="status"
                label="Status"
                error={err('status')}
                hint="Inactive hides them from payroll; their history is kept."
              >
                <Select
                  id="status"
                  value={form.status}
                  onChange={e => update('status', e.target.value)}
                  disabled={saving}
                >
                  {EMPLOYEE_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </section>

        <Section
          title="Contact"
          filled={filled('phone', 'address', 'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone')}
          total={5}
          open={!!open.contact}
          onToggle={() => toggle('contact')}
        >
          <Field id="phone" label="Phone" error={err('phone')}>
            <Input
              id="phone"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              disabled={saving}
              placeholder="+91 98765 43210"
              inputMode="tel"
            />
          </Field>

          <Field id="address" label="Address" error={err('address')}>
            <Textarea
              id="address"
              value={form.address}
              onChange={e => update('address', e.target.value)}
              disabled={saving}
              placeholder="House, street, city, PIN"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="emergency_contact_name"
              label="Emergency contact"
              error={err('emergency_contact_name')}
            >
              <Input
                id="emergency_contact_name"
                value={form.emergency_contact_name}
                onChange={e => update('emergency_contact_name', e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field
              id="emergency_contact_relation"
              label="Relation"
              error={err('emergency_contact_relation')}
            >
              <Select
                id="emergency_contact_relation"
                value={form.emergency_contact_relation}
                onChange={e => update('emergency_contact_relation', e.target.value)}
                disabled={saving}
              >
                <option value="">Select…</option>
                {RELATIONS.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            id="emergency_contact_phone"
            label="Emergency contact phone"
            error={err('emergency_contact_phone')}
          >
            <Input
              id="emergency_contact_phone"
              value={form.emergency_contact_phone}
              onChange={e => update('emergency_contact_phone', e.target.value)}
              disabled={saving}
              placeholder="+91 98765 43210"
              inputMode="tel"
            />
          </Field>
        </Section>

        <Section
          title="Personal"
          filled={filled('date_of_birth', 'gender', 'id_proof_type', 'id_proof_number')}
          total={4}
          open={!!open.personal}
          onToggle={() => toggle('personal')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="date_of_birth" label="Date of birth" error={err('date_of_birth')}>
              <Input
                id="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={e => update('date_of_birth', e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field id="gender" label="Gender" error={err('gender')}>
              <Select
                id="gender"
                value={form.gender}
                onChange={e => update('gender', e.target.value)}
                disabled={saving}
              >
                <option value="">Select…</option>
                {GENDERS.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="id_proof_type" label="ID proof" error={err('id_proof_type')}>
              <Select
                id="id_proof_type"
                value={form.id_proof_type}
                onChange={e => update('id_proof_type', e.target.value)}
                disabled={saving}
              >
                <option value="">Select…</option>
                {ID_PROOF_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="id_proof_number" label="Number" error={err('id_proof_number')}>
              <Input
                id="id_proof_number"
                value={form.id_proof_number}
                onChange={e => update('id_proof_number', e.target.value)}
                disabled={saving}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Payroll"
          filled={filled('bank_account_no', 'bank_ifsc')}
          total={2}
          open={!!open.payroll}
          onToggle={() => toggle('payroll')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="bank_account_no"
              label="Bank account number"
              error={err('bank_account_no')}
            >
              <Input
                id="bank_account_no"
                value={form.bank_account_no}
                onChange={e => update('bank_account_no', e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field id="bank_ifsc" label="IFSC" error={err('bank_ifsc')}>
              <Input
                id="bank_ifsc"
                value={form.bank_ifsc}
                onChange={e => update('bank_ifsc', e.target.value.toUpperCase())}
                disabled={saving}
                placeholder="HDFC0001234"
              />
            </Field>
          </div>
        </Section>
      </form>
    </Modal>
  )
}
