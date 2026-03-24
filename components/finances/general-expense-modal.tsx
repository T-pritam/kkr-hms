'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Edit2, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const EXPENSE_TYPES = [
  'Electric Bill',
  'Oxygen Supply',
  'Lift Maintenance',
  'Water & Sanitation',
  'Cleaning Supplies',
  'Medical Equipment Maintenance',
  'Internet/Telecom',
  'Miscellaneous',
]

interface Expense {
  id: number
  expense_type: string
  amount: number
  expense_date: string
  month_year: string
  remarks?: string
  created_at: string
}

interface GeneralExpenseModalProps {
  isOpen: boolean
  onClose: () => void
  monthYear: string
  initialExpense?: Expense | null
}

export function GeneralExpenseModal({ isOpen, onClose, monthYear, initialExpense }: GeneralExpenseModalProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [formData, setFormData] = useState({
    expense_type: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    month_year: monthYear,
    remarks: '',
  })

  useEffect(() => {
    if (isOpen) {
      fetchExpenses()
      if (initialExpense) {
        setFormData({
          expense_type: initialExpense.expense_type,
          amount: initialExpense.amount.toString(),
          expense_date: initialExpense.expense_date,
          month_year: initialExpense.month_year,
          remarks: initialExpense.remarks || '',
        })
        setEditingId(initialExpense.id)
      }
    }
  }, [isOpen, monthYear, initialExpense])

  useEffect(() => {
    setFormData(prev => ({ ...prev, month_year: monthYear }))
  }, [monthYear])

  const fetchExpenses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/finances/expenses?month_year=${monthYear}`)
      const result = await response.json()

      if (result.success) {
        setExpenses(result.data)
      }
    } catch (error) {
      console.error('Error fetching expenses:', error)
      alert('Failed to fetch expenses')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.expense_type.trim()) {
      alert('Please select an expense type')
      return
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (!formData.expense_date) {
      alert('Please select an expense date')
      return
    }

    try {
      setLoading(true)
      const method = editingId ? 'PUT' : 'POST'
      const body = {
        ...(editingId && { id: editingId }),
        expense_type: formData.expense_type,
        amount: formData.amount,
        expense_date: formData.expense_date,
        remarks: formData.remarks || null,
      }

      const response = await fetch('/api/finances/expenses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (result.success) {
        await fetchExpenses()
        handleCancel()
        onClose()
      } else {
        alert(result.error || 'Failed to save expense')
      }
    } catch (error) {
      console.error('Error saving expense:', error)
      alert('Failed to save expense')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (expense: Expense) => {
    setFormData({
      expense_type: expense.expense_type,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      month_year: expense.month_year,
      remarks: expense.remarks || '',
    })
    setEditingId(expense.id)
    setShowAddForm(true)
  }

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      try {
        setLoading(true)
        const response = await fetch(`/api/finances/expenses?id=${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })

        const result = await response.json()

        if (result.success) {
          await fetchExpenses()
        } else {
          alert(result.error || 'Failed to delete expense')
        }
      } catch (error) {
        console.error('Error deleting expense:', error)
        alert('Failed to delete expense')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleCancel = () => {
    setFormData({
      expense_type: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      month_year: monthYear,
      remarks: '',
    })
    setEditingId(null)
    setShowAddForm(false)
    setSearchTerm('')
    setShowTypeDropdown(false)
    onClose()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const filteredExpenseTypes = EXPENSE_TYPES.filter(type =>
    type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0)

  const getMonthYearOptions = () => {
    const options = []
    const today = new Date()
    for (let i = 0; i < 12; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const value = `${year}-${month}`
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      options.push({ value, label })
    }
    return options
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg w-full max-w-2xl border border-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-xl font-bold text-foreground">
            {showAddForm ? (editingId ? 'Edit Expense' : 'Add New Expense') : 'General Expenses'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Form - Always Visible */}
          <form onSubmit={handleSubmit} className="space-y-5 border-b border-border pb-6">
            {/* Expense Type */}
            <div>
              <label className="flex items-center text-sm font-medium text-primary mb-2">
                <span className="mr-1">*</span>Expense Type
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                  className="w-full px-4 py-2.5 bg-input border border-input-border rounded-lg text-muted text-left focus:outline-none focus:border-ring flex items-center justify-between hover:border-border transition-colors"
                >
                  <span>{formData.expense_type || 'Select or type expense type'}</span>
                  <Search size={18} className="text-muted-foreground" />
                </button>

                {showTypeDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-input border border-primary rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                    <div className="sticky top-0 p-2 bg-input border-b border-input-border">
                      <input
                        type="text"
                        placeholder="Search expense type..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-inset border border-border rounded text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-ring"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredExpenseTypes.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, expense_type: type })
                            setShowTypeDropdown(false)
                            setSearchTerm('')
                          }}
                          className="w-full text-left px-4 py-2.5 text-foreground hover:bg-surface-hover transition-colors"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="flex items-center text-sm font-medium text-primary mb-2">
                <span className="mr-1">*</span>Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-2.5 text-muted-foreground text-lg">₹</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="Enter expense amount"
                  disabled={loading}
                  className="w-full px-4 py-2.5 pl-8 bg-input border border-input-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
                />
              </div>
            </div>

            {/* Expense Date */}
            <div>
              <label className="flex items-center text-sm font-medium text-primary mb-2">
                <span className="mr-1">*</span>Expense Date
              </label>
              <input
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>

            {/* Remarks */}
            <div>
              <label className="text-sm font-medium text-muted mb-2 block">
                Remarks (Optional)
              </label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="Invoice number, vendor details, etc."
                disabled={loading}
                rows={3}
                className="w-full px-4 py-2.5 bg-input border border-input-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="px-6 bg-surface-inset hover:bg-surface-hover text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="px-6 bg-primary hover:bg-primary-hover text-foreground"
              >
                {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
