'use client'

/**
 * Paying an employee an advance from the desk (PRD v2, CR-03).
 *
 * The client: *"Add an Employee Advance section to the receptionist view so
 * receptionists can pay advances to employees. Receptionists must NOT see other
 * employee details such as salary, present days, or remaining amount to settle."*
 *
 * So the form asks for a person, an amount, a date and a note — and nothing on
 * it quotes a salary or a remaining limit. The cap still applies; when it bites,
 * the desk is told to ask an admin and not how much is left (Q-16 = A).
 *
 * The employee list comes from `/api/employees/for-advance`, which returns only
 * code, name and designation, so the figures are absent from the response as
 * well as from the screen.
 */

import { useEffect, useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { istToday } from '@/lib/dates/ist'

interface Employee {
  id: string
  employee_code: string | null
  name: string
  designation: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** The month the advance counts against; the log's month picker sets it. */
  monthYear: string
  /** Shown to the desk only, so they know what the float can cover. */
  pettyCashBalance?: number | null
}

const inr = (value: number) =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PayAdvanceModal({ isOpen, onClose, onSuccess, monthYear, pettyCashBalance }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState('')
  const [dateGiven, setDateGiven] = useState(istToday())
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return

    setEmployeeId('')
    setAmount('')
    setDateGiven(istToday())
    setRemarks('')
    setError('')

    fetch('/api/employees/for-advance')
      .then(r => (r.ok ? r.json() : null))
      .then(body => setEmployees(body?.data || []))
      .catch(() => setError('The employee list could not be loaded'))
  }, [isOpen])

  if (!isOpen) return null

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/employees/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          amount: Number(amount),
          date_given: dateGiven,
          month_year: monthYear,
          remarks: remarks.trim() || null,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'The advance could not be paid')

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ready = employeeId && Number(amount) > 0 && dateGiven

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <HandCoins className="h-5 w-5" /> Pay an advance
        </h2>

        {pettyCashBalance !== null && pettyCashBalance !== undefined && (
          <p className="text-sm text-muted">
            This comes out of petty cash, which holds {inr(pettyCashBalance)} right now.
          </p>
        )}

        <div>
          <label className="text-sm text-muted">Employee</label>
          <select
            className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
          >
            <option value="">Choose someone…</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
                {employee.employee_code ? ` (${employee.employee_code})` : ''}
                {employee.designation ? ` — ${employee.designation}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted">Amount</label>
            <Input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="2000"
            />
          </div>
          <div>
            <label className="text-sm text-muted">Date</label>
            <Input type="date" value={dateGiven} onChange={e => setDateGiven(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted">Note (optional)</label>
          <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. medical" />
        </div>

        <p className="text-xs text-muted">
          Counts against {monthYear}. It shows in the advance log and as a petty cash debit.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || saving}>
            {saving ? 'Saving…' : 'Pay advance'}
          </Button>
        </div>
      </div>
    </div>
  )
}
