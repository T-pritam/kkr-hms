'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DoctorMultiSelect, type SelectedDoctor } from './doctor-multi-select'
import { MedicationRows, BLANK_MEDICATION, type MedicationRow } from './medication-rows'
import { AttachmentList } from './attachment-list'
import { DISCHARGE_CONDITIONS } from '@/lib/case-sheet/constants'
import type { CaseSheet, FieldErrors } from '@/lib/case-sheet/types'
import { AlertCircle, CheckCircle2, Save } from 'lucide-react'

/**
 * The case sheet editor.
 *
 * Replaces a three-field form (discharge date, one notes box, a mandatory
 * scanned PDF) with the structured record a discharge summary actually needs.
 *
 * Two save paths:
 *   - **Save draft** — keeps everything, validates almost nothing. A summary is
 *     written over the course of a stay, not in one sitting.
 *   - **Save & finalise** — enforces the four required sections and discharges
 *     the patient. Errors come back per field and are shown against the box
 *     rather than in an alert.
 *
 * Attachments are only offered once the record exists: uploading needs a case
 * sheet id to attach to.
 */

interface CaseSheetEditorModalProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  billingId?: string | null
  /**
   * The patient's date of joining, used as the admission date on a new draft.
   *
   * Without it the field opened blank and stayed blank, so the admission date
   * printed empty on every discharge summary. It is still editable — a
   * readmission is a new admission, not the original registration.
   */
  patientJoinDate?: string | null
  /** null creates a new draft. */
  caseSheet: CaseSheet | null
  /** `finalised` is true only when the save also signed the summary off. */
  onSaved: (finalised?: boolean) => void
}

interface FormState {
  admission_date: string
  discharge_date: string
  ward: string
  bed: string
  chief_complaints: string
  history_present_illness: string
  past_history: string
  diagnosis: string
  investigations: string
  clinical_summary: string
  condition_on_discharge: string
  vitals_bp: string
  vitals_pulse: string
  vitals_temp: string
  vitals_spo2: string
  advice_notes: string
  follow_up_date: string
  follow_up_instructions: string
}

const EMPTY: FormState = {
  admission_date: '',
  discharge_date: '',
  ward: '',
  bed: '',
  chief_complaints: '',
  history_present_illness: '',
  past_history: '',
  diagnosis: '',
  investigations: '',
  clinical_summary: '',
  condition_on_discharge: '',
  vitals_bp: '',
  vitals_pulse: '',
  vitals_temp: '',
  vitals_spo2: '',
  advice_notes: '',
  follow_up_date: '',
  follow_up_instructions: '',
}

/** Dates arrive as ISO or `YYYY-MM-DD`; a date input only accepts the latter. */
const dateValue = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '')

