'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ReferralSelect } from './referral-select'
import {
  BLOOD_GROUPS,
  GENDERS,
  ID_PROOF_TYPES,
  PATIENT_STATUSES,
  RELATIONS,
  STATUS_HINTS,
} from '@/lib/patients/constants'
import { resolveAge } from '@/lib/patients/age'
import type { FieldErrors } from '@/lib/case-sheet/types'
import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

/**
 * Registering and editing a patient.
 *
 * Replaces two ~300-line modals that were 95% the same file, right down to a
 * duplicated `getTodayDate()` helper that the edit copy never called.
 *
 * The shape of the form is the point. The user's constraint was that a walk-in
 * has to be registered in seconds, so the four required fields sit in one
 * always-open block at the top and everything else is folded away behind
 * headers that show how much is filled in — hidden, but visibly hidden, so
 * nobody has to wonder whether the form has more to it.
 *
 * Two deliberate behaviours worth not undoing:
 *
 *   * Gender has no preselected value. The old form defaulted to Male and never
 *     enforced the asterisk, so an unanswered question was recorded as a fact
 *     and printed on every document.
 *   * The patient ID is prefilled from a *peek* at the counter. Leaving it
 *     untouched sends nothing, and the server allocates the real number under a
 *     row lock. Two people registering at once both see the same suggestion and
 *     must not both get it.
 */

type Mode = 'create' | 'edit'

interface PatientFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (patient?: any) => void
  /** Omit to register a new patient. */
  patient?: any | null
}

interface FormState {
  patient_id: string
  name: string
  gender: string
  phone: string
  date_of_join: string
  referred_by: string
  date_of_birth: string
  age_years: string
  blood_group: string
  alternate_phone: string
  email: string
  address: string
  emergency_contact_name: string
  emergency_contact_relation: string
  emergency_contact_phone: string
  id_proof_type: string
  id_proof_number: string
  medical_history: string
  allergies: string
  current_medications: string
  status: string
}

const todayLocal = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const EMPTY: FormState = {
  patient_id: '',
  name: '',
  gender: '',
  phone: '',
  date_of_join: todayLocal(),
  referred_by: '',
  date_of_birth: '',
  age_years: '',
  blood_group: '',
  alternate_phone: '',
  email: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  id_proof_type: '',
  id_proof_number: '',
  medical_history: '',
  allergies: '',
  current_medications: '',
  status: 'Active',
}

/** Dates arrive as ISO or `YYYY-MM-DD`; a date input only accepts the latter. */
const dateValue = (v: unknown) => (v ? String(v).slice(0, 10) : '')

