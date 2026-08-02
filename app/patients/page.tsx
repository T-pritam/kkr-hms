'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { TablePagination } from '@/components/ui/table-pagination'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { PatientFormModal } from '@/components/patients/patient-form-modal'
import { PATIENT_STATUSES, STATUS_VARIANTS, type PatientStatus } from '@/lib/patients/constants'
import { hasPatientCapability } from '@/lib/patients/authz'
import { formatAge } from '@/lib/patients/age'
import { fetchPatientPDFData, generatePatientPDF } from '@/lib/pdf/patient-pdf'
import { useUser } from '@/hooks/use-user'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  Edit,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

/**
 * The patient register.
 *
 * Rebuilt onto the lab-orders house style: filter bar, Badge chips, sortable
 * headers, an inline error banner instead of a silent console.error, and
 * `Modal` for the download dialog rather than a hand-rolled overlay.
 */

interface Patient {
  id: string
  patient_id: string
  name: string
  gender: string | null
  phone: string | null
  date_of_birth: string | null
  date_of_join: string | null
  age_years: number | null
  age_recorded_on: string | null
  blood_group: string | null
  status: PatientStatus
  updated_at: string | null
  updated_by_user?: { username?: string } | null
}

type SortKey = 'patient_id' | 'name' | 'date_of_join'

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function PatientsPage() {
  const router = useRouter()
  const { user } = useUser()
  const canWrite = hasPatientCapability(user?.role, 'patient:write')
  const canDelete = hasPatientCapability(user?.role, 'patient:delete')

  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [joinedFrom, setJoinedFrom] = useState('')
  const [joinedTo, setJoinedTo] = useState('')
  const [sort, setSort] = useState<SortKey>('date_of_join')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)
  const [deleting, setDeleting] = useState<Patient | null>(null)
  const [busy, setBusy] = useState(false)

  // Download Report
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadPatientId, setDownloadPatientId] = useState('')
  const [downloadRange, setDownloadRange] = useState<'all' | 'last_month' | 'last_year' | 'custom'>('all')
  const [downloadStart, setDownloadStart] = useState('')
  const [downloadEnd, setDownloadEnd] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadOptions, setDownloadOptions] = useState<Patient[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
        dir,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (status) params.set('status', status)
      if (joinedFrom) params.set('joinedFrom', joinedFrom)
      if (joinedTo) params.set('joinedTo', joinedTo)

      const res = await fetch(`/api/patients?${params}`)
      const body = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(body?.error || 'Failed to load patients')

      setPatients(body.patients || [])
      setTotal(body.total || 0)
      setTotalPages(body.totalPages || 0)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, status, joinedFrom, joinedTo, sort, dir])

  useEffect(() => {
    void fetchPatients()
  }, [fetchPatients])

  useRealtimeRefetch(['patients'], fetchPatients)

  const sortBy = (key: SortKey) => {
    if (sort === key) {
      setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setDir(key === 'date_of_join' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      const res = await fetch(`/api/patients/${deleting.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to delete the patient')
      await fetchPatients()
      setDeleting(null)
    } catch (err: any) {
      setError(err.message)
      setDeleting(null)
    } finally {
      setBusy(false)
    }
  }

  const openDownload = async () => {
    setDownloadOpen(true)
    if (downloadOptions.length > 0) return
    try {
      const res = await fetch('/api/patients?page=1&pageSize=100&sort=name&dir=asc')
      const body = await res.json().catch(() => ({}))
      if (res.ok) setDownloadOptions(body.patients || [])
    } catch {
      /* the picker simply stays empty; the list itself is unaffected */
    }
  }

  const handleDownload = async () => {
    if (!downloadPatientId) return
    setDownloading(true)
    try {
      let range: { start?: string; end?: string } | undefined
      const now = new Date()

      if (downloadRange === 'last_month') {
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const to = new Date(now.getFullYear(), now.getMonth(), 0)
        range = { start: from.toISOString().slice(0, 10), end: to.toISOString().slice(0, 10) }
      } else if (downloadRange === 'last_year') {
        range = { start: `${now.getFullYear() - 1}-01-01`, end: `${now.getFullYear() - 1}-12-31` }
      } else if (downloadRange === 'custom' && downloadStart && downloadEnd) {
        range = { start: downloadStart, end: downloadEnd }
      }

      const data = await fetchPatientPDFData(downloadPatientId, range)
      generatePatientPDF(data)
      setDownloadOpen(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to generate the report')
    } finally {
      setDownloading(false)
    }
  }

  const filtering = Boolean(debouncedSearch || status || joinedFrom || joinedTo)

  const SortHeader = ({ label, keyName }: { label: string; keyName: SortKey }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
      <button
        type="button"
        onClick={() => sortBy(keyName)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase"
      >
        {label}
        {sort === keyName &&
          (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )

  const actionsFor = (patient: Patient) => (
    <div className="flex justify-end gap-2">
      {canWrite && (
        <Button
          size="sm"
          variant="outline"
          onClick={e => {
            e.stopPropagation()
            setEditing(patient)
            setFormOpen(true)
          }}
          title="Edit"
        >
          <Edit size={16} />
        </Button>
      )}
      {canDelete && (
        <Button
          size="sm"
          variant="destructive"
          onClick={e => {
            e.stopPropagation()
            setDeleting(patient)
          }}
          title="Delete"
        >
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Patients</h1>
            <p className="text-muted">{total} registered</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={openDownload} className="flex-1 sm:flex-none">
              <Download size={18} className="mr-2" />
              Report
            </Button>
            {canWrite && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
                className="flex-1 sm:flex-none"
              >
                <Plus size={18} className="mr-2" />
                Add Patient
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by name, patient ID or phone"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={status}
            onChange={e => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            {PATIENT_STATUSES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={joinedFrom}
              onChange={e => {
                setJoinedFrom(e.target.value)
                setPage(1)
              }}
              aria-label="Joined from"
              title="Joined from"
            />
            <span className="text-muted text-sm shrink-0">to</span>
            <Input
              type="date"
              value={joinedTo}
              onChange={e => {
                setJoinedTo(e.target.value)
                setPage(1)
              }}
              aria-label="Joined to"
              title="Joined to"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading patients…</p>
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {filtering ? 'No patients match those filters' : 'No patients registered yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      <SortHeader label="Patient ID" keyName="patient_id" />
                      <SortHeader label="Name" keyName="name" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                        Age / Sex
                      </th>
                      <SortHeader label="Joined" keyName="date_of_join" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                        Phone
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {patients.map(patient => (
                      <tr
                        key={patient.id}
                        className="hover:bg-table-row-hover cursor-pointer"
                        onClick={() => router.push(`/patients/${patient.id}`)}
                      >
                        <td className="px-4 py-3 text-info font-medium">{patient.patient_id}</td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{patient.name}</div>
                          {patient.blood_group && (
                            <div className="text-xs text-muted mt-0.5">{patient.blood_group}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {[formatAge(patient), patient.gender].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {date(patient.date_of_join)}
                          <UpdatedStamp
                            by={patient.updated_by_user?.username}
                            at={patient.updated_at}
                            className="mt-0.5"
                          />
                        </td>
                        <td className="px-4 py-3 text-foreground">{patient.phone || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANTS[patient.status] ?? 'outline'}>
                            {patient.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{actionsFor(patient)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border">
                {patients.map(patient => (
                  <div
                    key={patient.id}
                    className="p-4 space-y-3 cursor-pointer hover:bg-table-row-hover"
                    onClick={() => router.push(`/patients/${patient.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-info text-xs font-medium">{patient.patient_id}</div>
                        <div className="text-foreground font-medium truncate">{patient.name}</div>
                      </div>
                      <Badge variant={STATUS_VARIANTS[patient.status] ?? 'outline'}>
                        {patient.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted">Age / Sex</div>
                        <div className="text-foreground">
                          {[formatAge(patient), patient.gender].filter(Boolean).join(' / ') || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted">Phone</div>
                        <div className="text-foreground">{patient.phone || '—'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-muted">Joined</div>
                        <div className="text-foreground">{date(patient.date_of_join)}</div>
                        <UpdatedStamp
                          by={patient.updated_by_user?.username}
                          at={patient.updated_at}
                        />
                      </div>
                    </div>
                    {actionsFor(patient)}
                  </div>
                ))}
              </div>
            </div>

            <TablePagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={setPage}
              onPageSizeChange={size => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </>
        )}
      </div>

      <PatientFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSuccess={fetchPatients}
        patient={editing}
      />

      <Modal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Delete ${deleting?.name ?? 'patient'}?`}
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          This also destroys their billing, charges, consultations, lab orders and discharge
          summaries. It cannot be undone. To take a patient off the active list instead, set their
          status to Cancelled.
        </p>
      </Modal>

      <Modal
        isOpen={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        size="sm"
        title="Download patient report"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDownloadOpen(false)} disabled={downloading}>
              Cancel
            </Button>
            <Button onClick={handleDownload} disabled={downloading || !downloadPatientId}>
              <Download size={16} className="mr-2" />
              {downloading ? 'Generating…' : 'Download'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="download-patient">
              Patient <span className="text-destructive">*</span>
            </Label>
            <Select
              id="download-patient"
              value={downloadPatientId}
              onChange={e => setDownloadPatientId(e.target.value)}
            >
              <option value="">Select…</option>
              {downloadOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.patient_id})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="download-range">Date range</Label>
            <Select
              id="download-range"
              value={downloadRange}
              onChange={e => setDownloadRange(e.target.value as typeof downloadRange)}
            >
              <option value="all">All time</option>
              <option value="last_month">Last month</option>
              <option value="last_year">Last year</option>
              <option value="custom">Custom</option>
            </Select>
          </div>

          {downloadRange === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="download-start">From</Label>
                <Input
                  id="download-start"
                  type="date"
                  value={downloadStart}
                  onChange={e => setDownloadStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="download-end">To</Label>
                <Input
                  id="download-end"
                  type="date"
                  value={downloadEnd}
                  onChange={e => setDownloadEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  )
}
