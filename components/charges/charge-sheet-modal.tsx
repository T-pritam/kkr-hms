'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PatientSelect, type SelectedPatient } from '@/components/lab/patient-select'
import { ChargeItemSelect, type ChargeItemOption } from '@/components/charges/charge-item-select'
import {
  CHARGE_BILLING_MODE_LABELS,
  MAX_CHARGE_DAYS,
  isRangeBillingMode,
} from '@/lib/billing/constants'

/**
 * Raising and editing a temporary charge sheet.
 *
 * The subject toggle is the reason this screen exists separately from patient
 * charges: half the time the person being quoted is not in the registry at all.
 * Picking "walk-in" swaps the patient search for plain name and contact fields,
 * and the API clears whichever side is unused so the two can never both be set.
 *
 * Otherwise a sheet quotes exactly what the Charges tab bills, so it offers the
 * same things — only the layout differs. A catalogue entry's `billing_mode` was
 * being read and thrown away here, which is why Room, Oxygen and Nebulizer got
 * no date range on a sheet: picking one of those now opens a range beneath the
 * line, and a per-hour one opens the hours-per-day list, both expanding into one
 * stored line per day exactly as the patient form does.
 *
 * The name and the note about it are two fields, not one box doing both jobs —
 * again matching patient charges, where a line that says "Dressing" can also
 * say why.
 *
 * The sheet-level date is the default for a plain one-time line; a line that
 * came from a range carries its own day. Lines are reconciled by id on save
 * rather than replaced wholesale, because a pharmacy bill hangs off a line and
 * would otherwise be destroyed by editing any other row.
 *
 * The last row grows a fresh blank one the moment it gets its first content —
 * typed or picked — so adding a charge is "keep typing", not "click Add line,
 * then type". The button stays too, for adding a row without touching the last.
 */

export interface ChargeSheetLine {
  /** The stored row this is, when editing. Null for a line not yet saved. */
  id: string | null
  charge_item_id: string | null
  /** What the line is — the required half. */
  charge_name: string
  /** The optional note beside it. */
  description: string
  unit_price: string
  qty: string
  billing_mode: 'one_time' | 'per_day' | 'per_hour'
  /** The day this line falls on. Blank means "use the sheet date". */
  service_date: string
  /** Range entry, only ever set on a line that has not been saved yet. */
  from_date: string
  to_date: string
  /** per_hour: hours typed against each day, and the days dropped from the range. */
  hours: Record<string, string>
  removed_days: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** Omit to raise a new sheet. */
  sheetId?: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

const BLANK_LINE: ChargeSheetLine = {
  id: null,
  charge_item_id: null,
  charge_name: '',
  description: '',
  unit_price: '',
  qty: '1',
  billing_mode: 'one_time',
  service_date: '',
  from_date: '',
  to_date: '',
  hours: {},
  removed_days: [],
}

/** A line is real once it names something — picked or typed. */
const isBlank = (line: ChargeSheetLine) => !line.charge_name.trim() && !line.charge_item_id

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Shared by the header row and every line, so the two cannot drift apart.
 *
 * Written out twice rather than composed with a `sm:` prefix at runtime:
 * Tailwind generates classes by scanning the source for literal strings, so a
 * template-built `sm:grid-cols-[…]` would never exist in the stylesheet.
 */
const LINE_GRID = 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_56px_88px_88px_28px]'
const LINE_GRID_SM =
  'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_56px_88px_88px_28px]'

/** Every date from `from` to `to` inclusive, stepped in UTC so a DST boundary
 * never repeats or skips a day. Mirrors expandDateRange in lib/billing/validate.ts. */
