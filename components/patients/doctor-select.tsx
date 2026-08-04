'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

/**
 * The doctor for a consultation — one doctor, searchable.
 *
 * The picker this replaces lived inline in `doctor-visits-tab.tsx` and had no
 * outside-click handler at all: once open, the list stayed open until something was
 * chosen or the box was clicked a second time. Inside a modal that is worse than on a
 * page, because the list overlaps the fields under it.
 *
 * Mechanics follow `components/case-sheet/doctor-multi-select.tsx`, which is the version
 * of this already proven inside a modal — in particular `onMouseDown` rather than
 * `onClick` on the options, so a selection registers before the outside-click handler
 * closes the list.
 *
 * Deliberately dumb: no `Label`, no error text, no inline "add a doctor". The caller
 * wraps it in the house `Field`, and nesting a create-modal inside the consultation modal
 * is a nesting this form does not need.
 */

interface Doctor {
  id: string
  name: string
  specialist?: string | null
  designation?: string | null
}

interface DoctorSelectProps {
  value: string
  onChange: (doctorId: string) => void
  disabled?: boolean
  /**
   * A deactivated doctor is missing from `/api/doctors/all`. When editing a visit that
   * names one, pass their id so the list still resolves it — otherwise the field would
   * silently blank and the edit would reassign the visit.
   */
  includeId?: string | null
  /** Shown while the list is still loading, so an edit never flashes an empty box. */
  fallbackLabel?: string | null
  id?: string
}

export function DoctorSelect({
  value,
  onChange,
  disabled,
  includeId,
  fallbackLabel,
  id = 'doctor-select',
}: DoctorSelectProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)

  // `includeId` changes when the modal switches between visits, so a slow first response
  // could land after a faster second one and reinstate the wrong list. The guard drops
  // anything that arrives after the effect has moved on.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const url = includeId ? `/api/doctors/all?includeId=${includeId}` : '/api/doctors/all'
        const res = await fetch(url)
        const json = await res.json()
        if (!cancelled && res.ok) setDoctors(Array.isArray(json) ? json : json.doctors || [])
      } catch (err) {
        if (!cancelled) console.error('Failed to load doctors:', err)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [includeId])

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const selected = useMemo(
    () => doctors.find(d => d.id === value) || null,
    [doctors, value],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return doctors
      .filter(d => !q || d.name.toLowerCase().includes(q) || (d.specialist || '').toLowerCase().includes(q))
      .slice(0, 25)
  }, [doctors, query])

  const choose = (doctor: Doctor) => {
    onChange(doctor.id)
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    onChange('')
    setQuery('')
  }

  // The list has not arrived yet, but the visit already names someone.
  const label = selected
    ? `${selected.name}${selected.specialist || selected.designation ? ` (${selected.specialist || selected.designation})` : ''}`
    : value
      ? fallbackLabel || 'Loading…'
      : ''

  return (
    <div className="relative" ref={wrapperRef}>
      {value ? (
        <div className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input-border bg-input px-3 py-2 text-sm text-foreground">
          <span className="truncate">{label}</span>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="shrink-0 text-muted hover:text-destructive"
              aria-label="Clear the selected doctor"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id={id}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder="Search doctors by name or speciality"
            className="flex h-10 w-full rounded-md border border-input-border bg-input pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </>
      )}

      {open && !value && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-64 overflow-y-auto rounded-md border border-input-border bg-surface-hover shadow-lg">
          {matches.length > 0 ? (
            matches.map(doctor => (
              <button
                key={doctor.id}
                type="button"
                onMouseDown={() => choose(doctor)}
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
              {query ? 'No doctor matches that' : 'No doctors available'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
