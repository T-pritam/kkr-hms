'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Edit, Trash2 } from 'lucide-react'

interface LabTest {
  id: string
  name: string
  code: string
}

interface TestParameter {
  id: string
  test_id: string
  name: string
  unit: string
  min_value: number | null
  max_value: number | null
  gender_specific: boolean
  male_min: number | null
  male_max: number | null
  female_min: number | null
  female_max: number | null
  display_order: number
  is_active: boolean
}

interface ManageParametersModalProps {
  isOpen: boolean
  test: LabTest
  onClose: () => void
}

export function ManageParametersModal({ isOpen, test, onClose }: ManageParametersModalProps) {
  const [parameters, setParameters] = useState<TestParameter[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingParam, setEditingParam] = useState<TestParameter | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    gender_specific: false,
    min_value: '',
    max_value: '',
    male_min: '',
    male_max: '',
    female_min: '',
    female_max: '',
    display_order: '0',
  })

  useEffect(() => {
    if (isOpen) {
      fetchParameters()
    }
  }, [isOpen])

  const fetchParameters = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/lab-tests/${test.id}/parameters`)
      const result = await response.json()

      if (result.success) {
        setParameters(result.data)
      }
    } catch (error) {
      console.error('Error fetching parameters:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      unit: '',
      gender_specific: false,
      min_value: '',
      max_value: '',
      male_min: '',
      male_max: '',
      female_min: '',
      female_max: '',
      display_order: '0',
    })
    setEditingParam(null)
    setShowAddForm(false)
  }

  const handleEdit = (param: TestParameter) => {
    setEditingParam(param)
    setFormData({
      name: param.name,
      unit: param.unit || '',
      gender_specific: param.gender_specific,
      min_value: param.min_value?.toString() || '',
      max_value: param.max_value?.toString() || '',
      male_min: param.male_min?.toString() || '',
      male_max: param.male_max?.toString() || '',
      female_min: param.female_min?.toString() || '',
      female_max: param.female_max?.toString() || '',
      display_order: param.display_order.toString(),
    })
    setShowAddForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setLoading(true)

      const payload = {
        name: formData.name,
        unit: formData.unit,
        gender_specific: formData.gender_specific,
        display_order: parseInt(formData.display_order) || 0,
        ...(formData.gender_specific
          ? {
              male_min: parseFloat(formData.male_min),
              male_max: parseFloat(formData.male_max),
              female_min: parseFloat(formData.female_min),
              female_max: parseFloat(formData.female_max),
            }
          : {
              min_value: parseFloat(formData.min_value),
              max_value: parseFloat(formData.max_value),
            }),
      }

      let response
      if (editingParam) {
        response = await fetch(`/api/test-parameters/${editingParam.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        response = await fetch(`/api/lab-tests/${test.id}/parameters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save parameter')
      }

      fetchParameters()
      resetForm()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this parameter?')) return

    try {
      const response = await fetch(`/api/test-parameters/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchParameters()
      }
    } catch (error) {
      console.error('Error deleting parameter:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg p-4 sm:p-6 w-full max-w-4xl border border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Manage Test Parameters</h2>
            <p className="text-gray-400 text-sm mt-1">
              {test.name} ({test.code})
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {!showAddForm && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="mb-4 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2" size={16} />
            Add Parameter
          </Button>
        )}

        {showAddForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              {editingParam ? 'Edit Parameter' : 'Add New Parameter'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="name" className="text-white">
                  Parameter Name *
                </Label>
                <Input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="e.g., Hemoglobin"
                />
              </div>

              <div>
                <Label htmlFor="unit" className="text-white">
                  Unit
                </Label>
                <Input
                  id="unit"
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="e.g., g/dL"
                />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  id="gender_specific"
                  type="checkbox"
                  checked={formData.gender_specific}
                  onChange={(e) =>
                    setFormData({ ...formData, gender_specific: e.target.checked })
                  }
                  className="w-4 h-4 bg-gray-900 border-gray-700 rounded"
                />
                <Label htmlFor="gender_specific" className="text-white">
                  Gender-Specific Reference Ranges
                </Label>
              </div>
            </div>

            {formData.gender_specific ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-blue-400">Male Range</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-white text-xs">Min *</Label>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={formData.male_min}
                        onChange={(e) => setFormData({ ...formData, male_min: e.target.value })}
                        className="bg-gray-900 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-white text-xs">Max *</Label>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={formData.male_max}
                        onChange={(e) => setFormData({ ...formData, male_max: e.target.value })}
                        className="bg-gray-900 border-gray-700 text-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-pink-400">Female Range</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-white text-xs">Min *</Label>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={formData.female_min}
                        onChange={(e) => setFormData({ ...formData, female_min: e.target.value })}
                        className="bg-gray-900 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-white text-xs">Max *</Label>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={formData.female_max}
                        onChange={(e) => setFormData({ ...formData, female_max: e.target.value })}
                        className="bg-gray-900 border-gray-700 text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min_value" className="text-white">
                    Minimum Value *
                  </Label>
                  <Input
                    id="min_value"
                    type="number"
                    step="any"
                    required
                    value={formData.min_value}
                    onChange={(e) => setFormData({ ...formData, min_value: e.target.value })}
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="max_value" className="text-white">
                    Maximum Value *
                  </Label>
                  <Input
                    id="max_value"
                    type="number"
                    step="any"
                    required
                    value={formData.max_value}
                    onChange={(e) => setFormData({ ...formData, max_value: e.target.value })}
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
              </div>
            )}

            <div className="mt-4">
              <Label htmlFor="display_order" className="text-white">
                Display Order
              </Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                type="button"
                onClick={resetForm}
                variant="outline"
                className="flex-1 border-gray-700 text-gray-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? 'Saving...' : editingParam ? 'Update' : 'Add'}
              </Button>
            </div>
          </form>
        )}

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {parameters.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No parameters defined yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">
                      Parameter
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">
                      Unit
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">
                      Reference Range
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {parameters.map((param) => (
                    <tr key={param.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-2 text-white">{param.name}</td>
                      <td className="px-4 py-2 text-gray-300">{param.unit}</td>
                      <td className="px-4 py-2 text-gray-300 text-sm">
                        {param.gender_specific ? (
                          <div>
                            <div className="text-blue-400">
                              M: {param.male_min} - {param.male_max}
                            </div>
                            <div className="text-pink-400">
                              F: {param.female_min} - {param.female_max}
                            </div>
                          </div>
                        ) : (
                          <div>
                            {param.min_value} - {param.max_value}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => handleEdit(param)}
                            variant="ghost"
                            size="sm"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            onClick={() => handleDelete(param.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full border-gray-700 text-gray-300"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