function eachDay(from: string, to: string): string[] {
  if (!from || !to) return []
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []

  const days: string[] = []
  for (let t = start; t <= end && days.length <= MAX_CHARGE_DAYS; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

/** The days a ranged line covers, after the ones the user dropped. */
function daysOf(line: ChargeSheetLine): string[] {
  const dropped = new Set(line.removed_days)
  return eachDay(line.from_date, line.to_date).filter(day => !dropped.has(day))
}

/**
 * What one form line becomes once saved.
 *
 * A line already stored, or a plain one-time one, is a single row. A ranged line
 * that has not been saved yet becomes one row per day — the same expansion the
 * patient charges route does server-side, done here because the sheet API takes
 * the lines as given.
 */
function expandLine(line: ChargeSheetLine, sheetDate: string) {
  const base = {
    charge_item_id: line.charge_item_id,
    charge_name: line.charge_name.trim(),
    description: line.description.trim() || null,
    unit_price: Number(line.unit_price) || 0,
    billing_mode: line.billing_mode,
  }

  const ranged = !line.id && isRangeBillingMode(line.billing_mode)

  if (!ranged) {
    return [
      {
        ...base,
        id: line.id,
        qty: Number(line.qty) || 1,
        service_date: line.service_date || sheetDate,
      },
    ]
  }

  return daysOf(line).map(day => ({
    ...base,
    id: null,
    // per_hour bills the hours typed against that day; per_day bills the units.
    qty:
      line.billing_mode === 'per_hour'
        ? Number(line.hours[day]) || 0
        : Number(line.qty) || 1,
    service_date: day,
  }))
}

/** What a line will add up to, days and hours included. */
function lineTotal(line: ChargeSheetLine): number {
  const rate = Number(line.unit_price) || 0
  if (line.id || !isRangeBillingMode(line.billing_mode)) {
    return rate * (Number(line.qty) || 1)
  }
  if (line.billing_mode === 'per_hour') {
    return daysOf(line).reduce((sum, day) => sum + rate * (Number(line.hours[day]) || 0), 0)
  }
  return rate * (Number(line.qty) || 1) * daysOf(line).length
}

export function ChargeSheetModal({ isOpen, onClose, onSuccess, sheetId }: Props) {
  const mode: 'create' | 'edit' = sheetId ? 'edit' : 'create'

  const [subjectType, setSubjectType] = useState<'patient' | 'opd'>('patient')
  const [patient, setPatient] = useState<SelectedPatient | null>(null)
  const [opd, setOpd] = useState({ name: '', phone: '', age: '', gender: '' })
  const [sheetDate, setSheetDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ChargeSheetLine[]>([{ ...BLANK_LINE }])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setFieldErrors({})

    if (!sheetId) {
      setSubjectType('patient')
      setPatient(null)
      setOpd({ name: '', phone: '', age: '', gender: '' })
      setSheetDate(today())
      setNotes('')
      setLines([{ ...BLANK_LINE }])
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      try {
        const res = await fetch(`/api/charge-sheets/${sheetId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load the charge sheet')
        if (cancelled) return

        const sheet = json.chargeSheet
        const items = sheet.items || []

        setSubjectType(sheet.subject_type)
        setPatient(sheet.patient ?? null)
        setOpd({
          name: sheet.opd_name || '',
          phone: sheet.opd_phone || '',
          age: sheet.opd_age != null ? String(sheet.opd_age) : '',
          gender: sheet.opd_gender || '',
        })
        // Historical lines may carry different dates from back when each row had
        // its own; the first one is as good a starting point as any for the
        // single field replacing them. Saving the sheet again pins every line to
        // whatever this field ends up holding.
        setSheetDate(items[0]?.service_date ? String(items[0].service_date).slice(0, 10) : today())
        setNotes(sheet.notes || '')
        // Stored lines come back one per day, already expanded — the same way
        // the Charges tab shows a saved per-day block as its individual days.
        // Editing one touches that day alone; a new range is entered as a range.
        setLines(
          items.length > 0
            ? items.map((i: any) => ({
                ...BLANK_LINE,
                id: i.id,
                charge_item_id: i.charge_item_id,
                charge_name: i.charge_name || i.description || '',
                description: i.charge_name ? i.description || '' : '',
                unit_price: String(i.unit_price ?? ''),
                qty: String(i.qty ?? 1),
                billing_mode: i.billing_mode || 'one_time',
                service_date: i.service_date ? String(i.service_date).slice(0, 10) : '',
              }))
            : [{ ...BLANK_LINE }],
        )
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [isOpen, sheetId])

  const updateLine = (index: number, patch: Partial<ChargeSheetLine>) => {
    setLines(prev => {
      const wasBlank = isBlank(prev[index])
      const next = prev.map((line, i) => (i === index ? { ...line, ...patch } : line))

      // Only the last row can trigger this, and only the instant it stops being
      // blank — typing further into an already-real row, or editing an earlier
      // one, must not spawn extra rows.
      const isLastRow = index === prev.length - 1
      if (isLastRow && wasBlank && !isBlank(next[index])) {
        next.push({ ...BLANK_LINE })
      }

      return next
    })
  }

  const chooseItem = (index: number, item: ChargeItemOption | null) => {
    const current = lines[index]
    // A saved line keeps the mode it was quoted under; only a new line takes the
    // catalogue's current one.
    const mode = current.id
      ? current.billing_mode
      : isRangeBillingMode(item?.billing_mode)
        ? (item!.billing_mode as 'per_day' | 'per_hour')
        : 'one_time'

    updateLine(index, {
      charge_item_id: item?.id ?? null,
      charge_name: item ? item.name : current.charge_name,
      unit_price: item ? String(item.default_price ?? '') : current.unit_price,
      billing_mode: mode,
      from_date: isRangeBillingMode(mode) && !current.from_date ? sheetDate : current.from_date,
      to_date: isRangeBillingMode(mode) && !current.to_date ? sheetDate : current.to_date,
    })
  }

  const addLine = () => setLines(prev => [...prev, { ...BLANK_LINE }])

  const removeLine = (index: number) =>
    setLines(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  // The row auto-added after the last real one is never itself real. Filtering
  // it out here — rather than only at submit — is what lets Save enable the
  // instant there is at least one genuine line, without that trailing blank
  // counting against it.
  const filledLines = useMemo(() => lines.filter(l => !isBlank(l)), [lines])

  const total = useMemo(
    () => filledLines.reduce((sum, l) => sum + lineTotal(l), 0),
    [filledLines],
  )

  /** Every stored row the filled lines will become, ranges expanded. */
  const expandedItems = useMemo(
    () => filledLines.flatMap(l => expandLine(l, sheetDate)),
    [filledLines, sheetDate],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})

    try {
      const payload: Record<string, any> = {
        subject_type: subjectType,
        notes: notes || null,
        items: expandedItems,
      }

      if (subjectType === 'patient') {
        payload.patient_id = patient?.id ?? null
      } else {
        payload.opd_name = opd.name
        payload.opd_phone = opd.phone || null
        payload.opd_age = opd.age || null
        payload.opd_gender = opd.gender || null
      }

      const res = await fetch(
        mode === 'edit' ? `/api/charge-sheets/${sheetId}` : '/api/charge-sheets',
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors)
        throw new Error(body?.error || 'Failed to save the charge sheet')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const subjectReady = subjectType === 'patient' ? !!patient : !!opd.name.trim()

  /**
   * A ranged line must actually resolve to days, and a per-hour one to hours on
   * every day left in — otherwise saving quietly writes nothing for that line,
   * or writes a day billed for zero hours.
   */
  const lineReady = (line: ChargeSheetLine) => {
    if (Number(line.unit_price) < 0) return false
    if (line.id || !isRangeBillingMode(line.billing_mode)) return true

    const days = daysOf(line)
    if (days.length === 0 || days.length > MAX_CHARGE_DAYS) return false
    if (line.billing_mode === 'per_hour') {
      return days.every(day => Number(line.hours[day]) >= 1)
    }
    return true
  }

  const linesReady = filledLines.length > 0 && filledLines.every(lineReady)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={mode === 'edit' ? 'Edit charge sheet' : 'New charge sheet'}
      description="An estimate. Nothing is billed and no due is created until it is forwarded."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2">
          <span className="text-sm text-muted">
            Total <span className="font-semibold text-foreground">{money(total)}</span>
          </span>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="charge-sheet-form"
              disabled={saving || loading || !subjectReady || !linesReady}
            >
              {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
              {mode === 'edit' ? 'Save changes' : 'Create sheet'}
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto animate-spin text-muted" size={24} />
        </div>
      ) : (
        <form id="charge-sheet-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
            <div className="space-y-2">
              <Label>Who is this for?</Label>
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                {(
                  [
                    ['patient', 'Registered patient'],
                    ['opd', 'OPD / walk-in'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSubjectType(key)}
                    disabled={saving}
                    className={`px-4 py-2 text-sm transition-colors ${
                      subjectType === key
                        ? 'bg-info text-foreground'
                        : 'bg-surface-inset text-muted hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sheet-date">Date</Label>
              <Input
                id="sheet-date"
                type="date"
                value={sheetDate}
                onChange={e => setSheetDate(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {subjectType === 'patient' ? (
            <div className="space-y-1.5">
              <PatientSelect value={patient} onChange={setPatient} required disabled={saving} />
              {fieldErrors.patient_id && (
                <p className="text-xs text-destructive">{fieldErrors.patient_id}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="opd-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="opd-name"
                  value={opd.name}
                  onChange={e => setOpd({ ...opd, name: e.target.value })}
                  disabled={saving}
                />
                {fieldErrors.opd_name && (
                  <p className="text-xs text-destructive">{fieldErrors.opd_name}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opd-phone">Phone</Label>
                <Input
                  id="opd-phone"
                  value={opd.phone}
                  onChange={e => setOpd({ ...opd, phone: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opd-age">Age</Label>
                <Input
                  id="opd-age"
                  type="number"
                  min="0"
                  value={opd.age}
                  onChange={e => setOpd({ ...opd, age: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opd-gender">Gender</Label>
                <Select
                  id="opd-gender"
                  value={opd.gender}
                  onChange={e => setOpd({ ...opd, gender: e.target.value })}
                  disabled={saving}
                >
                  <option value="">Not stated</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={saving}>
                <Plus size={16} className="mr-1" />
                Add line
              </Button>
            </div>

            {/* Column header — desktop only; the mobile layout labels each field
                on its own line instead, where a header row would just repeat. */}
            <div className={`hidden sm:grid ${LINE_GRID} gap-2 px-1 text-xs font-medium text-muted uppercase`}>
              <span>Charge</span>
              <span>Name</span>
              <span>Description</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => {
                const removable = lines.length > 1
                // A saved line is one stored day; only a new one enters a range.
                const ranged = !line.id && isRangeBillingMode(line.billing_mode)
                const days = ranged ? daysOf(line) : []

                return (
                  <div
                    key={line.id ?? `new-${index}`}
                    className="rounded-lg border border-border bg-surface-inset p-2 sm:p-1.5 space-y-2"
                  >
                    <div className={`grid grid-cols-2 ${LINE_GRID_SM} gap-2 items-center`}>
                      <div className="col-span-2 sm:col-span-1">
                        <ChargeItemSelect
                          id={`sheet-line-${index}`}
                          value={line.charge_item_id || ''}
                          onChange={item => chooseItem(index, item)}
                          disabled={saving}
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <Input
                          aria-label="Name"
                          value={line.charge_name}
                          onChange={e => updateLine(index, { charge_name: e.target.value })}
                          disabled={saving}
                          placeholder="What is being charged"
                        />
                        {fieldErrors[`items.${index}.charge_name`] && (
                          <p className="text-xs text-destructive mt-1">
                            {fieldErrors[`items.${index}.charge_name`]}
                          </p>
                        )}
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <Input
                          aria-label="Description"
                          value={line.description}
                          onChange={e => updateLine(index, { description: e.target.value })}
                          disabled={saving}
                          placeholder="Note (optional)"
                        />
                      </div>

                      <Input
                        aria-label={line.billing_mode === 'per_day' ? 'Units per day' : 'Quantity'}
                        type="number"
                        min="1"
                        step="1"
                        value={line.qty}
                        onFocus={e => e.target.select()}
                        onChange={e => updateLine(index, { qty: e.target.value })}
                        disabled={saving || (ranged && line.billing_mode === 'per_hour')}
                        className="text-center"
                      />

                      <Input
                        aria-label="Rate"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_price}
                        onFocus={e => e.target.select()}
                        onChange={e => updateLine(index, { unit_price: e.target.value })}
                        disabled={saving}
                        className="text-right"
                      />

                      <span className="text-sm font-medium text-foreground text-right pr-1">
                        {money(lineTotal(line))}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        disabled={saving || !removable}
                        aria-label={`Remove line ${index + 1}`}
                        className="p-1.5 text-muted hover:text-destructive disabled:opacity-0 justify-self-end"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Range controls live under the line rather than in it: they
                        only apply to two of the three modes, and cramming them
                        into the grid would squeeze every other row for them. */}
                    {ranged && (
                      <div className="border-t border-input-border pt-2 space-y-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <span className="text-xs font-medium text-muted uppercase pb-2.5">
                            {CHARGE_BILLING_MODE_LABELS[line.billing_mode]}
                          </span>
                          <div className="space-y-1">
                            <Label htmlFor={`from-${index}`} className="text-xs">From</Label>
                            <Input
                              id={`from-${index}`}
                              type="date"
                              className="h-9 w-40"
                              value={line.from_date}
                              max={line.to_date || undefined}
                              onChange={e => updateLine(index, { from_date: e.target.value })}
                              disabled={saving}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`to-${index}`} className="text-xs">To</Label>
                            <Input
                              id={`to-${index}`}
                              type="date"
                              className="h-9 w-40"
                              value={line.to_date}
                              min={line.from_date || undefined}
                              onChange={e => updateLine(index, { to_date: e.target.value })}
                              disabled={saving}
                            />
                          </div>
                          <span className="text-xs text-muted pb-2.5">
                            {days.length === 0
                              ? 'Pick a range'
                              : `${days.length} day${days.length === 1 ? '' : 's'} — ${days.length} line${days.length === 1 ? '' : 's'} will be added`}
                          </span>
                        </div>

                        {line.billing_mode === 'per_hour' && days.length > 0 && (
                          <ul className="rounded-md border border-border divide-y divide-input-border max-h-44 overflow-y-auto">
                            {days.map(day => (
                              <li key={day} className="flex items-center gap-3 px-3 py-1.5">
                                <span className="text-sm text-foreground flex-1 min-w-0">
                                  {new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', {
                                    weekday: 'short',
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                </span>
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  aria-label={`Hours on ${day}`}
                                  className="w-24 h-9"
                                  placeholder="hrs"
                                  value={line.hours[day] ?? ''}
                                  onFocus={e => e.target.select()}
                                  onChange={e =>
                                    updateLine(index, {
                                      hours: { ...line.hours, [day]: e.target.value },
                                    })
                                  }
                                  disabled={saving}
                                />
                                <button
                                  type="button"
                                  aria-label={`Remove ${day}`}
                                  className="text-muted hover:text-destructive shrink-0"
                                  onClick={() =>
                                    updateLine(index, {
                                      removed_days: [...line.removed_days, day],
                                    })
                                  }
                                  disabled={saving}
                                >
                                  <X size={16} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {line.removed_days.length > 0 && (
                          <p className="text-xs text-muted">
                            {line.removed_days.length} day
                            {line.removed_days.length === 1 ? '' : 's'} removed ·{' '}
                            <button
                              type="button"
                              className="text-info underline"
                              onClick={() => updateLine(index, { removed_days: [] })}
                            >
                              restore
                            </button>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sheet-notes">Notes</Label>
            <Textarea
              id="sheet-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={saving}
              placeholder="Anything to say alongside the estimate"
            />
          </div>
        </form>
      )}
    </Modal>
  )
}
