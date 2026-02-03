'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

interface CreateEmployeeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateEmployeeModal({ isOpen, onClose, onSuccess }: CreateEmployeeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    base_salary: '',
    join_date: '',
    status: 'Active',
  })

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        designation: '',
        base_salary: '',
        join_date: '',
        status: 'Active',
      })
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create employee')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg p-4 sm:p-6 w-full max-w-md border border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Add New Employee</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-900/20 border border-red-900 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">
              <span className="text-red-500">*</span> Employee Name
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={loading}
              placeholder="Enter employee name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="designation">
              <span className="text-red-500">*</span> Designation
            </Label>
            <select
              id="designation"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              className="flex h-10 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              disabled={loading}
              required
            >
              <option value="">Select designation</option>
              <option value="Nurse">Nurse</option>
              <option value="Wardboy">Wardboy</option>
              <option value="Compounder">Compounder</option>
              <option value="OT Boy">OT Boy</option>
              <option value="Watchman">Watchman</option>
              <option value="Cleaner">Cleaner</option>
              <option value="Lab Technician">Lab Technician</option>
              <option value="Pharmacist">Pharmacist</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_salary">
              <span className="text-red-500">*</span> Base Salary (Monthly)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">₹</span>
              <Input
                id="base_salary"
                type="number"
                value={formData.base_salary}
                onChange={(e) => setFormData({ ...formData, base_salary: e.target.value })}
                required
                disabled={loading}
                placeholder="Enter monthly salary"
                className="pl-8"
                min="1000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="join_date">
              <span className="text-red-500">*</span> Joining Date
            </Label>
            <Input
              id="join_date"
              type="date"
              value={formData.join_date}
              onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="flex h-10 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              disabled={loading}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
