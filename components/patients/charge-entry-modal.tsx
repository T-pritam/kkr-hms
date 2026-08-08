'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import {
  ChargeItemSelect,
  type ChargeItemOption,
} from '@/components/charges/charge-item-select'
import { MAX_CHARGE_DAYS, MAX_HOURS_PER_DAY, isRangeBillingMode } from '@/lib/billing/constants'

/**
 * Placing a charge on a patient, and correcting one.
 *
 * The form has three shapes, and which one it shows is decided by the catalogue
 * entry rather than by the user. A one-time charge asks for a single date. A
 * per-day charge — room rent, a nebuliser — asks for a range and is written as
 * one row per day, which is what makes a single day repriceable or removable
 * afterwards. A per-hour charge — oxygen — asks for one day and the hours used
 * on it; a run spanning days is entered a day at a time, because the hours
 * differ per day and are typed rather than worked out from clock times.
 *
 * The price is prefilled from the catalogue and always editable. That is the
 * point of a default: the desk should not have to leave the form to bill a
 * one-off rate, and should not have to remember the usual one either.
 *
 * Editing is deliberately single-row only. A saved per-day block is N independent
 * rows; changing "the block" is ambiguous once a day has been repriced, so the
 * table offers per-row edit and a whole-block delete instead.
 */

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  patientId: string
  /** Read live at submit — never copied into form state. */
  billingId: string | null
  /** Omit to add a new charge. */
  charge?: any | null
}

interface FormState {
  charge_item_id: string
  charge_type: string
  description: string
  amount: string
  qty: string
  charge_date: string
  from_date: string
  to_date: string
  /** per_hour only: whole hours used on charge_date. */
  hours: string
}

const today = () => new Date().toISOString().slice(0, 10)

const BLANK: FormState = {
  charge_item_id: '',
  charge_type: '',
  description: '',
  amount: '',
  qty: '1',
  charge_date: '',
  from_date: '',
  to_date: '',
  hours: '1',
}

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Inclusive, and 0 when the range is incomplete or backwards. */
function dayCount(from: string, to: string): number {
  if (!from || !to) return 0
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  if (Number.isNaN(ms) || ms < 0) return 0
  return Math.floor(ms / 86_400_000) + 1
}

/**
 * Surfaces a per-hour error where the form can show it.
 *
 * The API validates the hours as a list and keys its errors
 * `hour_lines.0.hours` / `hour_lines.0.charge_date`, because a per-hour entry
 * used to cover a whole range. The form now sends exactly one day and reads
 * plain `hours` / `charge_date`, so without this remapping a rejected value
 * would surface only as the banner and leave the offending box unmarked.
 */
function withHourLineErrors(errors: Record<string, string>): Record<string, string> {
  const out = { ...errors }

  for (const [key, message] of Object.entries(errors)) {
    const match = /^hour_lines\.\d+\.(hours|charge_date)$/.exec(key)
    if (match && !out[match[1]]) out[match[1]] = message
  }

  return out
}

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

