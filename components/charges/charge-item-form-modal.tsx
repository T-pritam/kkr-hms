'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CHARGE_BILLING_MODES,
  CHARGE_BILLING_MODE_LABELS,
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
} from '@/lib/billing/constants'

/**
 * Adding and editing a catalogue entry.
 *
 * The field that needs explaining is `billing_mode`, because it is the only one
 * that changes behaviour rather than labelling: it decides whether the charge
 * form asks for a single date or a date range, and a per-day service billed as
 * one_time silently under-bills a whole stay. Hence the hint under the select
 * rather than a bare dropdown.
 */

export interface ChargeItem {
  id: string
  code: string | null
  name: string
  category: string
  billing_mode: string
  default_price: number
  unit_label: string | null
  notes: string | null
  is_active: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** Omit to add a new entry. */
  item?: ChargeItem | null
}

interface FormState {
  name: string
  code: string
  category: string
  billing_mode: string
  default_price: string
  unit_label: string
  notes: string
  is_active: boolean
}

const BLANK: FormState = {
  name: '',
  code: '',
  category: 'procedure',
  billing_mode: 'one_time',
  default_price: '0',
  unit_label: '',
  notes: '',
  is_active: true,
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

export function ChargeItemFormModal({ isOpen, onClose, onSuccess, item }: Props) {
  const mode: 'create' | 'edit' = item ? 'edit' : 'create'

  const [form, setForm] = useState<FormState>(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setFieldErrors({})

    setForm(
      item
        ? {
            name: item.name ?? '',
            code: item.code ?? '',
            category: item.category ?? 'procedure',
            billing_mode: item.billing_mode ?? 'one_time',
            default_price: String(item.default_price ?? 0),
            unit_label: item.unit_label ?? '',
            notes: item.notes ?? '',
            is_active: item.is_active !== false,
          }
        : BLANK,
    )
  }, [isOpen, item])

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
    // Clear the error on the field being corrected, not all of them.
    setFieldErrors(prev => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as string]
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})

    try {
      const payload = {
        name: form.name,
        code: form.code || null,
        category: form.category,
        billing_mode: form.billing_mode,
        default_price: Number(form.default_price) || 0,
        unit_label: form.unit_label || null,
        notes: form.notes || null,
        is_active: form.is_active,
      }

      const res = await fetch(
        mode === 'edit' ? `/api/charge-items/${item!.id}` : '/api/charge-items',
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={mode === 'edit' ? 'Edit charge' : 'Add a charge'}
      description="The name, category and billing mode are required. The price is a default and can be changed when the charge is placed."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="charge-item-form" disabled={saving || !form.name.trim()}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {mode === 'edit' ? 'Save changes' : 'Add charge'}
          </Button>
        </div>
      }
    >
      <form id="charge-item-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Field id="ci-name" label="Name" required error={fieldErrors.name}>
              <Input
                id="ci-name"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                disabled={saving}
                placeholder="ICU Bed"
              />
            </Field>
          </div>

          <Field id="ci-code" label="Code" error={fieldErrors.code} hint="Optional short code">
            <Input
              id="ci-code"
              value={form.code}
              onChange={e => update('code', e.target.value)}
              disabled={saving}
              placeholder="ICU"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="ci-category" label="Category" required error={fieldErrors.category}>
            <Select
              id="ci-category"
              value={form.category}
              onChange={e => update('category', e.target.value)}
              disabled={saving}
            >
              {CHARGE_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {CHARGE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="ci-mode"
            label="Billing mode"
            required
            error={fieldErrors.billing_mode}
            hint={
              form.billing_mode === 'per_day'
                ? 'Billed for every day of a stay. Entry asks for a date range and writes one row per day.'
                : form.billing_mode === 'per_hour'
                  ? 'Billed by the hour. Entry asks for a date range and the hours used on each day.'
                  : 'Billed once. Entry asks for a single date.'
            }
          >
            <Select
              id="ci-mode"
              value={form.billing_mode}
              onChange={e => update('billing_mode', e.target.value)}
              disabled={saving}
            >
              {CHARGE_BILLING_MODES.map(m => (
                <option key={m} value={m}>
                  {CHARGE_BILLING_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="ci-price"
            label="Default price (₹)"
            error={fieldErrors.default_price}
            hint="Prefilled when the charge is placed, and editable there. Leave at 0 to always type it in."
          >
            <Input
              id="ci-price"
              type="number"
              min="0"
              step="0.01"
              value={form.default_price}
              onFocus={e => e.target.select()}
              onChange={e => update('default_price', e.target.value)}
              disabled={saving}
            />
          </Field>

          <Field
            id="ci-unit"
            label="Unit label"
            error={fieldErrors.unit_label}
            hint="Display only, e.g. “per day”"
          >
            <Input
              id="ci-unit"
              value={form.unit_label}
              onChange={e => update('unit_label', e.target.value)}
              disabled={saving}
              placeholder={
                form.billing_mode === 'per_day'
                  ? 'per day'
                  : form.billing_mode === 'per_hour'
                    ? 'per hour'
                    : 'per unit'
              }
            />
          </Field>
        </div>

        <Field id="ci-notes" label="Notes">
          <Textarea
            id="ci-notes"
            rows={2}
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            disabled={saving}
            placeholder="Anything the desk should know before billing this"
          />
        </Field>

        {mode === 'edit' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ci-active"
                checked={form.is_active}
                onChange={e => update('is_active', e.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <label htmlFor="ci-active" className="text-sm text-foreground">
                Available for new charges
              </label>
            </div>
            <p className="text-xs text-muted pl-6">
              Off: retired. It stops appearing when placing a charge, but bills that already name
              it are untouched.
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}
