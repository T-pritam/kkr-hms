'use client'

import { useState } from 'react'
import { X, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PayAdvanceModalProps {
  isOpen: boolean
  onClose: () => void
  employeeId: string | null
  selectedMonth: string
  employeeName: string
  onSuccess: () => void
}

export function PayAdvanceModal({ isOpen, onClose, employeeId, selectedMonth, employeeName, onSuccess }: PayAdvanceModalProps) {
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [dateGiven, setDateGiven] = useState(new Date().toISOString().split('T')[0])
  const [remarks, setRemarks] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !dateGiven) {
      alert('Please fill in required fields')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/employees/${employeeId}/salary/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: parseFloat(amount),
          date_given: dateGiven,
          month_year: selectedMonth,
          remarks: remarks || null
        })
      })

      if (response.ok) {
        onSuccess()
        handleClose()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to add advance')
      }
    } catch (error) {
      console.error('Error adding advance:', error)
      alert('Error adding advance')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setAmount('')
    setDateGiven(new Date().toISOString().split('T')[0])
    setRemarks('')
    onClose()
  }
  

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md border border-gray-800">
        {/* Header */}
        <div className="border-b border-gray-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign size={20} className="text-orange-500" />
            Pay Advance
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div className="text-gray-400 text-sm mb-2">Employee</div>
            <div className="text-white font-medium">{employeeName}</div>
          </div>

          <div>
            <label className="text-gray-400 text-sm flex items-center gap-1 mb-2">
              Amount <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder="₹ 10,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm flex items-center gap-1 mb-2">
              Date <span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={dateGiven}
              onChange={(e) => setDateGiven(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">
              Month-Year
            </label>
            <Input
              value={selectedMonth}
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">
              Remarks
            </label>
            <Input
              placeholder="Optional remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {loading ? 'Adding...' : 'Add Advance'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
