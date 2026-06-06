import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

interface EditDoctorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  doctor: any
}

export function EditDoctorModal({ isOpen, onClose, onSuccess, doctor }: EditDoctorModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    designation: '',
    specialist: '',
  })

  useEffect(() => {
    if (isOpen && doctor) {
      setFormData({
        name: doctor.name || '',
        mobile: doctor.mobile || '',
        email: doctor.email || '',
        designation: doctor.designation || '',
        specialist: doctor.specialist || '',
      })
      setError('')
    }
  }, [isOpen, doctor])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await apiFetch(`/api/doctors/${doctor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update doctor')
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
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg p-4 sm:p-6 w-full max-w-md border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Edit Doctor</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={loading}
              placeholder="Enter doctor name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input
              id="mobile"
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              disabled={loading}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={loading}
              placeholder="doctor@hospital.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="designation">Designation</Label>
            <Input
              id="designation"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              disabled={loading}
              placeholder="e.g., Senior Consultant"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialist">Specialist</Label>
            <Input
              id="specialist"
              value={formData.specialist}
              onChange={(e) => setFormData({ ...formData, specialist: e.target.value })}
              disabled={loading}
              placeholder="e.g., Cardiology"
            />
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
              {loading ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
