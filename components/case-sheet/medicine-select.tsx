'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'

/**
 * Medicine name box for a discharge-advice row.
 *
 * Typing searches the medicine master; anything not in it can be added on the
 * spot, which is what keeps the list growing without anyone maintaining it.
 * The point is not a pharmacy catalogue — it is that "Pantoprazole",
 * "pantoprazole" and "Pantaprazole" stop being three drugs on three summaries.
 *
 * The free text is always kept: if the master is unreachable the doctor can
 * still write the name and save. Losing a prescription because a lookup failed
 * would be indefensible.
 */

interface Medicine {
  id: string
  name: string
  form?: string | null
  strength?: string | null
}

interface MedicineSelectProps {
  value: string
  medicineId: string | null
  onChange: (name: string, medicineId: string | null) => void
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}

export function MedicineSelect({
  value,
  medicineId,
  onChange,
  disabled,
  placeholder = 'Medicine name',
  'aria-label': ariaLabel,
}: MedicineSelectProps) {
  const [matches, setMatches] = useState<Medicine[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const search = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/medicines?search=${encodeURIComponent(term)}&limit=15`)
      const json = await res.json()
      setMatches(res.ok && json.success ? json.data : [])
    } catch {
      setMatches([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced, like the patient picker: one request per pause, not per keystroke.
  useEffect(() => {
    if (!open) return
    const term = value.trim()
    const timer = setTimeout(() => { void search(term) }, 300)
    return () => clearTimeout(timer)
  }, [value, open, search])

  const exactMatch = matches.some(m => m.name.toLowerCase() === value.trim().toLowerCase())

  const addToMaster = async () => {
    const name = value.trim()
    if (!name) return

    setAdding(true)
    try {
      const res = await fetch('/api/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        onChange(json.data.name, json.data.id)
        setOpen(false)
      }
    } catch (err) {
      // The typed name stays in the row either way, so the prescription is not
      // lost because the master could not be written to.
      console.error('Failed to add medicine:', err)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        aria-label={ariaLabel}
        onChange={e => { onChange(e.target.value, null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex h-10 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />

      {loading && (
        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />
      )}
      {!loading && medicineId && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-muted"
          title="Picked from the medicine list"
        >
          saved
        </span>
      )}

      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-56 overflow-y-auto rounded-md border border-input-border bg-surface-hover shadow-lg">
          {matches.map(medicine => (
            <button
              key={medicine.id}
              type="button"
              onMouseDown={() => { onChange(medicine.name, medicine.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-inset border-b border-input-border last:border-b-0"
            >
              {medicine.name}
              {(medicine.strength || medicine.form) && (
                <span className="text-muted ml-2 text-xs">
                  {[medicine.strength, medicine.form].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}

          {value.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={addToMaster}
              disabled={adding}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-inset border-t border-input-border font-medium flex items-center gap-1.5"
            >
              <Plus size={14} />
              {adding ? 'Adding…' : `Add "${value.trim()}" to the medicine list`}
            </button>
          )}

          {matches.length === 0 && !value.trim() && (
            <div className="px-3 py-2 text-sm text-muted">Start typing a medicine name</div>
          )}
        </div>
      )}
    </div>
  )
}
