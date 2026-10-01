'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * A consultant doctor's name on the payment receipt: picked from the Doctors
 * list, or typed in (client, 1 Oct).
 *
 * Unlike `doctor-select.tsx` this is not a choice of one saved doctor — the
 * receipt keeps the *text*, so any name can be typed (a visiting doctor who is
 * not in the list, a spelling the patient asked for). Picking from the list is
 * a shortcut that also brings the doctor's designation and department with it.
 *
 * `onMouseDown` on the options, as in the other pickers, so a pick registers
 * before the input's blur closes the list.
 */

export interface DoctorOption {
  id: string
  name: string
  designation: string
  department: string
}

interface Props {
  value: string
  options: DoctorOption[]
  onType: (name: string) => void
  onPick: (doctor: DoctorOption) => void
  ariaLabel: string
  className?: string
}

export function ReceiptDoctorInput({ value, options, onType, onPick, ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    // A name already picked in full should not hide the rest of the list.
    const exact = options.some(o => o.name.toLowerCase() === q)
    return options.filter(o => !q || exact || o.name.toLowerCase().includes(q)).slice(0, 25)
  }, [options, value])

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        maxLength={80}
        placeholder="Pick a doctor or type a name"
        onFocus={() => setOpen(true)}
        onChange={e => {
          onType(e.target.value)
          setOpen(true)
        }}
        onKeyDown={e => {
          // Escape closes the list first; a second Escape closes the form.
          if (e.key === 'Escape' && open) {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            setOpen(false)
          }
        }}
        className={className}
      />
      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {matches.map(doctor => (
            <li key={doctor.id} role="option" aria-selected={doctor.name === value}>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  onPick(doctor)
                  setOpen(false)
                }}
                className="block w-full px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="block text-sm text-foreground">{doctor.name}</span>
                {(doctor.designation || doctor.department) && (
                  <span className="block text-xs text-muted">
                    {[doctor.designation, doctor.department].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
