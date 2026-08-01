'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Search, X, Loader2 } from 'lucide-react'

export interface SelectedPatient {
  id: string
  patient_id: string
  name: string
  phone: string | null
  gender: string | null
  date_of_birth: string | null
  status: string | null
}

interface PatientSelectProps {
  value: SelectedPatient | null
  onChange: (patient: SelectedPatient | null) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

const isActive = (status: string | null | undefined) =>
  (status || '').toLowerCase() === 'active'

/**
 * Searches registered patients by name, patient ID or phone.
 *
 * Unlike the auto-fill box this replaces, selecting a patient hands the caller
 * the whole record — including `id` — so an order can actually be linked to the
 * patient rather than just copying their name as text.
 *
 * Active patients sort first, since they are who the front desk is almost
 * always looking for.
 */
export function PatientSelect({
  value,
  onChange,
  label = 'Search registered patient',
  placeholder = 'Type a name, patient ID or phone number',
  disabled,
  required,
}: PatientSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SelectedPatient[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Show the selected patient's name unless the user is actively typing.
  useEffect(() => {
    if (!searching) setQuery(value?.name || '')
  }, [value, searching])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearching(false)
        setQuery(value?.name || '')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [value])

  const search = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/patients?search=${encodeURIComponent(term)}&pageSize=20`)
      const json = await res.json()
      const list: SelectedPatient[] = json.data?.data || json.patients || []

      // Active first, then alphabetical.
      setResults(
        [...list].sort((a, b) => {
          const byStatus = Number(isActive(b.status)) - Number(isActive(a.status))
          return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name)
        }),
      )
    } catch (err) {
      console.error('Patient search failed:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced: the box this replaces fired a request on every keystroke.
  useEffect(() => {
    if (!searching) return
    const term = query.trim()
    if (term.length < 2) { setResults([]); return }

    const timer = setTimeout(() => search(term), 300)
    return () => clearTimeout(timer)
  }, [query, searching, search])

  const select = (patient: SelectedPatient) => {
    onChange(patient)
    setQuery(patient.name)
    setSearching(false)
    setOpen(false)
  }

  const clear = () => {
    onChange(null)
    setQuery('')
    setSearching(false)
    setResults([])
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="patient-search">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      <div className="relative" ref={wrapperRef}>
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          id="patient-search"
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setSearching(true); setOpen(true) }}
          onFocus={() => { setOpen(true); setSearching(true) }}
          className="flex h-10 w-full rounded-md border border-input-border bg-input pl-9 pr-9 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />

        {loading && (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />
        )}
        {!loading && value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selected patient"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}

        {open && searching && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-hover border border-input-border rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
            {query.trim().length < 2 ? (
              <div className="px-3 py-2 text-sm text-muted">Type at least 2 characters</div>
            ) : loading ? (
              <div className="px-3 py-2 text-sm text-muted">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">
                No registered patient matches “{query.trim()}”
              </div>
            ) : (
              results.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  // mousedown fires before the outside-click handler closes the list
                  onMouseDown={() => select(patient)}
                  className="w-full text-left px-3 py-2 hover:bg-surface-inset border-b border-input-border last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{patient.name}</span>
                    <Badge variant={isActive(patient.status) ? 'success' : 'outline'}>
                      {patient.status || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    ID: {patient.patient_id}
                    {patient.phone && ` · ${patient.phone}`}
                    {patient.gender && ` · ${patient.gender}`}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
