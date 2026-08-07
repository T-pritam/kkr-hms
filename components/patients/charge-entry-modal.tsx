'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import {
  ChargeItemSelect,
  type ChargeItemOption,
} from '@/components/charges/charge-item-select'
import { MAX_CHARGE_DAYS, isRangeBillingMode } from '@/lib/billing/constants'

/**
 * Placing a charge on a patient, and correcting one.
 *
 * The form has two shapes, and which one it shows is decided by the catalogue
 * entry rather than by the user. A one-time charge asks for a single date. A
 * per-day charge — room rent, oxygen, a nebuliser — asks for a range and is
 * written as one row per day, which is what makes a single day repriceable or
 * removable afterwards.
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

/** Every date from `from` to `to` inclusive, stepped in UTC so a DST boundary
 * never repeats or skips a day. Mirrors expandDateRange in lib/billing/validate.ts. */
function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

/** A day of a per-hour entry, as the form holds it. */
interface HourRow {
  charge_date: string
  hours: string
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
  const [hoursByDate, setHoursByDate] = useState<Record<string, string>>({})
  const [removedDays, setRemovedDays] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setFieldErrors({})
    setItem(null)
    setHoursByDate({})
    setRemovedDays(new Set())

    setForm(
      charge
        ? {
            charge_item_id: charge.charge_item_id || '',
            charge_type: charge.charge_type || '',
            description: charge.description || '',
            amount: String(charge.amount ?? ''),
            qty: String(charge.qty ?? 1),
            charge_date: String(charge.charge_date || '').slice(0, 10),
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

  // Only meaningful on create: an edit touches exactly one stored row.
  const isRange = billingMode === 'per_day' && mode === 'create'
  const isHourly = billingMode === 'per_hour' && mode === 'create'
  /** Both range modes ask for from/to dates; only the hourly one asks per day. */
  const hasDateRange = isRange || isHourly

  const chooseItem = (chosen: ChargeItemOption | null) => {
    setItem(chosen)
    const ranged = isRangeBillingMode(chosen?.billing_mode)
    setForm(prev => ({
      ...prev,
      charge_item_id: chosen?.id ?? '',
      // Clear the free-text name when a catalogue entry takes over, and vice versa.
      charge_type: chosen ? '' : prev.charge_type,
      // Prefill the rate, but never overwrite a figure already typed.
      amount: chosen && !prev.amount ? String(chosen.default_price ?? '') : prev.amount,
      from_date: ranged && !prev.from_date ? today() : prev.from_date,
      to_date: ranged && !prev.to_date ? today() : prev.to_date,
    }))
  }

  const days = useMemo(
    () => (hasDateRange ? dayCount(form.from_date, form.to_date) : 1),
    [hasDateRange, form.from_date, form.to_date],
  )

  /**
   * The per-day hour rows, derived from the range rather than stored.
   *
   * Deriving means a range change can never strand or duplicate a row: the days
   * come from the range, the hours typed so far are looked up by date, and days
   * the user removed stay removed. Holding the rows in state instead would need
   * every one of those cases reconciled by hand on each keystroke.
   */
  const hourRows = useMemo<HourRow[]>(() => {
    if (!isHourly) return []
    if (!form.from_date || !form.to_date || days < 1 || days > MAX_CHARGE_DAYS) return []

    return eachDay(form.from_date, form.to_date)
      .filter(day => !removedDays.has(day))
      .map(day => ({ charge_date: day, hours: hoursByDate[day] ?? '' }))
  }, [isHourly, form.from_date, form.to_date, days, removedDays, hoursByDate])

  const totalHours = useMemo(
    () => hourRows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0),
    [hourRows],
  )

  const preview = useMemo(() => {
    const rate = Number(form.amount) || 0
    const qty = Number(form.qty) || 1
    if (isHourly) return { total: rate * totalHours, rate, qty: 1 }
    return { total: rate * qty * (days || 0), rate, qty }
  }, [form.amount, form.qty, days, isHourly, totalHours])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})

    try {
      const payload: Record<string, any> = {
        description: form.description || null,
        amount: Number(form.amount),
        qty: Number(form.qty) || 1,
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
          // The days are sent explicitly rather than as a range: the desk may
          // have removed the days the service was not used on.
          payload.billing_mode = 'per_hour'
          payload.hour_lines = hourRows.map(row => ({
            charge_date: row.charge_date,
            hours: Number(row.hours),
          }))
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
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors)
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
  const datesReady = hasDateRange
    ? days > 0 && days <= MAX_CHARGE_DAYS
    : Boolean(form.charge_date)
  // Every remaining day must carry hours, or the entry silently bills nothing
  // for that day.
  const hoursReady =
    !isHourly || (hourRows.length > 0 && hourRows.every(r => Number(r.hours) >= 1))
  const canSave =
    named && Number(form.amount) > 0 && datesReady && hoursReady && (mode === 'edit' || !!billingId)

  const submitLabel = () => {
    if (mode === 'edit') return 'Save changes'
    if (isHourly && hourRows.length > 0) {
      return `Add ${hourRows.length} ${hourRows.length === 1 ? 'day' : 'days'}`
    }
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
            ? 'Billed by the hour — pick the range, then enter the hours used on each day.'
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

        <div className={`grid grid-cols-1 gap-4 ${isHourly ? '' : 'sm:grid-cols-2'}`}>
          <Field
            id="charge-amount"
            label={isRange ? 'Rate per day (₹)' : isHourly ? 'Rate per hour (₹)' : 'Rate (₹)'}
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

          {/* Hourly has no separate quantity — the hours on each day are it. */}
          {!isHourly && (
            <Field
              id="charge-qty"
              label={isRange ? 'Units per day' : 'Quantity'}
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

        {hasDateRange ? (
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

        {/* One row per day of the range: type the hours used, or drop the day.
            Nothing is computed from clock times — the hours are what the desk
            says they are. */}
        {isHourly && hourRows.length > 0 && (
          <div className="space-y-1.5">
            <Label>
              Hours on each day <span className="text-destructive">*</span>
            </Label>
            <ul className="rounded-md border border-border divide-y divide-input-border max-h-56 overflow-y-auto">
              {hourRows.map(row => (
                <li key={row.charge_date} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-sm text-foreground flex-1 min-w-0">
                    {new Date(`${row.charge_date}T00:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    aria-label={`Hours on ${row.charge_date}`}
                    className="w-24 h-9"
                    value={row.hours}
                    placeholder="hrs"
                    onFocus={e => e.target.select()}
                    onChange={e =>
                      setHoursByDate(prev => ({ ...prev, [row.charge_date]: e.target.value }))
                    }
                    disabled={saving}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${row.charge_date}`}
                    className="text-muted hover:text-destructive shrink-0"
                    onClick={() =>
                      setRemovedDays(prev => new Set(prev).add(row.charge_date))
                    }
                    disabled={saving}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              {removedDays.size > 0 && (
                <>
                  {removedDays.size} day{removedDays.size === 1 ? '' : 's'} removed ·{' '}
                  <button
                    type="button"
                    className="text-info underline"
                    onClick={() => setRemovedDays(new Set())}
                  >
                    restore
                  </button>
                  {' · '}
                </>
              )}
              {totalHours} hour{totalHours === 1 ? '' : 's'} across {hourRows.length} day
              {hourRows.length === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {/* What is about to be billed, before it is billed. */}
        {Number(form.amount) > 0 && (hasDateRange ? days > 0 : true) && (
          <div className="rounded-md bg-surface-inset border border-border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">
                {isHourly
                  ? `${totalHours} hour${totalHours === 1 ? '' : 's'} × ${money(preview.rate)}`
                  : isRange
                    ? `${days} day${days === 1 ? '' : 's'} × ${preview.qty} × ${money(preview.rate)}`
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
