'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  EXPENSE_DETAIL_MAX,
  LEDGER_EXPENSE_CATEGORIES,
  LEDGER_EXPENSE_CATEGORY_LABELS,
  OTHER_LEDGER_CATEGORY,
} from '@/lib/finances/constants'

interface Transaction {
  id: string
  amount: number
  payment_mode: string
  reference_number?: string
  description: string
  notes?: string
  /** This modal is reused for OPD and patient rows; only expenses carry a category. */
  source?: string
  expense_category?: string | null
  expense_category_detail?: string | null
}

interface EditTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  transaction: Transaction | null
}

export function EditTransactionModal({ isOpen, onClose, onSuccess, transaction }: EditTransactionModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    payment_mode: '',
    reference_number: '',
    description: '',
    notes: '',
    expense_category: '',
    expense_category_detail: ''
  })

  const isExpense = transaction?.source === 'expense'

  useEffect(() => {
    if (isOpen && transaction) {
      setFormData({
        amount: transaction.amount.toString(),
        payment_mode: transaction.payment_mode,
        reference_number: transaction.reference_number || '',
        description: transaction.description,
        notes: transaction.notes || '',
        expense_category: transaction.expense_category || '',
        expense_category_detail: transaction.expense_category_detail || ''
      })
    }
  }, [isOpen, transaction])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!transaction) return

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

    if (isExpense && formData.expense_category === OTHER_LEDGER_CATEGORY && !formData.expense_category_detail.trim()) {
      alert('Please describe the expense when the category is Other')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/ledger/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: parseFloat(formData.amount),
          payment_mode: formData.payment_mode,
          reference_number: formData.reference_number || null,
          description: formData.description,
          notes: formData.notes || null,
          ...(isExpense && {
            expense_category: formData.expense_category,
            expense_category_detail: formData.expense_category_detail.trim() || null
          })
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        onSuccess()
        onClose()
      } else {
        alert(data.error || 'Failed to update transaction')
      }
    } catch (error) {
      console.error('Update error:', error)
      alert('Failed to update transaction')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !transaction) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg max-w-md w-full border border-border max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Edit Transaction</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Expense rows only — this modal is also used for OPD and patient rows. */}
          {isExpense && (
            <>
              <div>
                <Label htmlFor="edit_expense_category">Expense Category *</Label>
                <select
                  id="edit_expense_category"
                  value={formData.expense_category}
                  onChange={(e) => setFormData({ ...formData, expense_category: e.target.value })}
                  className="w-full px-3 py-2 bg-input border border-input-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {/* Rows recorded before the category was stored have none. */}
                  {!formData.expense_category && <option value="">Select a category…</option>}
                  {LEDGER_EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {LEDGER_EXPENSE_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="edit_expense_category_detail">
                  {formData.expense_category === OTHER_LEDGER_CATEGORY
                    ? 'What was it for? *'
                    : 'Description (Other only)'}
                </Label>
                <Input
                  id="edit_expense_category_detail"
                  type="text"
                  value={formData.expense_category_detail}
                  onChange={(e) => setFormData({ ...formData, expense_category_detail: e.target.value })}
                  disabled={formData.expense_category !== OTHER_LEDGER_CATEGORY}
                  required={formData.expense_category === OTHER_LEDGER_CATEGORY}
                  maxLength={EXPENSE_DETAIL_MAX}
                  placeholder={
                    formData.expense_category === OTHER_LEDGER_CATEGORY
                      ? 'e.g. Courier charges'
                      : 'Only needed when the category is Other'
                  }
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="amount">Amount *</Label>
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
              placeholder="Transaction description"
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
              {loading ? 'Updating...' : 'Update Transaction'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