function toForm(sheet: CaseSheet): FormState {
  return {
    admission_date: dateValue(sheet.admission_date),
    discharge_date: dateValue(sheet.discharge_date),
    ward: sheet.ward || '',
    bed: sheet.bed || '',
    chief_complaints: sheet.chief_complaints || '',
    history_present_illness: sheet.history_present_illness || '',
    past_history: sheet.past_history || '',
    diagnosis: sheet.diagnosis || '',
    investigations: sheet.investigations || '',
    clinical_summary: sheet.clinical_summary || '',
    condition_on_discharge: sheet.condition_on_discharge || '',
    vitals_bp: sheet.vitals_bp || '',
    vitals_pulse: sheet.vitals_pulse || '',
    vitals_temp: sheet.vitals_temp || '',
    vitals_spo2: sheet.vitals_spo2 || '',
    advice_notes: sheet.advice_notes || '',
    follow_up_date: dateValue(sheet.follow_up_date),
    follow_up_instructions: sheet.follow_up_instructions || '',
  }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function CaseSheetEditorModal({
  isOpen,
  onClose,
  patientId,
  billingId,
  patientJoinDate,
  caseSheet,
  onSaved,
}: CaseSheetEditorModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [doctors, setDoctors] = useState<SelectedDoctor[]>([])
  const [medications, setMedications] = useState<MedicationRow[]>([{ ...BLANK_MEDICATION }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (!isOpen) return

    setError('')
    setFieldErrors({})

    if (caseSheet) {
      setForm(toForm(caseSheet))
      setDoctors(caseSheet.doctors.map(d => ({
        doctor_id: d.doctor_id,
        doctor_name: d.doctor_name,
        doctor_specialist: d.doctor_specialist,
      })))
      setMedications(
        caseSheet.medications.length > 0
          ? caseSheet.medications.map(m => ({
              medicine_id: m.medicine_id,
              medicine_name: m.medicine_name,
              dosage: m.dosage || '',
              quantity: m.quantity || '',
              usage: m.usage || '',
            }))
          : [{ ...BLANK_MEDICATION }],
      )
    } else {
      // A new draft starts from the date the patient was registered. The server
      // applies the same default, so an API client gets it too; doing it here as
      // well means the clinician can see and change it before saving.
      setForm({ ...EMPTY, admission_date: dateValue(patientJoinDate) })
      setDoctors([])
      setMedications([{ ...BLANK_MEDICATION }])
    }
  }, [isOpen, caseSheet, patientJoinDate])

  const set = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }))

  const payload = () => ({
    ...form,
    patient_billing_id: billingId || null,
    doctors: doctors.map(d => ({
      doctor_id: d.doctor_id,
      doctor_name: d.doctor_name,
      doctor_specialist: d.doctor_specialist,
    })),
    medications: medications
      .filter(m => m.medicine_name.trim())
      .map(m => ({
        medicine_id: m.medicine_id,
        medicine_name: m.medicine_name,
        dosage: m.dosage,
        quantity: m.quantity,
        usage: m.usage,
      })),
  })

  /** Saves, then optionally finalises. Returns the saved record's id. */
  const save = async (finalise: boolean) => {
    setSaving(true)
    setError('')
    setFieldErrors({})

    try {
      const base = `/api/patients/${patientId}/case-sheets`
      const url = caseSheet ? `${base}/${caseSheet.id}` : base

      const res = await fetch(url, {
        method: caseSheet ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        if (json.errors) setFieldErrors(json.errors)
        throw new Error(json.error || 'Failed to save the case sheet')
      }

      const savedId: string = json.data?.id ?? caseSheet?.id

      if (finalise && savedId) {
        const finaliseRes = await fetch(`${base}/${savedId}/finalise`, { method: 'POST' })
        const finaliseJson = await finaliseRes.json()

        if (!finaliseRes.ok || !finaliseJson.success) {
          if (finaliseJson.errors) setFieldErrors(finaliseJson.errors)
          // The content is saved either way — say so, so nobody retypes it.
          throw new Error(
            finaliseJson.error || 'Saved as a draft, but it could not be finalised',
          )
        }
      }

      onSaved(finalise)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const isFinal = caseSheet?.status === 'final'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caseSheet ? `Edit case sheet${caseSheet.summary_no ? ` — ${caseSheet.summary_no}` : ''}` : 'New case sheet'}
      description={
        isFinal
          ? 'This summary is finalised. Saving changes keeps it finalised.'
          : 'Save a draft at any point; finalise when the summary is complete.'
      }
      size="full"
    >
      <form
        className="space-y-5"
        onSubmit={e => { e.preventDefault(); void save(false) }}
      >
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Section title="Admission & stay">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field id="admission_date" label="Admission date" error={fieldErrors.admission_date}>
              <Input
                id="admission_date"
                type="date"
                value={form.admission_date}
                onChange={e => set({ admission_date: e.target.value })}
                disabled={saving}
              />
            </Field>
            <Field id="discharge_date" label="Discharge date" required error={fieldErrors.discharge_date}>
              <Input
                id="discharge_date"
                type="date"
                value={form.discharge_date}
                onChange={e => set({ discharge_date: e.target.value })}
                disabled={saving}
              />
            </Field>
            <Field id="ward" label="Ward / Room">
              <Input
                id="ward"
                value={form.ward}
                onChange={e => set({ ward: e.target.value })}
                placeholder="General Ward"
                disabled={saving}
              />
            </Field>
            <Field id="bed" label="Bed">
              <Input
                id="bed"
                value={form.bed}
                onChange={e => set({ bed: e.target.value })}
                placeholder="12"
                disabled={saving}
              />
            </Field>
          </div>
        </Section>

        <Section title="Consulting doctors" hint="Their names print above the signature lines on the summary.">
          <DoctorMultiSelect
            value={doctors}
            onChange={setDoctors}
            disabled={saving}
            error={fieldErrors.doctors}
          />
        </Section>

        <Section title="Presenting complaints & history">
          <Field id="chief_complaints" label="Chief complaints">
            <Textarea
              id="chief_complaints"
              rows={3}
              value={form.chief_complaints}
              onChange={e => set({ chief_complaints: e.target.value })}
              placeholder="Fever with chills for 4 days, generalised weakness"
              disabled={saving}
            />
          </Field>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field id="history_present_illness" label="History of present illness">
              <Textarea
                id="history_present_illness"
                rows={4}
                value={form.history_present_illness}
                onChange={e => set({ history_present_illness: e.target.value })}
                disabled={saving}
              />
            </Field>
            <Field id="past_history" label="Past history">
              <Textarea
                id="past_history"
                rows={4}
                value={form.past_history}
                onChange={e => set({ past_history: e.target.value })}
                placeholder="Known diabetic since 2018, on metformin"
                disabled={saving}
              />
            </Field>
          </div>
        </Section>

        <Section title="Diagnosis" hint="The single most-read line on the document.">
          <Field id="diagnosis" label="Diagnosis" required error={fieldErrors.diagnosis}>
            <Textarea
              id="diagnosis"
              rows={3}
              value={form.diagnosis}
              onChange={e => set({ diagnosis: e.target.value })}
              placeholder="Acute gastroenteritis with mild dehydration"
              disabled={saving}
            />
          </Field>
        </Section>

        <Section title="Investigations" hint="Findings in the doctor's own words — lab reports can be appended to the PDF separately.">
          <Field id="investigations" label="Investigations">
            <Textarea
              id="investigations"
              rows={5}
              value={form.investigations}
              onChange={e => set({ investigations: e.target.value })}
              placeholder={'Hb 9.2 g/dL, TLC 12,400\nUSG abdomen: mild hepatomegaly\nX-ray chest: normal'}
              disabled={saving}
            />
          </Field>
        </Section>

        <Section title="Summary / course in hospital" hint="What was done and how the patient responded.">
          <Field id="clinical_summary" label="Summary" required error={fieldErrors.clinical_summary}>
            <Textarea
              id="clinical_summary"
              rows={6}
              value={form.clinical_summary}
              onChange={e => set({ clinical_summary: e.target.value })}
              disabled={saving}
            />
          </Field>
        </Section>

        <Section title="Condition on discharge">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field
              id="condition_on_discharge"
              label="Condition"
              error={fieldErrors.condition_on_discharge}
            >
              <Select
                id="condition_on_discharge"
                value={form.condition_on_discharge}
                onChange={e => set({ condition_on_discharge: e.target.value })}
                disabled={saving}
              >
                <option value="">Not recorded</option>
                {DISCHARGE_CONDITIONS.map(condition => (
                  <option key={condition} value={condition}>{condition}</option>
                ))}
              </Select>
            </Field>
            <Field id="vitals_bp" label="BP">
              <Input
                id="vitals_bp"
                value={form.vitals_bp}
                onChange={e => set({ vitals_bp: e.target.value })}
                placeholder="120/80"
                disabled={saving}
              />
            </Field>
            <Field id="vitals_pulse" label="Pulse">
              <Input
                id="vitals_pulse"
                value={form.vitals_pulse}
                onChange={e => set({ vitals_pulse: e.target.value })}
                placeholder="78 /min"
                disabled={saving}
              />
            </Field>
            <Field id="vitals_temp" label="Temperature">
              <Input
                id="vitals_temp"
                value={form.vitals_temp}
                onChange={e => set({ vitals_temp: e.target.value })}
                placeholder="98.6 F"
                disabled={saving}
              />
            </Field>
            <Field id="vitals_spo2" label="SpO2">
              <Input
                id="vitals_spo2"
                value={form.vitals_spo2}
                onChange={e => set({ vitals_spo2: e.target.value })}
                placeholder="98%"
                disabled={saving}
              />
            </Field>
          </div>
        </Section>

        <Section title="Discharge advice — medication">
          <MedicationRows value={medications} onChange={setMedications} disabled={saving} />
        </Section>

        <Section title="Discharge advice — notes">
          <Field id="advice_notes" label="Advice">
            <Textarea
              id="advice_notes"
              rows={4}
              value={form.advice_notes}
              onChange={e => set({ advice_notes: e.target.value })}
              placeholder="Plenty of oral fluids. Avoid outside food for two weeks. Return immediately if fever recurs."
              disabled={saving}
            />
          </Field>
        </Section>

        <Section title="Follow-up">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Field id="follow_up_date" label="Follow-up date" error={fieldErrors.follow_up_date}>
              <Input
                id="follow_up_date"
                type="date"
                value={form.follow_up_date}
                onChange={e => set({ follow_up_date: e.target.value })}
                disabled={saving}
              />
            </Field>
            <div className="lg:col-span-2">
              <Field id="follow_up_instructions" label="Follow-up instructions">
                <Textarea
                  id="follow_up_instructions"
                  rows={3}
                  value={form.follow_up_instructions}
                  onChange={e => set({ follow_up_instructions: e.target.value })}
                  placeholder="Review in OPD with a repeat CBC."
                  disabled={saving}
                />
              </Field>
            </div>
          </div>
        </Section>

        {caseSheet ? (
          <Section title="Raw case sheet" hint="Scanned sheets and outside reports. Any of them can be appended to the printed summary.">
            <AttachmentList
              patientId={patientId}
              caseSheetId={caseSheet.id}
              attachments={caseSheet.attachments}
              onChanged={onSaved}
              canEdit
            />
          </Section>
        ) : (
          <Section title="Raw case sheet">
            <p className="text-sm text-muted">
              Save the case sheet first, then scans can be attached to it.
            </p>
          </Section>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-3">
            <Button type="submit" variant="outline" disabled={saving}>
              <Save size={16} className="mr-1.5" />
              {saving ? 'Saving…' : isFinal ? 'Save changes' : 'Save draft'}
            </Button>
            {!isFinal && (
              <Button type="button" onClick={() => void save(true)} disabled={saving}>
                <CheckCircle2 size={16} className="mr-1.5" />
                {saving ? 'Saving…' : 'Save & finalise'}
              </Button>
            )}
          </div>
        </div>

        {!isFinal && (
          <p className="text-xs text-muted">
            Finalising locks the summary and marks the patient as discharged.
          </p>
        )}
      </form>
    </Modal>
  )
}
