'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Save } from 'lucide-react'

interface TestResultEntryModalProps {
  isOpen: boolean
  resultId: string
  onClose: () => void
  onSuccess: () => void
}

interface Parameter {
  id: string
  name: string
  unit: string
  min_value: number | null
  max_value: number | null
  gender_specific: boolean
  male_min: number | null
  male_max: number | null
  female_min: number | null
  female_max: number | null
}

interface ResultValue {
  parameter_id: string
  value: string
  text_value: string
}

export function TestResultEntryModal({
  isOpen,
  resultId,
  onClose,
  onSuccess,
}: TestResultEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [testInfo, setTestInfo] = useState<any>(null)
  const [values, setValues] = useState<{ [key: string]: ResultValue }>({})

  useEffect(() => {
    if (isOpen && resultId) {
      fetchTestDetails()
    }
  }, [isOpen, resultId])

  const fetchTestDetails = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/test-results/${resultId}`)
      const result = await response.json()

      if (result.success) {
        setTestInfo(result.data)

        // Fetch parameters for this test
        const paramsResponse = await fetch(
          `/api/lab-tests/${result.data.test_id}/parameters`
        )
        const paramsResult = await paramsResponse.json()

        if (paramsResult.success) {
          setParameters(paramsResult.data)

          // Initialize values object
          const initialValues: { [key: string]: ResultValue } = {}
          paramsResult.data.forEach((param: Parameter) => {
            // Check if value already exists
            const existingValue = result.data.values?.find(
              (v: any) => v.parameter_id === param.id
            )
            initialValues[param.id] = {
              parameter_id: param.id,
              value: existingValue?.value?.toString() || '',
              text_value: existingValue?.text_value || '',
            }
          })
          setValues(initialValues)
        }
      }
    } catch (error) {
      console.error('Error fetching test details:', error)
      setError('Failed to load test details')
    } finally {
      setLoading(false)
    }
  }

  const handleValueChange = (parameterId: string, field: 'value' | 'text_value', value: string) => {
    setValues((prev) => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        [field]: value,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Only submit parameters where the user actually entered a value
      const valuesArray = Object.values(values)
        .filter((v) => v.value.trim() !== '' || v.text_value.trim() !== '')
        .map((v) => ({
          parameter_id: v.parameter_id,
          value: v.value !== '' ? parseFloat(v.value) : null,
          text_value: v.text_value || null,
        }))

      if (valuesArray.length === 0) {
        setError('Please enter at least one parameter value before saving.')
        setLoading(false)
        return
      }

      // Submit values — the server will upsert and set status to 'completed'
      const response = await fetch(`/api/test-results/${resultId}/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: valuesArray }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save test results')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getRefRange = (param: Parameter) => {
    if (!testInfo) return ''

    const gender = testInfo.patient_gender || testInfo.patients?.gender

    if (param.gender_specific && gender) {
      if (gender.toLowerCase() === 'male') {
        return `${param.male_min} - ${param.male_max}`
      } else if (gender.toLowerCase() === 'female') {
        return `${param.female_min} - ${param.female_max}`
      }
    }

    return `${param.min_value} - ${param.max_value}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg p-4 sm:p-6 w-full max-w-4xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Enter Test Results</h2>
            {testInfo && (
              <div className="text-sm text-muted mt-1">
                {testInfo.lab_tests?.name} | Patient: {testInfo.patient_name}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive-subtle border border-destructive/30 rounded-lg text-destructive">
            {error}
          </div>
        )}

        {loading && !parameters.length ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-info"></div>
            <p className="mt-2 text-muted">Loading parameters...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-surface-hover rounded-lg border border-input-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-inset">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                        Parameter
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                        Reference Range
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-foreground">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parameters.map((param) => (
                      <tr key={param.id} className="hover:bg-surface-hover">
                        <td className="px-4 py-3 text-foreground">{param.name}</td>
                        <td className="px-4 py-3 text-foreground">{param.unit}</td>
                        <td className="px-4 py-3 text-foreground text-sm">
                          {getRefRange(param)}
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            step="any"
                            value={values[param.id]?.value || ''}
                            onChange={(e) =>
                              handleValueChange(param.id, 'value', e.target.value)
                            }
                            className="bg-input border-border text-foreground max-w-xs"
                            placeholder="Enter value"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <Save className="mr-2" size={16} />
                {loading ? 'Saving...' : 'Save Results'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
