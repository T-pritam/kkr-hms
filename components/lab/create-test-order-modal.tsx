'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Search } from 'lucide-react'

interface Patient {
  id: string
  name: string
  patient_id: string
  phone: string
  gender: string
  date_of_birth: string
}

interface LabTest {
  id: string
  name: string
  code: string
  category: string
  price: number
}

interface CreateTestOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateTestOrderModal({ isOpen, onClose, onSuccess }: CreateTestOrderModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [tests, setTests] = useState<LabTest[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientList, setShowPatientList] = useState(false)
  const [formData, setFormData] = useState({
    patient_id: '',
    patient_name: '',
    patient_phone: '',
    patient_age: '',
    patient_gender: '',
    test_id: '',
    test_date: new Date().toISOString().split('T')[0],
    price: '',
    discount: '0',
    reference_doctor_id: '',
    notes: '',
  })

  useEffect(() => {
    if (isOpen) {
      fetchTests()
    }
  }, [isOpen])

  useEffect(() => {
    if (patientSearch.length > 2) {
      searchPatients()
    }
  }, [patientSearch])

  const fetchTests = async () => {
    try {
      const response = await fetch('/api/lab-tests?pageSize=100&is_active=true')
      const result = await response.json()
      if (result.success) {
        setTests(result.data.data)
      }
    } catch (error) {
      console.error('Error fetching tests:', error)
    }
  }

  const searchPatients = async () => {
    try {
      const response = await fetch(`/api/patients?search=${patientSearch}`)
      const result = await response.json()
      setPatients(result.patients || [])
      setShowPatientList(true)
    } catch (error) {
      console.error('Error searching patients:', error)
    }
  }

  const selectPatient = (patient: Patient) => {
    const age = patient.date_of_birth
      ? Math.floor(
          (new Date().getTime() - new Date(patient.date_of_birth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : 0

    setFormData({
      ...formData,
      patient_id: patient.id,
      patient_name: patient.name,
      patient_phone: patient.phone,
      patient_age: age.toString(),
      patient_gender: patient.gender,
    })
    setPatientSearch(patient.name + ' (' + patient.patient_id + ')')
    setShowPatientList(false)
  }

  const handleTestChange = (testId: string) => {
    const selectedTest = tests.find((t) => t.id === testId)
    if (selectedTest) {
      setFormData({
        ...formData,
        test_id: testId,
        price: selectedTest.price.toString(),
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!formData.patient_id) {
      setError('Please select a patient')
      setLoading(false)
      return
    }

    try {
      const finalPrice =
        parseFloat(formData.price) - parseFloat(formData.discount)

      const response = await fetch('/api/test-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: formData.patient_id,
          test_id: formData.test_id,
          test_date: formData.test_date,
          price: parseFloat(formData.price),
          discount: parseFloat(formData.discount),
          patient_name: formData.patient_name,
          patient_phone: formData.patient_phone,
          patient_age: parseInt(formData.patient_age) || null,
          patient_gender: formData.patient_gender,
          reference_doctor_id: formData.reference_doctor_id || null,
          notes: formData.notes,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create test order')
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
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Create Test Order</h2>
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
          {/* Patient Search */}
          <div className="relative">
            <Label htmlFor="patient" className="text-foreground">
              Search Patient *
            </Label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"
                size={20}
              />
              <Input
                id="patient"
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                onFocus={() => patientSearch.length > 2 && setShowPatientList(true)}
                className="pl-10 bg-input border-input-border text-foreground"
                placeholder="Type patient name or ID..."
                required
              />
            </div>

            {showPatientList && patients.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-surface-hover border border-input-border rounded-lg max-h-60 overflow-y-auto">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => selectPatient(patient)}
                    className="px-4 py-3 hover:bg-surface-hover cursor-pointer border-b border-input-border last:border-0"
                  >
                    <div className="text-foreground font-medium">{patient.name}</div>
                    <div className="text-sm text-muted">
                      {patient.patient_id} | {patient.phone}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Selection */}
          <div>
            <Label htmlFor="test" className="text-foreground">
              Select Test *
            </Label>
            <select
              id="test"
              required
              value={formData.test_id}
              onChange={(e) => handleTestChange(e.target.value)}
              className="w-full bg-input border border-input-border rounded-md px-3 py-2 text-foreground"
            >
              <option value="">Select a test...</option>
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.name} ({test.code}) - ₹{test.price}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="test_date" className="text-foreground">
                Test Date *
              </Label>
              <Input
                id="test_date"
                type="date"
                required
                value={formData.test_date}
                onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
                className="bg-input border-input-border text-foreground"
              />
            </div>

            <div>
              <Label htmlFor="price" className="text-foreground">
                Price (₹) *
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="bg-input border-input-border text-foreground"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="discount" className="text-foreground">
              Discount (₹)
            </Label>
            <Input
              id="discount"
              type="number"
              step="0.01"
              min="0"
              value={formData.discount}
              onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
              className="bg-input border-input-border text-foreground"
            />
          </div>

          {formData.price && (
            <div className="p-3 bg-info-subtle border border-info/20 rounded-lg">
              <div className="text-info">
                Final Price: ₹
                {(parseFloat(formData.price) - parseFloat(formData.discount || '0')).toFixed(2)}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="notes" className="text-foreground">
              Notes
            </Label>
            <textarea
              id="notes"
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-input border border-input-border rounded-md px-3 py-2 text-foreground"
              placeholder="Any additional notes..."
            />
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
              {loading ? 'Creating...' : 'Create Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
