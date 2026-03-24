'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

interface CreateLabTestModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateLabTestModal({ isOpen, onClose, onSuccess }: CreateLabTestModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: 'Biochemistry',
    description: '',
    sample_type: 'Blood',
    price: '',
    is_active: true,
  })

  const categories = ['Biochemistry', 'Hematology', 'Endocrinology', 'Clinical Pathology']
  const sampleTypes = ['Blood', 'Serum', 'Plasma', 'Urine', 'Saliva', 'Stool', 'Other']

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        code: '',
        category: 'Biochemistry',
        description: '',
        sample_type: 'Blood',
        price: '',
        is_active: true,
      })
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/lab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create test')
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
      <div className="bg-surface rounded-lg p-4 sm:p-6 w-full max-w-2xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Add New Lab Test</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive-subtle border border-destructive/30 rounded-lg text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name" className="text-foreground">
                Test Name *
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-input border-input-border text-foreground"
                placeholder="e.g., Complete Blood Count"
              />
            </div>

            <div>
              <Label htmlFor="code" className="text-foreground">
                Test Code *
              </Label>
              <Input
                id="code"
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="bg-input border-input-border text-foreground"
                placeholder="e.g., CBC001"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category" className="text-foreground">
                Category *
              </Label>
              <select
                id="category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-input border border-input-border rounded-md px-3 py-2 text-foreground"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="sample_type" className="text-foreground">
                Sample Type *
              </Label>
              <select
                id="sample_type"
                required
                value={formData.sample_type}
                onChange={(e) => setFormData({ ...formData, sample_type: e.target.value })}
                className="w-full bg-input border border-input-border rounded-md px-3 py-2 text-foreground"
              >
                {sampleTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="price" className="text-foreground">
              Price (₹) *
            </Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="bg-input border-input-border text-foreground"
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="description" className="text-foreground">
              Description
            </Label>
            <textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-input border border-input-border rounded-md px-3 py-2 text-foreground"
              placeholder="Brief description of the test..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 bg-input border-input-border rounded"
            />
            <Label htmlFor="is_active" className="text-foreground">
              Active
            </Label>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-input-border text-foreground hover:bg-surface-hover"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-info hover:bg-info-hover text-foreground"
            >
              {loading ? 'Creating...' : 'Create Test'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
