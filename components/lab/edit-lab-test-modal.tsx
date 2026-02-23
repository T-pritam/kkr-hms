'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

interface LabTest {
  id: string
  name: string
  code: string
  category: string
  description?: string
  sample_type: string
  price: number
  is_active: boolean
}

interface EditLabTestModalProps {
  isOpen: boolean
  test: LabTest
  onClose: () => void
  onSuccess: () => void
}

export function EditLabTestModal({ isOpen, test, onClose, onSuccess }: EditLabTestModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: '',
    description: '',
    sample_type: '',
    price: '',
    is_active: true,
  })

  const categories = ['Biochemistry', 'Hematology', 'Endocrinology', 'Clinical Pathology']
  const sampleTypes = ['Blood', 'Serum', 'Plasma', 'Urine', 'Saliva', 'Stool', 'Other']

  useEffect(() => {
    if (isOpen && test) {
      setFormData({
        name: test.name,
        code: test.code,
        category: test.category,
        description: test.description || '',
        sample_type: test.sample_type,
        price: test.price.toString(),
        is_active: test.is_active,
      })
      setError('')
    }
  }, [isOpen, test])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/lab-tests/${test.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update test')
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
      <div className="bg-gray-900 rounded-lg p-4 sm:p-6 w-full max-w-2xl border border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Edit Lab Test</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name" className="text-white">
                Test Name *
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <Label htmlFor="code" className="text-white">
                Test Code *
              </Label>
              <Input
                id="code"
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category" className="text-white">
                Category *
              </Label>
              <select
                id="category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="sample_type" className="text-white">
                Sample Type *
              </Label>
              <select
                id="sample_type"
                required
                value={formData.sample_type}
                onChange={(e) => setFormData({ ...formData, sample_type: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
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
            <Label htmlFor="price" className="text-white">
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
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div>
            <Label htmlFor="description" className="text-white">
              Description
            </Label>
            <textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 bg-gray-800 border-gray-700 rounded"
            />
            <Label htmlFor="is_active" className="text-white">
              Active
            </Label>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? 'Updating...' : 'Update Test'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
