'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Plus, Search, X } from 'lucide-react'

/**
 * Consulting doctors on a case sheet.
 *
 * A discharge summary is usually signed by more than one clinician, so this is
 * a multi-select: chosen doctors sit above the box as removable chips.
 *
 * Any doctor missing from the list can be created without leaving the form —
 * the sub-modal posts to /api/doctors and selects the result. Combobox
 * behaviour follows `components/patients/referral-select.tsx` (outside-click
 * close, inline create) and `components/lab/patient-select.tsx` (`onMouseDown`
 * on the options, which fires before the outside-click handler closes the list).
 */

export interface SelectedDoctor {
  doctor_id: string | null
  doctor_name: string
  doctor_specialist: string | null
}

interface Doctor {
  id: string
  name: string
  specialist?: string | null
  designation?: string | null
}

interface DoctorMultiSelectProps {
  value: SelectedDoctor[]
  onChange: (doctors: SelectedDoctor[]) => void
  disabled?: boolean
  error?: string
}

const BLANK_DOCTOR = { name: '', mobile: '', email: '', designation: '', specialist: '' }

export function DoctorMultiSelect({ value, onChange, disabled, error }: DoctorMultiSelectProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState(BLANK_DOCTOR)

  const wrapperRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/doctors/all')
      const json = await res.json()
      if (res.ok) setDoctors(Array.isArray(json) ? json : json.doctors || [])
    } catch (err) {
      console.error('Failed to load doctors:', err)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const chosenIds = useMemo(
    () => new Set(value.map(d => d.doctor_id).filter(Boolean) as string[]),
    [value],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return doctors
      .filter(d => !chosenIds.has(d.id))
      .filter(d => !q || d.name.toLowerCase().includes(q) || (d.specialist || '').toLowerCase().includes(q))
      .slice(0, 25)
  }, [doctors, chosenIds, query])

  const add = (doctor: Doctor) => {
    onChange([
      ...value,
      {
        doctor_id: doctor.id,
        doctor_name: doctor.name,
        doctor_specialist: doctor.specialist || doctor.designation || null,
      },
    ])
    setQuery('')
    setOpen(false)
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const createDoctor = async () => {
    if (!form.name.trim()) {
      setCreateError('Enter the doctor name')
      return
    }

    setCreating(true)
    setCreateError('')

    try {
      const res = await fetch('/api/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add the doctor')

      // The route returns the new row so the doctor can be selected without
      // refetching the whole list; the refetch keeps the dropdown current for
      // the next search.
      const created: Doctor | undefined = json.doctor
      await load()

      if (created?.id) {
        add(created)
      } else {
        onChange([
          ...value,
          {
            doctor_id: null,
            doctor_name: form.name.trim(),
            doctor_specialist: form.specialist.trim() || null,
          },
        ])
      }

      setForm(BLANK_DOCTOR)
      setShowCreate(false)
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="consulting-doctors">
          Consulting Doctors <span className="text-destructive">*</span>
        </Label>

        {value.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {value.map((doctor, index) => (
              <span
                key={`${doctor.doctor_id ?? doctor.doctor_name}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-inset border border-border px-3 py-1 text-sm text-foreground"
              >
                {doctor.doctor_name}
                {doctor.doctor_specialist && (
                  <span className="text-muted text-xs">({doctor.doctor_specialist})</span>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-muted hover:text-destructive"
                    aria-label={`Remove ${doctor.doctor_name}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="relative" ref={wrapperRef}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="consulting-doctors"
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder="Search doctors by name or speciality"
            className="flex h-10 w-full rounded-md border border-input-border bg-input pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />

          {open && !disabled && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-64 overflow-y-auto rounded-md border border-input-border bg-surface-hover shadow-lg">
              {matches.length > 0 ? (
                matches.map(doctor => (
                  <button
                    key={doctor.id}
                    type="button"
                    onMouseDown={() => add(doctor)}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-inset border-b border-input-border last:border-b-0"
                  >
                    {doctor.name}
                    {(doctor.specialist || doctor.designation) && (
                      <span className="text-muted ml-2 text-xs">
                        {doctor.specialist || doctor.designation}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-muted">
                  {query ? 'No doctor matches that' : 'All doctors are already added'}
                </div>
              )}

              <button
                type="button"
                onMouseDown={() => {
                  setForm({ ...BLANK_DOCTOR, name: query.trim() })
                  setShowCreate(true)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-inset border-t border-input-border font-medium flex items-center gap-1.5"
              >
                <Plus size={14} />
                {query.trim() ? `Add "${query.trim()}" as a new doctor` : 'Add a new doctor'}
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setCreateError('') }}
        title="Add a doctor"
        description="The doctor is added to the hospital's list and selected here."
        size="md"
      >
        <div className="space-y-4">
          {createError && (
            <div className="p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              {createError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-doctor-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-doctor-name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Dr. S. Rao"
              disabled={creating}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-doctor-specialist">Speciality</Label>
              <Input
                id="new-doctor-specialist"
                value={form.specialist}
                onChange={e => setForm({ ...form, specialist: e.target.value })}
                placeholder="General Medicine"
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-doctor-designation">Designation</Label>
              <Input
                id="new-doctor-designation"
                value={form.designation}
                onChange={e => setForm({ ...form, designation: e.target.value })}
                placeholder="Consultant"
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-doctor-mobile">Mobile</Label>
              <Input
                id="new-doctor-mobile"
                value={form.mobile}
                onChange={e => setForm({ ...form, mobile: e.target.value })}
                placeholder="+91 98765 43210"
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-doctor-email">Email</Label>
              <Input
                id="new-doctor-email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                disabled={creating}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="sm:flex-1"
              onClick={() => { setShowCreate(false); setCreateError('') }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="sm:flex-1"
              onClick={createDoctor}
              disabled={creating || !form.name.trim()}
            >
              {creating ? 'Adding…' : 'Add doctor'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
