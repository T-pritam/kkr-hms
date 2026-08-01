'use client'

import { useState, useEffect, useMemo } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { PatientSelect, type SelectedPatient } from './patient-select'
import { ORDER_PRIORITIES, PRIORITY_LABELS } from '@/lib/lab/constants'
import { ageFromDob } from '@/lib/lab/ranges'
import { Search, X, Plus, AlertCircle } from 'lucide-react'

interface CreateLabOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface CatalogueTest {
  id: string
  name: string
  code: string
  category: string | null
  sample_type: string | null
  price: number
}

interface Doctor {
  id: string
  name: string
  specialist?: string | null
}

interface Line {
  test: CatalogueTest
  price: string
}

type PatientMode = 'registered' | 'walkin'

const money = (n: number) =>
  `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function CreateLabOrderModal({ isOpen, onClose, onSuccess }: CreateLabOrderModalProps) {
  const [mode, setMode] = useState<PatientMode>('registered')
  const [patient, setPatient] = useState<SelectedPatient | null>(null)
  const [manual, setManual] = useState({ name: '', phone: '', age: '', gender: '' })

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [outsideDoctor, setOutsideDoctor] = useState('')

  const [catalogue, setCatalogue] = useState<CatalogueTest[]>([])
  const [testQuery, setTestQuery] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  const [priority, setPriority] = useState<string>('routine')
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    reset()
    void loadCatalogue()
    void loadDoctors()
  }, [isOpen])

  const reset = () => {
    setMode('registered')
    setPatient(null)
    setManual({ name: '', phone: '', age: '', gender: '' })
    setDoctorId('')
    setOutsideDoctor('')
    setTestQuery('')
    setLines([])
    setPriority('routine')
    setDiscount('0')
    setNotes('')
    setError('')
  }

  const loadCatalogue = async () => {
    try {
      const res = await fetch('/api/lab-tests?is_active=true&pageSize=100')
      const json = await res.json()
      setCatalogue(json.data?.data || [])
    } catch (err) {
      console.error('Failed to load test catalogue:', err)
    }
  }

  const loadDoctors = async () => {
    try {
      const res = await fetch('/api/doctors/all')
      const json = await res.json()
      setDoctors(Array.isArray(json) ? json : [])
    } catch (err) {
      console.error('Failed to load doctors:', err)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const chosenIds = useMemo(() => new Set(lines.map(l => l.test.id)), [lines])

  const matches = useMemo(() => {
    const q = testQuery.trim().toLowerCase()
    return catalogue
      .filter(t => !chosenIds.has(t.id))
      .filter(t => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
      .slice(0, 40)
  }, [catalogue, testQuery, chosenIds])

  const subtotal = lines.reduce((sum, l) => sum + (Number(l.price) || 0), 0)
  const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal)
  const net = subtotal - discountAmount

  const displayAge = mode === 'registered'
    ? (patient ? ageFromDob(patient.date_of_birth) : null)
    : (manual.age ? Number(manual.age) : null)

  const addTest = (test: CatalogueTest) => {
    setLines(prev => [...prev, { test, price: String(test.price ?? 0) }])
    setTestQuery('')
  }

  const removeTest = (id: string) => setLines(prev => prev.filter(l => l.test.id !== id))

  const setLinePrice = (id: string, price: string) =>
    setLines(prev => prev.map(l => (l.test.id === id ? { ...l, price } : l)))

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'registered' && !patient) {
      setError('Select a registered patient, or switch to Walk-in to type the details in.')
      return
    }
    if (mode === 'walkin' && !manual.name.trim()) {
      setError('Enter the patient name.')
      return
    }
    if (lines.length === 0) {
      setError('Add at least one test to the order.')
      return
    }

    setSubmitting(true)
    try {
      const payload =
        mode === 'registered'
          ? { patient_id: patient!.id }
          : {
              patient_name: manual.name.trim(),
              patient_phone: manual.phone.trim() || null,
              patient_age: manual.age ? Number(manual.age) : null,
              patient_gender: manual.gender || null,
            }

      const res = await fetch('/api/lab/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          referring_doctor_id: doctorId || null,
          referring_doctor_name: doctorId ? null : outsideDoctor.trim() || null,
          priority,
          discount: discountAmount,
          notes: notes.trim() || null,
          tests: lines.map(l => ({ test_id: l.test.id, price: Number(l.price) || 0 })),
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to create the order')

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Lab Order"
      description="One order covers every test taken from this visit's sample."
      size="xl"
    >
      <form onSubmit={submit} className="space-y-6">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Patient ─────────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Patient</h3>
            <div className="inline-flex rounded-md border border-input-border overflow-hidden">
              {(['registered', 'walkin'] as PatientMode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === m
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface text-muted hover:text-foreground'
                  }`}
                >
                  {m === 'registered' ? 'Registered patient' : 'Walk-in / OPD'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'registered' ? (
            <>
              <PatientSelect value={patient} onChange={setPatient} required />

              {patient && (
                <div className="rounded-md bg-surface-inset border border-border p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <Field label="Patient ID" value={patient.patient_id} />
                  <Field label="Phone" value={patient.phone || '—'} />
                  <Field label="Age" value={displayAge !== null ? `${displayAge} yrs` : '—'} />
                  <Field label="Sex" value={patient.gender || '—'} />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                For patients with no registration record. Their details are stored on the order itself.
              </p>
              <div className="space-y-2">
                <Label htmlFor="walkin-name">Patient Name <span className="text-destructive">*</span></Label>
                <Input
                  id="walkin-name"
                  value={manual.name}
                  onChange={e => setManual({ ...manual, name: e.target.value })}
                  placeholder="Full name"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="walkin-phone">Phone</Label>
                  <Input
                    id="walkin-phone"
                    type="tel"
                    value={manual.phone}
                    onChange={e => setManual({ ...manual, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="walkin-age">Age (years)</Label>
                  <Input
                    id="walkin-age"
                    type="number"
                    min={0}
                    max={150}
                    value={manual.age}
                    onChange={e => setManual({ ...manual, age: e.target.value })}
                    placeholder="42"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="walkin-gender">Sex</Label>
                  <Select
                    id="walkin-gender"
                    value={manual.gender}
                    onChange={e => setManual({ ...manual, gender: e.target.value })}
                  >
                    <option value="">Not recorded</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted">
                Age and sex decide which reference interval each result is compared against.
                Leaving them blank means age- and sex-specific intervals cannot be applied.
              </p>
            </div>
          )}
        </section>

        {/* ── Referral ────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="doctor">Referred By</Label>
            <Select id="doctor" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
              <option value="">Not from a hospital doctor</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.specialist ? ` — ${d.specialist}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="outside-doctor">Outside Doctor</Label>
            <Input
              id="outside-doctor"
              value={outsideDoctor}
              onChange={e => setOutsideDoctor(e.target.value)}
              disabled={!!doctorId}
              placeholder="Dr. Name (prints on the report)"
            />
          </div>
        </section>

        {/* ── Tests ───────────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            Tests {lines.length > 0 && <span className="text-muted font-normal">({lines.length})</span>}
          </h3>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="text"
              value={testQuery}
              onChange={e => setTestQuery(e.target.value)}
              placeholder="Search the catalogue by test name or code"
              className="flex h-10 w-full rounded-md border border-input-border bg-input pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {testQuery.trim() && (
            <div className="max-h-56 overflow-y-auto rounded-md border border-input-border divide-y divide-input-border">
              {matches.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted">No matching test available</div>
              ) : (
                matches.map(test => (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() => addTest(test)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-inset"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground truncate">{test.name}</span>
                      <span className="block text-xs text-muted">
                        {test.code}{test.category ? ` · ${test.category}` : ''}
                        {test.sample_type ? ` · ${test.sample_type}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-muted">{money(Number(test.price) || 0)}</span>
                      <Plus size={16} className="text-primary" />
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="text-sm text-muted">No tests added yet.</p>
          ) : (
            <div className="space-y-2">
              {lines.map(line => (
                <div
                  key={line.test.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-inset px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">{line.test.name}</div>
                    <div className="text-xs text-muted">
                      {line.test.code}
                      {line.test.sample_type ? ` · ${line.test.sample_type}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`price-${line.test.id}`} className="text-xs text-muted">Rs.</Label>
                    <Input
                      id={`price-${line.test.id}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.price}
                      onChange={e => setLinePrice(line.test.id, e.target.value)}
                      className="h-9 w-28"
                    />
                    <button
                      type="button"
                      onClick={() => removeTest(line.test.id)}
                      aria-label={`Remove ${line.test.name}`}
                      className="text-muted hover:text-destructive p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Order details ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select id="priority" value={priority} onChange={e => setPriority(e.target.value)}>
              {ORDER_PRIORITIES.map(p => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount">Discount (Rs.)</Label>
            <Input
              id="discount"
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={e => setDiscount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Payable</Label>
            <div className="flex h-10 items-center rounded-md border border-border bg-surface-inset px-3 text-sm font-semibold text-foreground">
              {money(net)}
              {discountAmount > 0 && (
                <span className="ml-2 text-xs font-normal text-muted line-through">{money(subtotal)}</span>
              )}
            </div>
          </div>
        </section>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything the lab should know — fasting status, sample condition, clinical history"
          />
        </div>

        {priority === 'urgent' && (
          <Badge variant="warning" className="w-fit">Marked urgent — appears at the top of the worklist</Badge>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="sm:flex-1" disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" className="sm:flex-1 bg-primary hover:bg-primary-hover" disabled={submitting}>
            {submitting ? 'Creating…' : `Create Order${lines.length ? ` (${lines.length} test${lines.length > 1 ? 's' : ''})` : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-foreground truncate">{value}</div>
    </div>
  )
}
