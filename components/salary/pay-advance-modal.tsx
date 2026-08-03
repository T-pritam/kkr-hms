'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { inr } from '@/lib/format/currency'
import { useUser } from '@/hooks/use-user'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

/**
 * Paying a salary advance.
 *
 * Rebuilt onto `components/ui/modal.tsx` and the house form style. Four things
 * changed beyond the styling, all of them defects:
 *
 *   - **The Amount box had no `min`.** It is `type="number" step="0.01"` inside
 *     an `overflow-y-auto` body, so a mouse wheel over the focused field steps
 *     it — twenty notches reach exactly `-0.2` and it sticks, because the
 *     validator showed a message but never corrected the value. It now clamps
 *     on the way in and cannot hold a negative.
 *   - **Every figure went through `toFixed(2)`** while the screens either side
 *     used `toLocaleString` with a *maximum* of two decimals, which drops
 *     trailing zeros. Both now go through `inr()`.
 *   - **Month-Year was a controlled input with a `value` and no `onChange`**,
 *     which warns in the console and is silently uneditable. It is now plainly
 *     read-only.
 *   - **Errors were `alert()`.** They are now inline, against the field.
 *
 * New: **Given by** — who physically handed over the cash, which is often not
 * whoever is at the keyboard. Who is at the keyboard is captured automatically.
 */

interface PayAdvanceModalProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string | null
  selectedMonth: string
  employeeName: string
  onSuccess: () => void
}

interface ValidationData {
  // Null for a Receptionist: the API withholds every rupee figure for that
  // role, so these fields are absent rather than merely hidden in the UI.
  max_allowed_advance: number | null
  can_add_advance: boolean
  validation_message: string | null
  scenario: string
  current_total_advances: number | null
  calculated_salary: number | null
  base_salary: number | null
  status: string | null
}

const today = () => new Date().toISOString().split('T')[0]

