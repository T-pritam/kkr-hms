import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Search, UserSearch } from 'lucide-react'

interface ExistingPatient {
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
  const [existingPatients, setExistingPatients] = useState<ExistingPatient[]>([])
  const [tests, setTests] = useState<LabTest[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientList, setShowPatientList] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState({
    patient_name: '',
    patient_phone: '',
    patient_age: '',
    patient_gender: '',
    test_id: '',
    test_date: new Date().toISOString().split('T')[0],
    price: '',
    discount: '0',
    notes: '',
  })

  useEffect(() => {
    if (isOpen) {
      fetchTests()
      setPatientSearch('')
      setShowPatientList(false)
      setFormData({
        patient_name: '',
        patient_phone: '',
        patient_age: '',
        patient_gender: '',
        test_id: '',
        test_date: new Date().toISOString().split('T')[0],
        price: '',
        discount: '0',
        notes: '',
      })
      setError('')
    }
  }, [isOpen])

  useEffect(() => {
    if (patientSearch.length > 1) {
      searchExistingPatients()
    } else {
      setExistingPatients([])
      setShowPatientList(false)
    }
  }, [patientSearch])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowPatientList(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchTests = async () => {
    try {
      const response = await apiFetch('/api/lab-tests?pageSize=100&is_active=true')
      const result = await response.json()
      if (result.success) {
        setTests(result.data.data)
      }
    } catch (error) {
      console.error('Error fetching tests:', error)
    }
  }

  const searchExistingPatients = async () => {
    try {
      const response = await apiFetch(`/api/patients?search=${patientSearch}`)
      const result = await response.json()
      const list = result.patients || result.data?.data || []
      setExistingPatients(list)
      setShowPatientList(list.length > 0)
    } catch (error) {
      console.error('Error searching patients:', error)
    }
  }

  const fillFromExistingPatient = (patient: ExistingPatient) => {
    const age = patient.date_of_birth
      ? Math.floor(
          (new Date().getTime() - new Date(patient.date_of_birth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : 0
    setFormData((prev) => ({
      ...prev,
      patient_name: patient.name,
      patient_phone: patient.phone,
      patient_age: age > 0 ? age.toString() : '',
      patient_gender: patient.gender,
    }))
    setPatientSearch('')
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

    if (!formData.patient_name.trim()) {
      setError('Patient name is required')
      setLoading(false)
      return
    }

    if (!formData.test_id) {
      setError('Please select a test')
      setLoading(false)
      return
    }

    try {
      const response = await apiFetch('/api/test-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_id: formData.test_id,
          test_date: formData.test_date,
          price: parseFloat(formData.price) || 0,
          discount: parseFloat(formData.discount) || 0,
          patient_name: formData.patient_name.trim(),
          patient_phone: formData.patient_phone.trim() || null,
          patient_age: parseInt(formData.patient_age) || null,
          patient_gender: formData.patient_gender || null,
          notes: formData.notes || null,
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
          {/* Patient Section */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">Patient Details</h3>
            </div>

            {/* Optional: fill from existing registered patient */}
            <div ref={searchRef} className="relative">
              <Label className="text-muted text-xs">
                <UserSearch size={12} className="inline mr-1" />
                Auto-fill from registered patient (optional)
              </Label>
              <div className="relative mt-1">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"
                  size={16}
                />
                <Input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="pl-9 bg-input border-input-border text-foreground text-sm"
                  placeholder="Search registered patients to auto-fill..."
                />
              </div>
              {showPatientList && existingPatients.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface border border-input-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {existingPatients.map((patient) => (
                    <div
                      key={patient.id}
                      onMouseDown={() => fillFromExistingPatient(patient)}
                      className="px-4 py-2 hover:bg-surface-hover cursor-pointer border-b border-input-border last:border-0"
                    >
                      <div className="text-foreground text-sm font-medium">{patient.name}</div>
                      <div className="text-xs text-muted">
                        {patient.patient_id} | {patient.phone} | {patient.gender}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inline patient fields — always editable */}
            <div>
              <Label htmlFor="patient_name" className="text-foreground">
                Patient Name *
              </Label>
              <Input
                id="patient_name"
                type="text"
                required
                value={formData.patient_name}
                onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                className="bg-input border-input-border text-foreground"
                placeholder="Enter patient name"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="patient_phone" className="text-foreground">
                  Phone
                </Label>
                <Input
                  id="patient_phone"
                  type="tel"
                  value={formData.patient_phone}
                  onChange={(e) => setFormData({ ...formData, patient_phone: e.target.value })}
                  className="bg-input border-input-border text-foreground"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label htmlFor="patient_age" className="text-foreground">
                  Age
                </Label>
                <Input
                  id="patient_age"
                  type="number"
                  min="0"
                  max="150"
                  value={formData.patient_age}
                  onChange={(e) => setFormData({ ...formData, patient_age: e.target.value })}
                  className="bg-input border-input-border text-foreground"
                  placeholder="Age"
                />
              </div>
              <div>
                <Label htmlFor="patient_gender" className="text-foreground">
                  Sex
                </Label>
                <select
                  id="patient_gender"
                  value={formData.patient_gender}
                  onChange={(e) => setFormData({ ...formData, patient_gender: e.target.value })}
                  className="w-full bg-input border border-input-border rounded-md px-3 py-2 text-foreground"
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
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
                min="0"
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
