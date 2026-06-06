import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ExpenseEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedDate: string
}

export function ExpenseEntryModal({ isOpen, onClose, onSuccess, selectedDate }: ExpenseEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    expense_category: 'supplies',
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    description: '',
    notes: ''
  })

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        expense_category: 'supplies',
        amount: '',
        payment_mode: 'cash',
        reference_number: '',
        description: '',
        notes: ''
      })
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (!formData.description.trim()) {
      alert('Please enter a description')
      return
    }

    if (formData.payment_mode === 'upi' && !formData.reference_number.trim()) {
      alert('UPI reference number is required for UPI payments')
      return
    }

    try {
      setLoading(true)
      const response = await apiFetch('/api/ledger/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transaction_date: selectedDate,
          transaction_type: 'debit',
          source: 'expense',
          amount: parseFloat(formData.amount),
          payment_mode: formData.payment_mode,
          reference_number: formData.reference_number || null,
          description: formData.description,
          notes: formData.notes || null
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        onSuccess()
        onClose()
      } else {
        alert(data.error || 'Failed to create expense')
      }
    } catch (error) {
      console.error('Create error:', error)
      alert('Failed to create expense')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg max-w-md w-full border border-border max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Add Expense</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div>
            <Label htmlFor="expense_category">Expense Category *</Label>
            <select
              id="expense_category"
              value={formData.expense_category}
              onChange={(e) => setFormData({ ...formData, expense_category: e.target.value })}
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="supplies">Medical Supplies</option>
              <option value="utilities">Utilities & Rent</option>
              <option value="maintenance">Maintenance</option>
              <option value="staff">Staff Bonus</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <Label htmlFor="amount">Expense Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              max="100000"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Enter amount"
              required
            />
          </div>

          <div>
            <Label htmlFor="payment_mode">Payment Mode *</Label>
            <select
              id="payment_mode"
              value={formData.payment_mode}
              onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div>
            <Label htmlFor="reference_number">
              Reference {formData.payment_mode === 'upi' ? '(Required for UPI)' : '(Optional)'}
            </Label>
            <Input
              id="reference_number"
              type="text"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="UPI ID / Transaction ID / Cheque #"
              required={formData.payment_mode === 'upi'}
            />
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this expense for?"
              required
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes"
              rows={2}
              className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Creating...' : 'Create Expense'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