export function ChargeEntryModal({
  isOpen,
  onClose,
  onSuccess,
  patientId,
  billingId,
  charge,
}: Props) {
  const mode: 'create' | 'edit' = charge ? 'edit' : 'create'

  const [form, setForm] = useState<FormState>(BLANK)
  const [item, setItem] = useState<ChargeItemOption | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setFieldErrors({})
    setItem(null)

    setForm(
      charge
        ? {
            charge_item_id: charge.charge_item_id || '',
            charge_type: charge.charge_type || '',
            description: charge.description || '',
            amount: String(charge.amount ?? ''),
            qty: String(charge.qty ?? 1),
            charge_date: String(charge.charge_date || '').slice(0, 10),
            // A stored per-hour row keeps its hours in qty.
            hours: String(charge.qty ?? 1),
            from_date: '',
            to_date: '',
          }
        : { ...BLANK, charge_date: today() },
    )
  }, [isOpen, charge])

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as string]
      return next
    })
  }

  /**
   * On edit the catalogue entry is not re-fetched, so the stored snapshot is the
   * authority — a charge saved as one_time stays one_time even if the service has
   * since been switched to per-day.
   */
  const storedMode = charge?.billing_mode
  const billingMode: 'one_time' | 'per_day' | 'per_hour' =
    mode === 'edit'
      ? isRangeBillingMode(storedMode)
        ? storedMode
        : 'one_time'
      : isRangeBillingMode(item?.billing_mode)
        ? (item!.billing_mode as 'per_day' | 'per_hour')
        : 'one_time'

  // Only meaningful on create: an edit touches exactly one stored row, so it
  // never asks for a range.
  const isRange = billingMode === 'per_day' && mode === 'create'
  /**
   * Hourly is a single day: one date and the hours used on it. Nothing is
   * derived from clock times, and a run spanning days is entered a day at a time.
   *
   * Unlike the range this holds on edit too — a stored per-hour row keeps its
   * hours in `qty`, and editing it through a box labelled "Quantity" is how you
   * end up typing units into an hours field.
   */
  const isHourly = billingMode === 'per_hour'
  /** A quantity only means something when the charge is billed once. */
  const showQty = billingMode === 'one_time'

  const chooseItem = (chosen: ChargeItemOption | null) => {
    setItem(chosen)
    // Only per_day asks for a range now; per_hour uses the single charge date.
    const ranged = chosen?.billing_mode === 'per_day'
    setForm(prev => ({
      ...prev,
      charge_item_id: chosen?.id ?? '',
      // Clear the free-text name when a catalogue entry takes over, and vice versa.
      charge_type: chosen ? '' : prev.charge_type,
      // Prefill the rate, but never overwrite a figure already typed.
      amount: chosen && !prev.amount ? String(chosen.default_price ?? '') : prev.amount,
      charge_date: prev.charge_date || today(),
      from_date: ranged && !prev.from_date ? today() : prev.from_date,
      to_date: ranged && !prev.to_date ? today() : prev.to_date,
    }))
  }

  const days = useMemo(
    () => (isRange ? dayCount(form.from_date, form.to_date) : 1),
    [isRange, form.from_date, form.to_date],
  )

  /** Whole hours only — the desk types a number, nothing is derived from clocks. */
  const hours = Math.trunc(Number(form.hours) || 0)

  const preview = useMemo(() => {
    const rate = Number(form.amount) || 0
    // Only a one-off charge carries a quantity; a day is one unit of itself.
    const qty = showQty ? Number(form.qty) || 1 : 1
    if (isHourly) return { total: rate * hours, rate, qty: 1 }
    return { total: rate * qty * (days || 0), rate, qty }
  }, [form.amount, form.qty, days, isHourly, hours, showQty])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})

    try {
      const payload: Record<string, any> = {
        description: form.description || null,
        amount: Number(form.amount),
        // Per-day is one unit on each of its days and per-hour keeps its hours
        // here, so neither takes a typed quantity.
        qty: isHourly ? hours : showQty ? Number(form.qty) || 1 : 1,
      }

      if (mode === 'create') {
        payload.patient_billing_id = billingId
        payload.charge_item_id = form.charge_item_id || null
        if (!form.charge_item_id) payload.charge_type = form.charge_type

        if (isRange) {
          payload.billing_mode = 'per_day'
          payload.from_date = form.from_date
          payload.to_date = form.to_date
        } else if (isHourly) {
          // Still the list shape the route expects, with the single day on it.
          payload.billing_mode = 'per_hour'
          payload.hour_lines = [{ charge_date: form.charge_date, hours }]
        } else {
          payload.charge_date = form.charge_date
        }
      } else {
        payload.charge_date = form.charge_date
        if (!form.charge_item_id) payload.charge_type = form.charge_type
      }

      const res = await fetch(
        mode === 'edit'
          ? `/api/patients/${patientId}/charges/${charge.id}`
          : `/api/patients/${patientId}/charges`,
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body?.fieldErrors) setFieldErrors(withHourLineErrors(body.fieldErrors))
        throw new Error(body?.error || 'Failed to save the charge')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const named = Boolean(form.charge_item_id || form.charge_type.trim())
  const datesReady = isRange
    ? days > 0 && days <= MAX_CHARGE_DAYS
    : Boolean(form.charge_date)
  // A day holds at most 24 hours, and billing zero of them bills nothing at all.
  const hoursReady = !isHourly || (hours >= 1 && hours <= MAX_HOURS_PER_DAY)
  const canSave =
    named && Number(form.amount) > 0 && datesReady && hoursReady && (mode === 'edit' || !!billingId)

  const submitLabel = () => {
    if (mode === 'edit') return 'Save changes'
    if (isRange && days > 1) return `Add ${days} lines`
    return 'Add charge'
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={mode === 'edit' ? 'Edit charge' : 'Add a charge'}
      description={
        isRange
          ? 'Billed per day — one line will be added for each day in the range.'
          : isHourly
            ? 'Billed by the hour — pick the day and how many hours were used on it.'
            : 'Pick a charge from the catalogue, or enter one manually.'
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="charge-entry-form" disabled={saving || !canSave}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {submitLabel()}
          </Button>
        </div>
      }
    >
      <form id="charge-entry-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* First: the modal body scrolls, and a dropdown near the bottom would be clipped. */}
        {mode === 'create' && (
          <Field id="charge-item" label="Charge" required error={fieldErrors.charge_item_id}>
            <ChargeItemSelect
              id="charge-item"
              value={form.charge_item_id}
              onChange={chooseItem}
              disabled={saving}
            />
          </Field>
        )}

        {!form.charge_item_id && (
          <Field
            id="charge-type"
            label={mode === 'edit' ? 'Charge' : 'Charge name'}
            required
            error={fieldErrors.charge_type}
            hint={mode === 'create' ? 'Not in the catalogue — this name is stored as typed.' : undefined}
          >
            <Input
              id="charge-type"
              value={form.charge_type}
              onChange={e => update('charge_type', e.target.value)}
              disabled={saving}
              placeholder="e.g. Dressing"
            />
          </Field>
        )}

        <div className={`grid grid-cols-1 gap-4 ${showQty ? 'sm:grid-cols-2' : ''}`}>
          <Field
            id="charge-amount"
            label={
              billingMode === 'per_day'
                ? 'Rate per day (₹)'
                : billingMode === 'per_hour'
                  ? 'Rate per hour (₹)'
                  : 'Rate (₹)'
            }
            required
            error={fieldErrors.amount}
            hint={
              item && Number(form.amount) !== Number(item.default_price)
                ? `Catalogue price is ${money(item.default_price)}`
                : item
                  ? 'From the catalogue — change it if this case differs.'
                  : undefined
            }
          >
            <Input
              id="charge-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onFocus={e => e.target.select()}
              onChange={e => update('amount', e.target.value)}
              disabled={saving}
            />
          </Field>

          {/* Only a one-off charge has a quantity. A per-day charge is one unit
              on each of its days, and a per-hour charge's quantity is its hours. */}
          {showQty && (
            <Field
              id="charge-qty"
              label="Quantity"
              required
              error={fieldErrors.qty}
            >
              <Input
                id="charge-qty"
                type="number"
                min="1"
                step="1"
                value={form.qty}
                onFocus={e => e.target.select()}
                onChange={e => update('qty', e.target.value)}
                disabled={saving}
              />
            </Field>
          )}
        </div>

        {isRange ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="from-date" label="From" required error={fieldErrors.from_date}>
              <Input
                id="from-date"
                type="date"
                value={form.from_date}
                onChange={e => update('from_date', e.target.value)}
                disabled={saving}
                max={form.to_date || undefined}
              />
            </Field>
            <Field
              id="to-date"
              label="To"
              required
              error={fieldErrors.to_date}
              hint={
                days > MAX_CHARGE_DAYS
                  ? `That is ${days} days — the most one entry can cover is ${MAX_CHARGE_DAYS}.`
                  : 'Both days are included.'
              }
            >
              <Input
                id="to-date"
                type="date"
                value={form.to_date}
                onChange={e => update('to_date', e.target.value)}
                disabled={saving}
                min={form.from_date || undefined}
              />
            </Field>
          </div>
        ) : isHourly ? (
          /* One day, and the hours used on it — typed, not worked out from
             clock times. A run spanning days is entered a day at a time. */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="charge-date" label="Date" required error={fieldErrors.charge_date}>
              <Input
                id="charge-date"
                type="date"
                value={form.charge_date}
                onChange={e => update('charge_date', e.target.value)}
                disabled={saving}
              />
            </Field>
            <Field
              id="charge-hours"
              label="Hours"
              required
              error={fieldErrors.hours}
              hint={`Whole hours, 1 to ${MAX_HOURS_PER_DAY}.`}
            >
              <Input
                id="charge-hours"
                type="number"
                min="1"
                max={MAX_HOURS_PER_DAY}
                step="1"
                value={form.hours}
                onFocus={e => e.target.select()}
                onChange={e => update('hours', e.target.value)}
                disabled={saving}
              />
            </Field>
          </div>
        ) : (
          <Field id="charge-date" label="Date" required error={fieldErrors.charge_date}>
            <Input
              id="charge-date"
              type="date"
              value={form.charge_date}
              onChange={e => update('charge_date', e.target.value)}
              disabled={saving}
            />
          </Field>
        )}

        {/* What is about to be billed, before it is billed. */}
        {Number(form.amount) > 0 && (isRange ? days > 0 : true) && (
          <div className="rounded-md bg-surface-inset border border-border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">
                {isHourly
                  ? `${hours} hour${hours === 1 ? '' : 's'} × ${money(preview.rate)}`
                  : isRange
                    ? `${days} day${days === 1 ? '' : 's'} × ${money(preview.rate)}`
                    : `${preview.qty} × ${money(preview.rate)}`}
              </span>
              <span className="font-semibold text-foreground">{money(preview.total)}</span>
            </div>
          </div>
        )}

        <Field id="charge-description" label="Description">
          <Textarea
            id="charge-description"
            rows={2}
            value={form.description}
            onChange={e => update('description', e.target.value)}
            disabled={saving}
            placeholder="Anything that explains this charge on the bill"
          />
        </Field>

        {mode === 'create' && !billingId && (
          <p className="text-xs text-destructive">
            This patient has no billing record yet, so a charge cannot be placed.
          </p>
        )}
      </form>
    </Modal>
  )
}
