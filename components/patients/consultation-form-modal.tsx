'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { DoctorSelect } from '@/components/patients/doctor-select'
import { istFields, istNowFields, parseStoredInstant, toISTInstant } from '@/lib/consultations/ist'

/**
 * Adding and editing a doctor consultation.
 *
 * This was an inline form in the visits tab that pushed the table down the page whenever
 * it was open. Three things about it were wrong beyond the layout:
 *
 * The date could not be today. `getMaxDate()` subtracted a day from now, so the ceiling
 * was yesterday and a visit could never be recorded on the day it happened.
 *
 * Editing a visit moved it. The prefill read the date in UTC and the time in browser-local
 * while the write pinned IST, so saving an unchanged form rewrote the timestamp. Both ends
 * now go through `lib/consultations/ist`, which is a tested round trip.
 *
 * And `billing_id` was form state, seeded once from a prop that is null on the first
 * render. A consultation saved with a null billing is invisible to the settlement sync
 * (`settlements/sync/route.ts` filters on it), so the doctor is never paid for that visit
 * — silently. It is context, not input, so it is a prop here and read at submit.
 */

interface ConsultationFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  patientId: string
  /** Read live at submit — never copied into form state. */
  billingId: string | null
  patientJoinDate?: string
  dischargeDate?: string | null
  /** Omit to add a new consultation. */
  consultation?: any | null
}

interface FormState {
  doctor_id: string
  consultation_date: string
  consultation_time: string
  notes: string
}

const EMPTY: FormState = {
  doctor_id: '',
  consultation_date: '',
  consultation_time: '',
  notes: '',
}

/** Dates arrive as ISO or `YYYY-MM-DD`; a date input only accepts the latter. */
const dateValue = (v: unknown) => (v ? String(v).slice(0, 10) : '')

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

export function ConsultationFormModal({
  isOpen,
  onClose,
  onSuccess,
  patientId,
  billingId,
  patientJoinDate,
  dischargeDate,
  consultation,
}: ConsultationFormModalProps) {
  const mode: 'create' | 'edit' = consultation ? 'edit' : 'create'

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')

    if (consultation) {
      const { date, time } = istFields(parseStoredInstant(consultation.consultation_date))
      setForm({
        doctor_id: consultation.doctor_id || '',
        consultation_date: date,
        consultation_time: time,
        notes: consultation.notes || '',
      })
    } else {
      // Today, on the same IST clock the timestamp will be written against.
      setForm({ ...EMPTY, ...istNowFields() })
    }
  }, [isOpen, consultation])

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const { minDate, maxDate, clampedByDischarge } = useMemo(() => {
    const today = istNowFields().date
    const join = dateValue(patientJoinDate)
    const discharge = dateValue(dischargeDate)

    let min = join || undefined
    let max = discharge && discharge < today ? discharge : today

    // A legacy row may sit outside the range. A date input whose value violates min/max
    // fails constraint validation, and the symptom is a submit button that silently does
    // nothing — so widen the bounds to admit the row being edited. ISO dates sort
    // lexically, so a string compare is the right one.
    const current = form.consultation_date
    if (current) {
      if (min && current < min) min = current
      if (current > max) max = current
    }

    return { minDate: min, maxDate: max, clampedByDischarge: max === discharge }
  }, [patientJoinDate, dischargeDate, form.consultation_date])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const payload = {
        doctor_id: form.doctor_id,
        consultation_date: toISTInstant(form.consultation_date, form.consultation_time),
        notes: form.notes,
        // On edit, keep whatever the row already points at and back-fill the rows the old
        // code saved with a null.
        billing_id: mode === 'edit' ? consultation.billing_id || billingId : billingId,
      }

      const res = await fetch(
        mode === 'edit'
          ? `/api/patients/${patientId}/consultations/${consultation.id}`
          : `/api/patients/${patientId}/consultations`,
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to save the consultation')

      onSuccess()
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
      title={mode === 'edit' ? 'Edit consultation' : 'Add a consultation'}
      description="The doctor and the date are required."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="consultation-form"
            disabled={saving || !form.doctor_id || !form.consultation_date || !billingId}
          >
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {mode === 'edit' ? 'Save changes' : 'Add consultation'}
          </Button>
        </div>
      }
    >
      <form id="consultation-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/*
          First, deliberately. The modal body scrolls, so a dropdown opening near the
          bottom would be clipped by it.
        */}
        <Field id="doctor-select" label="Doctor" required>
          <DoctorSelect
            id="doctor-select"
            value={form.doctor_id}
            onChange={id => update('doctor_id', id)}
            disabled={saving}
            includeId={consultation?.doctor_id}
            fallbackLabel={consultation?.doctor?.name}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="consultation_date"
            label="Consultation date"
            required
            hint={clampedByDischarge ? `Discharged on ${maxDate}` : 'Today or earlier'}
          >
            <Input
              id="consultation_date"
              type="date"
              value={form.consultation_date}
              onChange={e => update('consultation_date', e.target.value)}
              disabled={saving}
              min={minDate}
              max={maxDate}
            />
          </Field>

          <Field id="consultation_time" label="Consultation time">
            <Input
              id="consultation_time"
              type="time"
              value={form.consultation_time}
              onChange={e => update('consultation_time', e.target.value)}
              disabled={saving}
            />
          </Field>
        </div>

        <Field id="notes" label="Notes">
          <Textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            disabled={saving}
            placeholder="Findings, advice, follow-up"
          />
        </Field>
      </form>
    </Modal>
  )
}
