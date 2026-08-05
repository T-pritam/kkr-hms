'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { CHARGE_CATEGORY_LABELS } from '@/lib/billing/constants'

/**
 * The charge being placed — one catalogue entry, searchable.
 *
 * Mechanics follow components/patients/doctor-select.tsx, including
 * `onMouseDown` rather than `onClick` on the options so a selection registers
 * before the outside-click handler closes the list.
 *
 * The difference from the doctor picker is that this one has an escape hatch.
 * The catalogue will never be complete, and reception must not be blocked from
 * billing something unusual at the desk, so "Not in the list" is always the last
 * option and hands control back to the caller for a free-text name.
 */

export interface ChargeItemOption {
  id: string
  code: string | null
  name: string
  category: string
  billing_mode: string
  default_price: number
  unit_label: string | null
}

interface Props {
  value: string
  /** `null` when the user picks the ad-hoc escape hatch. */
  onChange: (item: ChargeItemOption | null) => void
  disabled?: boolean
  /**
   * A retired charge is missing from /api/charge-items/all. When editing a
   * charge that names one, pass its id so the field resolves rather than
   * silently blanking.
   */
  includeId?: string | null
  fallbackLabel?: string | null
  id?: string
}

const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export function ChargeItemSelect({
  value,
  onChange,
  disabled,
  includeId,
  fallbackLabel,
  id = 'charge-item-select',
}: Props) {
  const [items, setItems] = useState<ChargeItemOption[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)

  // Same race guard as the doctor picker: a slow first response must not land
  // after a faster second one and reinstate the wrong list.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const url = includeId
          ? `/api/charge-items/all?includeId=${includeId}`
          : '/api/charge-items/all'
        const res = await fetch(url)
        const json = await res.json()
        if (!cancelled && res.ok) setItems(Array.isArray(json) ? json : [])
      } catch (err) {
        if (!cancelled) console.error('Failed to load the charge catalogue:', err)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [includeId])

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const selected = useMemo(() => items.find(i => i.id === value) || null, [items, value])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter(
        i =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.code || '').toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      )
      .slice(0, 25)
  }, [items, query])

  const choose = (item: ChargeItemOption | null) => {
    onChange(item)
    setQuery('')
    setOpen(false)
  }

  const label = selected
    ? `${selected.name}${selected.default_price ? ` — ${money(selected.default_price)}${selected.unit_label ? ` ${selected.unit_label}` : ''}` : ''}`
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
              onClick={() => choose(null)}
              className="shrink-0 text-muted hover:text-destructive"
              aria-label="Clear the selected charge"
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
            onChange={e => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder="Search charges by name, code or category"
            className="flex h-10 w-full rounded-md border border-input-border bg-input pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </>
      )}

      {open && !value && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-64 overflow-y-auto rounded-md border border-input-border bg-surface-hover shadow-lg">
          {matches.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={() => choose(item)}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-inset border-b border-input-border last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {money(item.default_price)}
                  {item.unit_label ? ` ${item.unit_label}` : ''}
                </span>
              </div>
              <span className="text-muted text-xs">
                {CHARGE_CATEGORY_LABELS[item.category as keyof typeof CHARGE_CATEGORY_LABELS] ??
                  item.category}
                {item.billing_mode === 'per_day' && ' · billed per day'}
              </span>
            </button>
          ))}

          {matches.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted">
              {query ? 'Nothing in the catalogue matches that' : 'The catalogue is empty'}
            </div>
          )}

          {/* Always last, and always available — the catalogue is never complete. */}
          <button
            type="button"
            onMouseDown={() => choose(null)}
            className="w-full text-left px-3 py-2 text-sm text-info hover:bg-surface-inset border-t border-input-border"
          >
            Not in the list — enter it manually
          </button>
        </div>
      )}
    </div>
  )
}
