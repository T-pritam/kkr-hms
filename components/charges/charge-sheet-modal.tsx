'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PatientSelect, type SelectedPatient } from '@/components/lab/patient-select'
import { ChargeItemSelect, type ChargeItemOption } from '@/components/charges/charge-item-select'

/**
 * Raising and editing a temporary charge sheet.
 *
 * The subject toggle is the reason this screen exists separately from patient
 * charges: half the time the person being quoted is not in the registry at all.
 * Picking "walk-in" swaps the patient search for plain name and contact fields,
 * and the API clears whichever side is unused so the two can never both be set.
 *
 * Lines are edited as a block and replaced wholesale on save. A sheet is a
 * handful of rows edited as a unit, so diffing them client-side would buy
 * nothing.
 *
 * The date used to be per line. A temporary sheet is raised in one sitting for
 * one visit, so it is now one date for the whole sheet — one less field to
 * repeat on every row, and one less reason for a row to feel like its own form.
 * Each line is now a single compact row (item, description, qty, rate, amount,
 * remove) rather than a bordered card, and the last row grows a fresh blank one
 * the moment it gets its first content — typed or picked — so adding a charge
 * is "keep typing", not "click Add line, then type". The button stays too, for
 * adding a row without touching the last one first.
 */

export interface ChargeSheetLine {
  charge_item_id: string | null
  description: string
  unit_price: string
  qty: string
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
  charge_item_id: null,
  description: '',
  unit_price: '',
  qty: '1',
}

/** A line is real once it names something — picked or typed. */
const isBlank = (line: ChargeSheetLine) => !line.description.trim() && !line.charge_item_id

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
        setLines(
          items.length > 0
            ? items.map((i: any) => ({
                charge_item_id: i.charge_item_id,
                description: i.description || '',
                unit_price: String(i.unit_price ?? ''),
                qty: String(i.qty ?? 1),
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
    updateLine(index, {
      charge_item_id: item?.id ?? null,
      description: item ? item.name : lines[index].description,
      unit_price: item ? String(item.default_price ?? '') : lines[index].unit_price,
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
    () => filledLines.reduce((sum, l) => sum + (Number(l.unit_price) || 0) * (Number(l.qty) || 1), 0),
    [filledLines],
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
        items: filledLines.map(l => ({
          charge_item_id: l.charge_item_id,
          description: l.description,
          unit_price: Number(l.unit_price) || 0,
          qty: Number(l.qty) || 1,
          service_date: sheetDate,
        })),
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
  const linesReady = filledLines.length > 0 && filledLines.every(l => Number(l.unit_price) >= 0)

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
            <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_64px_96px_96px_28px] gap-2 px-1 text-xs font-medium text-muted uppercase">
              <span>Charge</span>
              <span>Description</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => {
                const amount = (Number(line.unit_price) || 0) * (Number(line.qty) || 1)
                const removable = lines.length > 1

                return (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-surface-inset p-2 sm:p-1.5
                               grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_64px_96px_96px_28px]
                               gap-2 items-center"
                  >
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
                        aria-label="Description"
                        value={line.description}
                        onChange={e => updateLine(index, { description: e.target.value })}
                        disabled={saving}
                        placeholder="What is being charged for"
                      />
                      {fieldErrors[`items.${index}.description`] && (
                        <p className="text-xs text-destructive mt-1">
                          {fieldErrors[`items.${index}.description`]}
                        </p>
                      )}
                    </div>

                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="1"
                      step="1"
                      value={line.qty}
                      onFocus={e => e.target.select()}
                      onChange={e => updateLine(index, { qty: e.target.value })}
                      disabled={saving}
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
                      {money(amount)}
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