export function PayAdvanceModal({
  isOpen,
  onClose,
  employeeId,
  selectedMonth,
  employeeName,
  onSuccess,
}: PayAdvanceModalProps) {
  const { user } = useUser()

  const [loading, setLoading] = useState(false)
  const [validationLoading, setValidationLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [dateGiven, setDateGiven] = useState(today())
  const [givenBy, setGivenBy] = useState('')
  const [remarks, setRemarks] = useState('')
  const [validation, setValidation] = useState<ValidationData | null>(null)
  const [amountError, setAmountError] = useState('')
  const [error, setError] = useState('')

  const fetchValidationRules = useCallback(async () => {
    if (!employeeId || !selectedMonth) return
    try {
      setValidationLoading(true)
      const res = await fetch(
        `/api/employees/${employeeId}/salary/advances/validation?month_year=${selectedMonth}`,
        { credentials: 'include' },
      )
      const body = await res.json().catch(() => ({}))

      if (!res.ok || !body?.success) {
        throw new Error(body?.error || 'Could not read the advance limit')
      }

      setValidation(body.data)
      setError('')
    } catch (err: any) {
      // Shown rather than swallowed — the old modal console.error'd and left the
      // panel blank, so a failure looked identical to "no limit information".
      setError(err.message)
      setValidation(null)
    } finally {
      setValidationLoading(false)
    }
  }, [employeeId, selectedMonth])

  useEffect(() => {
    if (!isOpen) return
    setAmount('')
    setDateGiven(today())
    setGivenBy('')
    setRemarks('')
    setAmountError('')
    setError('')
    void fetchValidationRules()
  }, [isOpen, fetchValidationRules])

  /**
   * Clamp on the way in.
   *
   * Refusing the keystroke rather than merely complaining about it is what
   * stops the field from *holding* a negative — which is how a spinner or a
   * scroll wheel put `-0.2` on screen.
   */
  const changeAmount = (raw: string) => {
    if (raw === '') {
      setAmount('')
      setAmountError('')
      return
    }

    const n = Number.parseFloat(raw)
    if (Number.isFinite(n) && n < 0) {
      setAmount('0')
      setAmountError('Advance amount must be greater than 0')
      return
    }

    setAmount(raw)
  }

  useEffect(() => {
    if (!amount || !validation) {
      setAmountError('')
      return
    }

    const numAmount = Number.parseFloat(amount)

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setAmountError('Advance amount must be greater than 0')
      return
    }

    // Reception gets no cap to compare against — the server still enforces
    // it on submit, this is just the early client-side hint that's
    // unavailable for that role.
    if (validation.max_allowed_advance != null && numAmount > validation.max_allowed_advance) {
      setAmountError(`Advance cannot exceed ${inr(validation.max_allowed_advance)}`)
      return
    }

    setAmountError('')
  }, [amount, validation])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !dateGiven) {
      setError('Enter an amount and a date')
      return
    }
    if (amountError) return
    if (validation && !validation.can_add_advance) {
      setError(validation.validation_message || 'Cannot add an advance at this time')
      return
    }

    try {
      setLoading(true)
      setError('')

      const res = await fetch(`/api/employees/${employeeId}/salary/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: Number.parseFloat(amount),
          date_given: dateGiven,
          month_year: selectedMonth,
          given_by: givenBy.trim() || null,
          remarks: remarks || null,
        }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (body?.fieldErrors?.amount) setAmountError(String(body.fieldErrors.amount))
        throw new Error(body?.error || 'Failed to add the advance')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const Figure = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Pay advance"
      description={`${employeeName} · ${selectedMonth}`}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="pay-advance-form"
            disabled={
              loading ||
              validationLoading ||
              !validation?.can_add_advance ||
              !amount ||
              !!amountError
            }
          >
            {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
            Add advance
          </Button>
        </div>
      }
    >
      <form id="pay-advance-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {validationLoading ? (
          <div className="rounded-lg border border-border p-4 text-sm text-muted">
            Reading the advance limit…
          </div>
        ) : validation ? (
          <section className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">This month</h3>
              <div className="flex items-center gap-2">
                <Badge variant="info">{validation.scenario}</Badge>
                {validation.status && (
                  <Badge variant={validation.status === 'settled' ? 'destructive' : 'success'}>
                    {validation.status.charAt(0).toUpperCase() + validation.status.slice(1)}
                  </Badge>
                )}
              </div>
            </div>

            {(validation.base_salary != null ||
              validation.calculated_salary != null ||
              (validation.current_total_advances ?? 0) > 0 ||
              validation.max_allowed_advance != null) && (
              <div className="grid grid-cols-2 gap-3">
                {validation.base_salary != null && (
                  <Figure label="Base salary" value={inr(validation.base_salary)} />
                )}
                {validation.calculated_salary != null && (
                  <Figure label="Calculated salary" value={inr(validation.calculated_salary)} />
                )}
                {validation.current_total_advances != null && validation.current_total_advances > 0 && (
                  <Figure
                    label="Already drawn"
                    value={`- ${inr(validation.current_total_advances)}`}
                  />
                )}
                {validation.max_allowed_advance != null && (
                  <Figure label="Maximum allowed" value={inr(validation.max_allowed_advance, { clamp: true })} />
                )}
              </div>
            )}

            <div className="pt-3 border-t border-border">
              {validation.can_add_advance ? (
                <div className="flex items-start gap-2 text-success-text">
                  <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  <span className="text-sm">
                    {validation.max_allowed_advance != null
                      ? `Up to ${inr(validation.max_allowed_advance, { clamp: true })} can be advanced.`
                      : 'An advance can be added for this employee.'}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span className="text-sm">{validation.validation_message}</span>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="advance-amount">
              Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              id="advance-amount"
              type="number"
              // The two attributes the old field was missing. `min` stops the
              // spinner and the scroll wheel from going below zero at all.
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="10000"
              value={amount}
              onChange={e => changeAmount(e.target.value)}
              className={amountError ? 'border-destructive' : ''}
              required
            />
            {amountError && <p className="text-xs text-destructive">{amountError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="advance-date">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="advance-date"
              type="date"
              value={dateGiven}
              onChange={e => setDateGiven(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="advance-given-by">Given by</Label>
            <Input
              id="advance-given-by"
              value={givenBy}
              onChange={e => setGivenBy(e.target.value)}
              placeholder="Who handed over the cash"
            />
            <p className="text-xs text-muted">Leave blank if that was you.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="advance-month">Month</Label>
            <Input id="advance-month" value={selectedMonth} readOnly disabled />
            <p className="text-xs text-muted">Set by the month you are viewing.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="advance-remarks">Remarks</Label>
          <Input
            id="advance-remarks"
            placeholder="Optional"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
          />
        </div>

        {user?.username && (
          <p className="text-xs text-muted">
            Recorded by {user.username} — captured automatically, not editable.
          </p>
        )}
      </form>
    </Modal>
  )
}
