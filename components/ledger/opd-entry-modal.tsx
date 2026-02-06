'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
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

  const [formData, setFormData] = useState({
    patient_name: '',
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    notes: '',
  })

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

  const formatIndianNumber = (value: string) => {
    const number = value.replace(/,/g, '')
    if (!number) return ''
    return Number(number).toLocaleString('en-IN')
  }

  const parseIndianNumber = (value: string) => {
    return value.replace(/,/g, '')
  }


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

    if (!isOpen) {
      setFormData({
        patient_name: '',
        amount: '',
        payment_mode: 'cash',
        reference_number: '',
        notes: '',
      })
    }
  }, [isOpen, mode, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patient_name.trim()) {
      alert('Patient name is required')
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

    try {
      setLoading(true)
      const response = await fetch('/api/ledger/transactions', {
        method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            transaction_date: selectedDate,
            transaction_type: 'credit',
            source: 'opd',
            amount: Number(parseIndianNumber(formData.amount)),
            payment_mode: formData.payment_mode,
            reference_number: formData.reference_number || null,
            description: `OPD ${formData.patient_name}`,
            notes: formData.notes || null,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-md w-full border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">
            {mode === 'edit' ? 'Edit OPD Entry' : 'Add OPD Entry'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
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
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white"
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
