'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DoctorSelect } from '@/components/patients/doctor-select'
import { istFields, istNowFields, parseStoredInstant, toISTInstant } from '@/lib/consultations/ist'
import { TimeInput } from '@/components/ui/time-input'

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
 *
 * **Purpose** was added with 20260808000005 and stays required: settlement groups on it,
 * so a visit without one falls into an unpriced bucket with every other purposeless
 * visit. A **fee** field briefly lived here too, but pricing has moved to settle time —
 * this form's job is to record what happened and who was involved, not what it costs.
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
  visit_purpose_id: string
  consultation_date: string
  consultation_time: string
  notes: string
  /** Create only: one visit, or one a day across a range (client, 28 Sep). */
  several: boolean
  to_date: string
  include_last: boolean
  /** Days in the range the desk unticked in the preview. */
  skipped: string[]
}

const EMPTY: FormState = {
  doctor_id: '',
  visit_purpose_id: '',
  consultation_date: '',
  consultation_time: '',
  notes: '',
  several: false,
  to_date: '',
  include_last: true,
  skipped: [],
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** Every day from `from` to `to`, the last one only if asked; at most 90. */
function rangeOf(from: string, to: string, includeLast: boolean): string[] {
  if (!from || !to || to < from) return []
  const days: string[] = []
  for (let d = from; d <= to && days.length < 91; d = nextDay(d)) days.push(d)
  return includeLast ? days : days.slice(0, -1)
}

/** "14:05" → "2:05 PM", the way the time picker shows it. */
const formatTime12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })

interface VisitPurpose {
  id: string
  code: string
  name: string
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
  const [purposes, setPurposes] = useState<VisitPurpose[]>([])

  useEffect(() => {
    if (!isOpen) return
    setError('')

    if (consultation) {
      const { date, time } = istFields(parseStoredInstant(consultation.consultation_date))
      setForm({
        ...EMPTY,
        doctor_id: consultation.doctor_id || '',
        visit_purpose_id: consultation.visit_purpose_id || '',
        consultation_date: date,
        consultation_time: time,
        notes: consultation.notes || '',
      })
    } else {
      // Today and now, on the same IST clock the timestamp will be written
      // against. (This spread the helper's { date, time } straight in, which
      // set no form field at all: every new visit opened blank, and one saved
      // without a time was stored at midnight. Fixed 2026-09-26.)
      // A patient discharged before today gets no date: the desk picks one inside
      // the stay, rather than the form offering a day after discharge.
      const now = istNowFields()
      const discharge = dateValue(dischargeDate)
      const date = discharge && now.date > discharge ? '' : now.date
      setForm({ ...EMPTY, consultation_date: date, consultation_time: now.time })
    }
  }, [isOpen, consultation, dischargeDate])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/visit-purposes')
        const json = await res.json()
        if (!cancelled && res.ok) setPurposes(json.visitPurposes || [])
      } catch (err) {
        if (!cancelled) console.error('Failed to load visit purposes:', err)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [isOpen])

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

  /**
   * Several days: every day of the range, each marked with why it can't be a
   * visit (before joining, after discharge, in the future) or ticked/unticked
   * by the desk.
   */
  const preview = useMemo(() => {
    if (!form.several) return []
    const join = dateValue(patientJoinDate)
    const discharge = dateValue(dischargeDate)
    const today = istNowFields().date
    return rangeOf(form.consultation_date, form.to_date, form.include_last).map(day => {
      const blocked =
        join && day < join ? 'before joining'
          : discharge && day > discharge ? 'after discharge'
            : day > today ? 'in the future'
              : null
      return { day, blocked, picked: !blocked && !form.skipped.includes(day) }
    })
  }, [form.several, form.consultation_date, form.to_date, form.include_last, form.skipped, patientJoinDate, dischargeDate])
  const pickedDays = preview.filter(p => p.picked).map(p => p.day)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const several = mode === 'create' && form.several
      const payload = {
        doctor_id: form.doctor_id,
        visit_purpose_id: form.visit_purpose_id,
        ...(several
          ? { consultation_dates: pickedDays.map(day => toISTInstant(day, form.consultation_time)) }
          : { consultation_date: toISTInstant(form.consultation_date, form.consultation_time) }),
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
      description="The doctor, the purpose and the date are required. Pricing is set later, when the visit is settled."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="consultation-form"
            disabled={
              saving ||
              !form.doctor_id ||
              !form.visit_purpose_id ||
              !form.consultation_date ||
              (form.several && pickedDays.length === 0) ||
              !billingId
            }
          >
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {mode === 'edit'
              ? 'Save changes'
              : form.several
                ? `Add ${pickedDays.length} visit${pickedDays.length === 1 ? '' : 's'}`
                : 'Add consultation'}
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

        <Field
          id="visit_purpose"
          label="Purpose of visit"
          required
          hint="The doctor is settled separately for each purpose."
        >
          <Select
            id="visit_purpose"
            value={form.visit_purpose_id}
            onChange={e => update('visit_purpose_id', e.target.value)}
            disabled={saving}
          >
            <option value="">Select…</option>
            {purposes.map(purpose => (
              <option key={purpose.id} value={purpose.id}>
                {purpose.name}
              </option>
            ))}
          </Select>
        </Field>

        {mode === 'create' && (
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {([false, true] as const).map(v => (
              <button
                key={String(v)}
                type="button"
                onClick={() => update('several', v)}
                disabled={saving}
                className={`px-3 py-1.5 text-sm ${form.several === v ? 'bg-info text-foreground' : 'bg-surface-inset text-muted hover:text-foreground'}`}
              >
                {v ? 'Several days' : 'One day'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="consultation_date"
            label={form.several ? 'From' : 'Consultation date'}
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

          {form.several ? (
            <Field id="to_date" label="To" required>
              <Input
                id="to_date"
                type="date"
                value={form.to_date}
                onChange={e => update('to_date', e.target.value)}
                disabled={saving}
                min={form.consultation_date || minDate}
                max={maxDate}
              />
            </Field>
          ) : (
            <Field id="consultation_time" label="Consultation time">
              <TimeInput
                id="consultation_time"
                value={form.consultation_time}
                onChange={value => update('consultation_time', value)}
                disabled={saving}
              />
            </Field>
          )}
        </div>

        {form.several && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <Field id="consultation_time" label="Time, each day">
                <TimeInput
                  id="consultation_time"
                  value={form.consultation_time}
                  onChange={value => update('consultation_time', value)}
                  disabled={saving}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-foreground pb-2.5">
                <input
                  type="checkbox"
                  checked={form.include_last}
                  onChange={e => update('include_last', e.target.checked)}
                  disabled={saving}
                />
                Include last date as well
              </label>
            </div>

            {/* What will be added, before it is — untick any day to leave it out. */}
            <div className="rounded-lg border border-border bg-surface-inset p-3 space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                {preview.length === 0
                  ? 'Pick the From and To dates'
                  : `These visits will be added (${pickedDays.length})`}
              </p>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {preview.map(({ day, blocked, picked }) => (
                  <label
                    key={day}
                    className={`flex items-center gap-2 text-sm ${blocked ? 'text-muted' : 'text-foreground'}`}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={saving || Boolean(blocked)}
                      onChange={e =>
                        update(
                          'skipped',
                          e.target.checked ? form.skipped.filter(d => d !== day) : [...form.skipped, day],
                        )
                      }
                    />
                    <span className="w-40">{dayLabel(day)}</span>
                    <span className="text-muted">{form.consultation_time ? formatTime12(form.consultation_time) : 'no time'}</span>
                    {blocked && <span className="text-xs text-warning-text">— {blocked}</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

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
