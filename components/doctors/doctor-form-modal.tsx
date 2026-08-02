'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { DEPARTMENTS } from '@/lib/doctors/constants'
import type { FieldErrors } from '@/lib/case-sheet/types'
import { AlertCircle, Loader2 } from 'lucide-react'

/**
 * Adding and editing a doctor.
 *
 * Replaces `create-doctor-modal.tsx` and `edit-doctor-modal.tsx`, which were
 * the same five inputs written out twice.
 *
 * Only the name is required. A referring doctor often gets added
 * mid-consultation with nothing to hand but a name, and demanding more would
 * push people into typing it into the free-text "outside doctor" box instead —
 * which is the fragmentation this registry exists to prevent.
 */

interface DoctorFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (doctor?: any) => void
  /** Omit to add a new doctor. */
  doctor?: any | null
}

export interface DoctorFormState {
  name: string
  qualification: string
  designation: string
  department: string
  specialist: string
  mobile: string
  email: string
  registration_no: string
}

export const BLANK_DOCTOR: DoctorFormState = {
  name: '',
  qualification: '',
  designation: '',
  department: '',
  specialist: '',
  mobile: '',
  email: '',
  registration_no: '',
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

/**
 * The doctor fields, laid out. Shared with the inline "add a doctor" step
 * inside the case sheet editor so the two forms cannot drift apart.
 */
export function DoctorFields({
  form,
  onChange,
  disabled,
  errors = {},
  idPrefix = '',
}: {
  form: DoctorFormState
  onChange: (patch: Partial<DoctorFormState>) => void
  disabled?: boolean
  errors?: FieldErrors
  idPrefix?: string
}) {
  const id = (field: string) => `${idPrefix}${field}`
  const err = (field: string) => errors[field] as string | undefined

  return (
    <div className="space-y-4">
      <Field id={id('name')} label="Name" required error={err('name')}>
        <Input
          id={id('name')}
          value={form.name}
          onChange={e => onChange({ name: e.target.value })}
          disabled={disabled}
          placeholder="Dr. Rajesh Kumar"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          id={id('qualification')}
          label="Qualification"
          error={err('qualification')}
          hint="Printed under the name on discharge summaries"
        >
          <Input
            id={id('qualification')}
            value={form.qualification}
            onChange={e => onChange({ qualification: e.target.value })}
            disabled={disabled}
            placeholder="MBBS, MD (Gen. Med.)"
          />
        </Field>

        <Field id={id('designation')} label="Designation" error={err('designation')}>
          <Input
            id={id('designation')}
            value={form.designation}
            onChange={e => onChange({ designation: e.target.value })}
            disabled={disabled}
            placeholder="Senior Consultant"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={id('department')} label="Department" error={err('department')}>
          <Select
            id={id('department')}
            value={form.department}
            onChange={e => onChange({ department: e.target.value })}
            disabled={disabled}
          >
            <option value="">Select…</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id={id('specialist')}
          label="Specialist"
          error={err('specialist')}
          hint="The finer-grained label, if there is one"
        >
          <Input
            id={id('specialist')}
            value={form.specialist}
            onChange={e => onChange({ specialist: e.target.value })}
            disabled={disabled}
            placeholder="Interventional Cardiology"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id={id('mobile')} label="Mobile" error={err('mobile')}>
          <Input
            id={id('mobile')}
            value={form.mobile}
            onChange={e => onChange({ mobile: e.target.value })}
            disabled={disabled}
            placeholder="+91 98765 43210"
            inputMode="tel"
          />
        </Field>

        <Field id={id('email')} label="Email" error={err('email')}>
          <Input
            id={id('email')}
            type="email"
            value={form.email}
            onChange={e => onChange({ email: e.target.value })}
            disabled={disabled}
            placeholder="name@example.com"
          />
        </Field>
      </div>

      <Field
        id={id('registration_no')}
        label="Medical registration number"
        error={err('registration_no')}
      >
        <Input
          id={id('registration_no')}
          value={form.registration_no}
          onChange={e => onChange({ registration_no: e.target.value })}
          disabled={disabled}
          placeholder="State medical council number"
        />
      </Field>
    </div>
  )
}

export function DoctorFormModal({ isOpen, onClose, onSuccess, doctor }: DoctorFormModalProps) {
  const mode = doctor ? 'edit' : 'create'

  const [form, setForm] = useState<DoctorFormState>(BLANK_DOCTOR)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (!isOpen) return

    setError('')
    setFieldErrors({})

    if (doctor) {
      setForm({
        name: doctor.name || '',
        qualification: doctor.qualification || '',
        designation: doctor.designation || '',
        department: doctor.department || '',
        specialist: doctor.specialist || '',
        mobile: doctor.mobile || '',
        email: doctor.email || '',
        registration_no: doctor.registration_no || '',
      })
      setIsActive(doctor.is_active !== false)
    } else {
      setForm(BLANK_DOCTOR)
      setIsActive(true)
    }
  }, [isOpen, doctor])

  const change = (patch: Partial<DoctorFormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
    setFieldErrors(prev => {
      const keys = Object.keys(patch)
      if (!keys.some(k => k in prev)) return prev
      const next = { ...prev }
      for (const k of keys) delete next[k]
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})

    try {
      const res = await fetch(
        mode === 'edit' ? `/api/doctors/${doctor.id}` : '/api/doctors',
        {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mode === 'edit' ? { ...form, is_active: isActive } : form),
        },
      )

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors)
        throw new Error(body?.error || 'Failed to save the doctor')
      }

      onSuccess(body?.doctor)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={mode === 'edit' ? 'Edit doctor' : 'Add a doctor'}
      description="Only the name is required."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="doctor-form" disabled={saving || !form.name.trim()}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {mode === 'edit' ? 'Save changes' : 'Add doctor'}
          </Button>
        </div>
      }
    >
      <form id="doctor-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DoctorFields
          form={form}
          onChange={change}
          disabled={saving}
          errors={fieldErrors}
        />

        {mode === 'edit' && (
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              disabled={saving}
              className="mt-0.5 h-4 w-4 rounded border-input-border accent-primary"
            />
            <span className="text-sm">
              <span className="font-medium text-foreground">Active</span>
              <span className="block text-xs text-muted mt-0.5">
                Inactive doctors are hidden from every picker. Consultations, lab orders and
                discharge summaries that already name them are unaffected.
              </span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  )
}
