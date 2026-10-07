'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { DoctorSelect } from '@/components/patients/doctor-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface OpdEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedDate: string
  mode?: 'create' | 'edit'
  initialData?: {
    id: string
    amount: number
    payment_mode: string
    reference_number?: string | null
    notes?: string | null
    description?: string | null
    transaction_date?: string | null
  }
}

export function OpdEntryModal({
  isOpen,
  onClose,
  onSuccess,
  selectedDate,
  mode = 'create',
  initialData,
}: OpdEntryModalProps) {
  const [loading, setLoading] = useState(false)

  /**
   * The OPD day. Today by default; the desk can go back to yesterday or any
   * earlier day to enter a walk-in late, but not forward (the server refuses a
   * future date too). Fixed once saved — the edit form shows it, read-only.
   */
  const [date, setDate] = useState(selectedDate)

  const [formData, setFormData] = useState({
    patient_name: '',
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    notes: '',
  })

  /**
   * The doctors who saw the walk-in, each with the fee they are to be paid, and
   * the medicine inside the payment (client, 28 Sep). Each doctor becomes a
   * visit and an unpaid fee on the doctor's page; medicine is the hospital's
   * expense. A doctor whose fee is already paid is shown but locked.
   */
  const [doctors, setDoctors] = useState<{ doctor_id: string; name?: string | null; fee: string; paid?: boolean }[]>([])
  const [medicine, setMedicine] = useState('')
  const anyPaid = doctors.some(d => d.paid)

  /**
   * Extract patient name from:
   * "OPD John Doe" → "John Doe"
   */
  const extractPatientName = (description?: string | null) => {
    if (!description) return ''
    return description.startsWith('OPD ')
      ? description.replace(/^OPD\s+/i, '')
      : ''
  }

  const formatDay = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const formatIndianNumber = (value: string) => {
    const number = value.replace(/,/g, '')
    if (!number) return ''
    return Number(number).toLocaleString('en-IN')
  }

  const parseIndianNumber = (value: string) => {
    return value.replace(/,/g, '')
  }


  useEffect(() => {
    if (isOpen && mode === 'edit' && initialData?.id) {
      let cancelled = false
      fetch(`/api/ledger/transactions/${initialData.id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(body => {
          if (cancelled || !body?.data) return
          setMedicine(body.data.medicine_expense ? String(body.data.medicine_expense) : '')
          setDoctors(
            (body.data.doctors ?? []).map((d: any) => ({
              doctor_id: d.doctor_id,
              name: d.doctor_name,
              fee: String(d.fee ?? ''),
              paid: d.paid,
            })),
          )
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }
  }, [isOpen, mode, initialData?.id])

  useEffect(() => {
    if (isOpen && mode === 'edit' && initialData) {
      setFormData({
        patient_name: extractPatientName(initialData.description),
        amount: String(initialData.amount ?? ''),
        payment_mode: initialData.payment_mode ?? 'cash',
        reference_number: initialData.reference_number ?? '',
        notes: initialData.notes ?? '',
      })
    }

    if (isOpen && mode === 'create') {
      setDate(selectedDate)
    }

    if (!isOpen) {
      setFormData({
        patient_name: '',
        amount: '',
        payment_mode: 'cash',
        reference_number: '',
        notes: '',
      })
      setDoctors([])
      setMedicine('')
    }
  }, [isOpen, mode, initialData, selectedDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patient_name.trim()) {
      alert('Patient name is required')
      return
    }

    if (mode === 'create' && (!date || date > selectedDate)) {
      alert("Pick the OPD date (it can't be in the future)")
      return
    }

    if (!formData.amount || Number(formData.amount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (
      formData.payment_mode === 'upi' &&
      !formData.reference_number.trim()
    ) {
      alert('UPI reference number is required')
      return
    }

    const picked = doctors.filter(d => d.doctor_id)
    if (picked.some(d => !(Number(d.fee) > 0))) {
      alert("Enter each doctor's fee")
      return
    }

    try {
      setLoading(true)
      const extras = {
        doctors: picked.map(d => ({ doctor_id: d.doctor_id, fee: Number(d.fee) })),
        medicine_expense: medicine ? Number(parseIndianNumber(medicine)) : null,
      }
      // Editing saves over the entry (it used to POST a second copy; the form
      // was never opened in edit mode until OPD entries gained doctors).
      const editing = mode === 'edit' && initialData?.id
      const response = await fetch(editing ? `/api/ledger/transactions/${initialData!.id}` : '/api/ledger/transactions', {
        method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...(editing
              ? {}
              : { transaction_date: date, transaction_type: 'credit', source: 'opd' }),
            amount: Number(parseIndianNumber(formData.amount)),
            payment_mode: formData.payment_mode,
            reference_number: formData.reference_number || null,
            description: `OPD ${formData.patient_name}`,
            notes: formData.notes || null,
            ...extras,
          }),
        }
      )

      const data = await response.json()

      if (response.ok && data.success) {
        onSuccess()
        onClose()
      } else {
        alert(data.error || 'Failed to save OPD entry')
      }
    } catch (err) {
      console.error(err)
      alert('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg max-w-md w-full border border-border max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            {mode === 'edit' ? 'Edit OPD Entry' : 'Add OPD Entry'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* OPD date */}
          <div>
            <Label htmlFor="opd_date">Date *</Label>
            {mode === 'edit' ? (
              <p id="opd_date" className="text-sm text-foreground py-2">
                {initialData?.transaction_date ? formatDay(initialData.transaction_date) : '—'}
              </p>
            ) : (
              <>
                <Input
                  id="opd_date"
                  type="date"
                  value={date}
                  max={selectedDate}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {date && date !== selectedDate && (
                  <p className="text-xs text-muted mt-1">Entering a past OPD visit for {formatDay(date)}.</p>
                )}
              </>
            )}
          </div>

          {/* Patient Name */}
          <div>
            <Label htmlFor="patient_name">Patient Name *</Label>
            <Input
              id="patient_name"
              value={formData.patient_name}
              onChange={(e) =>
                setFormData({ ...formData, patient_name: e.target.value })
              }
              placeholder="Enter patient name"
              required
            />
          </div>

          {/* Amount */}
          <div>
            <Label htmlFor="amount">OPD Amount *</Label>
            <Input
              id="amount"
              type="text"
              inputMode="numeric"
              value={formData.amount}
              onChange={(e) => {
                const rawValue = e.target.value.replace(/[^\d]/g, '')
                setFormData({
                  ...formData,
                  amount: formatIndianNumber(rawValue),
                })
              }}
              placeholder="Enter amount"
              required
            />
          </div>

          {/* Payment Mode */}
          <div>
            <Label htmlFor="payment_mode">Payment Mode *</Label>
            <select
              id="payment_mode"
              value={formData.payment_mode}
              onChange={(e) =>
                setFormData({ ...formData, payment_mode: e.target.value })
              }
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          {/* Reference */}
          <div>
            <Label htmlFor="reference_number">
              Reference{' '}
              {formData.payment_mode === 'upi'
                ? '(Required for UPI)'
                : '(Optional)'}
            </Label>
            <Input
              id="reference_number"
              value={formData.reference_number}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  reference_number: e.target.value,
                })
              }
              required={formData.payment_mode === 'upi'}
            />
          </div>

          {/* Doctors seen — each becomes a fee to pay on the doctor's page. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Doctors seen</Label>
              <button
                type="button"
                onClick={() => setDoctors([...doctors, { doctor_id: '', fee: '' }])}
                disabled={anyPaid}
                className="flex items-center gap-1 text-sm text-info hover:underline disabled:opacity-50"
              >
                <Plus size={14} /> Add doctor
              </button>
            </div>
            {doctors.length === 0 && <p className="text-xs text-muted">None — optional.</p>}
            {doctors.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {d.paid ? (
                    <p className="text-sm text-foreground py-2">{d.name} <span className="text-xs text-success-text">· paid</span></p>
                  ) : (
                    <DoctorSelect
                      id={`opd-doctor-${i}`}
                      value={d.doctor_id}
                      onChange={id => setDoctors(doctors.map((x, j) => (j === i ? { ...x, doctor_id: id } : x)))}
                      includeId={d.doctor_id || undefined}
                      fallbackLabel={d.name ?? undefined}
                    />
                  )}
                </div>
                <Input
                  aria-label="Fee for this doctor"
                  inputMode="numeric"
                  placeholder="Fee"
                  className="w-24"
                  value={d.fee}
                  disabled={d.paid || anyPaid}
                  onChange={e => /^\d*$/.test(e.target.value) && setDoctors(doctors.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)))}
                />
                <button
                  type="button"
                  onClick={() => setDoctors(doctors.filter((_, j) => j !== i))}
                  disabled={anyPaid}
                  aria-label="Remove this doctor"
                  className="p-1.5 text-muted hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {anyPaid && (
              <p className="text-xs text-muted">A doctor&apos;s fee here is already paid, so the doctors can&apos;t change.</p>
            )}
          </div>

          {/* Medicine inside the payment — the hospital's expense. */}
          <div>
            <Label htmlFor="opd-medicine">Medicine (optional)</Label>
            <Input
              id="opd-medicine"
              inputMode="numeric"
              placeholder="Amount of medicine in this payment"
              value={medicine}
              onChange={e => /^[\d,]*$/.test(e.target.value) && setMedicine(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">Counted as the hospital&apos;s expense (Finances ▸ Medicine).</p>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <textarea
              id="notes"
              rows={2}
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading
                ? mode === 'edit'
                  ? 'Updating...'
                  : 'Creating...'
                : mode === 'edit'
                  ? 'Update Entry'
                  : 'Create Entry'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