function toForm(patient: any): FormState {
  return {
    patient_id: patient.patient_id || '',
    name: patient.name || '',
    gender: patient.gender || '',
    phone: patient.phone || '',
    date_of_join: dateValue(patient.date_of_join),
    referred_by: patient.referred_by || '',
    date_of_birth: dateValue(patient.date_of_birth),
    age_years: patient.age_years == null ? '' : String(patient.age_years),
    blood_group: patient.blood_group || '',
    alternate_phone: patient.alternate_phone || '',
    email: patient.email || '',
    address: patient.address || '',
    emergency_contact_name: patient.emergency_contact_name || '',
    emergency_contact_relation: patient.emergency_contact_relation || '',
    emergency_contact_phone: patient.emergency_contact_phone || '',
    id_proof_type: patient.id_proof_type || '',
    id_proof_number: patient.id_proof_number || '',
    medical_history: patient.medical_history || '',
    allergies: patient.allergies || '',
    current_medications: patient.current_medications || '',
    status: patient.status || 'Active',
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

/**
 * A folded-away group of optional fields.
 *
 * The count in the header is what stops this reading as "the form is
 * incomplete": you can see at a glance that three of six emergency-contact
 * fields are filled without opening anything.
 */
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

export function PatientFormModal({
  isOpen,
  onClose,
  onSuccess,
  patient,
}: PatientFormModalProps) {
  const mode: Mode = patient ? 'edit' : 'create'

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  /**
   * Whether the patient ID box has been edited.
   *
   * False means "let the server issue one" — the value on screen is only a
   * preview. Never send it back as though the user had chosen it.
   */
  const [idTouched, setIdTouched] = useState(false)

  const set = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }))

  const clearError = (field: string) =>
    setFieldErrors(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })

  const update = useCallback((field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as string]
      return next
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return

    setError('')
    setFieldErrors({})
    setOpen({})
    setIdTouched(false)

    if (patient) {
      setForm(toForm(patient))
      // An existing ID was chosen by somebody; it is never re-issued.
      setIdTouched(true)
      return
    }

    setForm({ ...EMPTY, date_of_join: todayLocal() })

    // Suggest the next number. A failure here is not worth blocking
    // registration over — the field simply starts blank and the server issues
    // one anyway.
    let cancelled = false
    fetch('/api/patients/next-id')
      .then(res => (res.ok ? res.json() : null))
      .then(body => {
        if (cancelled || !body?.data?.patient_id) return
        setForm(prev => (prev.patient_id ? prev : { ...prev, patient_id: body.data.patient_id }))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isOpen, patient])

  /**
   * A date of birth is exact and a stated age is not, so the two never both
   * apply. Entering a birth date wins and the age box becomes a read-only
   * derivation of it.
   */
  const derivedAge = useMemo(() => {
    if (!form.date_of_birth) return null
    return resolveAge({ date_of_birth: form.date_of_birth })
  }, [form.date_of_birth])

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
      age_years: form.date_of_birth ? null : form.age_years === '' ? null : Number(form.age_years),
    }

    // An untouched suggestion is not a choice. Dropping it lets the server
    // allocate from the counter instead of trusting a value two people may be
    // looking at simultaneously.
    if (mode === 'create' && !idTouched) {
      delete payload.patient_id
    }

    // Status is not on the create form; it is always Active to begin with.
    if (mode === 'create') delete payload.status

    try {
      const res = await fetch(
        mode === 'edit' ? `/api/patients/${patient.id}` : '/api/patients',
        {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors)
        throw new Error(body?.error || 'Failed to save the patient')
      }

      onSuccess(body?.patient)
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
      title={mode === 'edit' ? 'Edit patient' : 'Register a patient'}
      description={
        mode === 'edit'
          ? 'Only the four starred fields are required.'
          : 'Four fields are required. Everything else can be filled in later.'
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="patient-form" disabled={saving}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {mode === 'edit' ? 'Save changes' : 'Register patient'}
          </Button>
        </div>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* The only block that has to be filled in to save. */}
        <section className="rounded-lg border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Registration</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="name"
              label="Patient name"
              required
              error={err('name')}
            >
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
              id="patient_id"
              label="Patient ID"
              required
              error={err('patient_id')}
              hint={
                mode === 'create' && !idTouched
                  ? 'Next available number. Change it if you need to.'
                  : undefined
              }
            >
              <Input
                id="patient_id"
                value={form.patient_id}
                onChange={e => {
                  setIdTouched(true)
                  update('patient_id', e.target.value)
                }}
                disabled={saving}
                placeholder="e.g. 5/26"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="gender" label="Gender" required error={err('gender')}>
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

            <Field id="phone" label="Phone" required error={err('phone')}>
              <Input
                id="phone"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                disabled={saving}
                placeholder="9876543210"
                inputMode="tel"
                max={10}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="date_of_join" label="Date of joining" error={err('date_of_join')}>
              <Input
                id="date_of_join"
                type="date"
                value={form.date_of_join}
                onChange={e => update('date_of_join', e.target.value)}
                disabled={saving}
              />
            </Field>

            <div className="space-y-1.5">
              <ReferralSelect
                value={form.referred_by}
                onChange={value => {
                  set({ referred_by: value })
                  clearError('referred_by')
                }}
                disabled={saving}
              />
            </div>
          </div>

          {mode === 'edit' && (
            <Field
              id="status"
              label="Status"
              error={err('status')}
              hint={STATUS_HINTS[form.status as keyof typeof STATUS_HINTS]}
            >
              <Select
                id="status"
                value={form.status}
                onChange={e => update('status', e.target.value)}
                disabled={saving}
              >
                {PATIENT_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </section>

        <Section
          title="Personal details"
          filled={filled('date_of_birth', 'age_years', 'blood_group', 'alternate_phone', 'email', 'address')}
          total={6}
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

            <Field
              id="age_years"
              label="Age"
              error={err('age_years')}
              hint={
                derivedAge
                  ? `${derivedAge.years} years, from the date of birth`
                  : 'Use this when the date of birth is not known'
              }
            >
              <Input
                id="age_years"
                type="number"
                min={0}
                max={130}
                value={derivedAge ? String(derivedAge.years) : form.age_years}
                onChange={e => update('age_years', e.target.value)}
                disabled={saving || !!derivedAge}
                placeholder="45"
                inputMode="numeric"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="blood_group" label="Blood group" error={err('blood_group')}>
              <Select
                id="blood_group"
                value={form.blood_group}
                onChange={e => update('blood_group', e.target.value)}
                disabled={saving}
              >
                <option value="">Select…</option>
                {BLOOD_GROUPS.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="alternate_phone" label="Alternate phone" error={err('alternate_phone')}>
              <Input
                id="alternate_phone"
                value={form.alternate_phone}
                onChange={e => update('alternate_phone', e.target.value)}
                disabled={saving}
                placeholder="+91 98765 43210"
                inputMode="tel"
              />
            </Field>
          </div>

          <Field id="email" label="Email" error={err('email')}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              disabled={saving}
              placeholder="name@example.com"
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
        </Section>

        <Section
          title="Emergency contact"
          filled={filled('emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone')}
          total={3}
          open={!!open.emergency}
          onToggle={() => toggle('emergency')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="emergency_contact_name"
              label="Name"
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
            label="Phone"
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
          title="Identification"
          filled={filled('id_proof_type', 'id_proof_number')}
          total={2}
          open={!!open.identification}
          onToggle={() => toggle('identification')}
        >
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
          title="Medical information"
          filled={filled('medical_history', 'allergies', 'current_medications')}
          total={3}
          open={!!open.medical}
          onToggle={() => toggle('medical')}
        >
          <Field id="medical_history" label="Medical history" error={err('medical_history')}>
            <Textarea
              id="medical_history"
              value={form.medical_history}
              onChange={e => update('medical_history', e.target.value)}
              disabled={saving}
              placeholder="Existing conditions, past surgeries"
            />
          </Field>

          <Field id="allergies" label="Allergies" error={err('allergies')}>
            <Textarea
              id="allergies"
              value={form.allergies}
              onChange={e => update('allergies', e.target.value)}
              disabled={saving}
              placeholder="Drug and other known allergies"
            />
          </Field>

          <Field
            id="current_medications"
            label="Current medications"
            error={err('current_medications')}
          >
            <Textarea
              id="current_medications"
              value={form.current_medications}
              onChange={e => update('current_medications', e.target.value)}
              disabled={saving}
              placeholder="What the patient is already taking"
            />
          </Field>
        </Section>
      </form>
    </Modal>
  )
}
