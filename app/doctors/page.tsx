'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { TablePagination } from '@/components/ui/table-pagination'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { DoctorFormModal } from '@/components/doctors/doctor-form-modal'
import { DEPARTMENTS } from '@/lib/doctors/constants'
import { hasDoctorCapability } from '@/lib/doctors/authz'
import { useUser } from '@/hooks/use-user'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { AlertTriangle, Edit, Plus, Power, Search, Trash2 } from 'lucide-react'

/**
 * The doctor registry.
 *
 * Rebuilt onto the lab-orders house style — filter bar, Badge chips, inline
 * error banner, "Updated by" attribution — and, more importantly, onto the
 * deactivate-rather-than-delete rule. Deleting a doctor used to be a hard
 * delete with no dependency check while consultations, fee settlements, lab
 * orders and signed discharge summaries all pointed at the row.
 */

interface Doctor {
  id: string
  name: string
  qualification: string | null
  designation: string | null
  department: string | null
  specialist: string | null
  mobile: string | null
  email: string | null
  registration_no: string | null
  is_active: boolean
  updated_at: string | null
  updated_by_user?: { username?: string } | null
}

interface DeleteTarget {
  doctor: Doctor
  /** Populated once the server has said what is in the way. */
  references?: { label: string; count: number }[]
}

export default function DoctorsPage() {
  const { user } = useUser()
  const canWrite = hasDoctorCapability(user?.role, 'doctor:write')
  const canDelete = hasDoctorCapability(user?.role, 'doctor:delete')

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [activeFilter, setActiveFilter] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Doctor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchDoctors = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (department) params.set('department', department)
      if (activeFilter) params.set('active', activeFilter)

      const res = await fetch(`/api/doctors?${params}`)
      const body = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(body?.error || 'Failed to load doctors')

      setDoctors(body.doctors || [])
      setTotal(body.total || 0)
      setTotalPages(body.totalPages || 0)
      setError('')
    } catch (err: any) {
      // Shown rather than swallowed — the old page logged to the console and
      // left the previous list on screen as though nothing had happened.
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, department, activeFilter])

  useEffect(() => {
    void fetchDoctors()
  }, [fetchDoctors])

  useRealtimeRefetch(['doctors'], fetchDoctors)

  const toggleActive = async (doctor: Doctor) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/doctors/${doctor.id}/deactivate`, {
        method: doctor.is_active ? 'POST' : 'DELETE',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to update the doctor')
      await fetchDoctors()
      setDeleteTarget(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/doctors/${deleteTarget.doctor.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))

      if (res.status === 409) {
        // Not an error to shout about — it is the dialog telling the user what
        // is in the way so they can deactivate instead.
        setDeleteTarget({ ...deleteTarget, references: body.references || [] })
        return
      }

      if (!res.ok) throw new Error(body?.error || 'Failed to delete the doctor')

      await fetchDoctors()
      setDeleteTarget(null)
    } catch (err: any) {
      setError(err.message)
      setDeleteTarget(null)
    } finally {
      setBusy(false)
    }
  }

  const filtering = Boolean(debouncedSearch || department || activeFilter)

  const actionsFor = (doctor: Doctor) => (
    <div className="flex justify-end gap-2">
      {canWrite && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(doctor)
              setFormOpen(true)
            }}
            title="Edit"
          >
            <Edit size={16} />
          </Button>
          <Button
            size="sm"
            variant={doctor.is_active ? 'outline' : 'success'}
            onClick={() => toggleActive(doctor)}
            disabled={busy}
            title={doctor.is_active ? 'Deactivate' : 'Reactivate'}
          >
            <Power size={16} />
          </Button>
        </>
      )}
      {canDelete && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDeleteTarget({ doctor })}
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Doctors</h1>
            <p className="text-muted">
              The consulting and referring doctors offered across the app.
            </p>
          </div>
          {canWrite && (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2" size={18} />
              Add Doctor
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by name, department or qualification"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={department}
            onChange={e => {
              setDepartment(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select
            value={activeFilter}
            onChange={e => {
              setActiveFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Active and inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading doctors…</p>
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {filtering ? 'No doctors match those filters' : 'No doctors yet'}
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
                      {['Name', 'Department', 'Specialist', 'Mobile', 'Status'].map(h => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium text-muted uppercase"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {doctors.map(doctor => (
                      <tr key={doctor.id} className="hover:bg-table-row-hover">
                        <td className="px-4 py-3">
                          <div className="text-foreground font-medium">{doctor.name}</div>
                          {(doctor.qualification || doctor.designation) && (
                            <div className="text-xs text-muted mt-0.5">
                              {[doctor.qualification, doctor.designation]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                          <UpdatedStamp
                            by={doctor.updated_by_user?.username}
                            at={doctor.updated_at}
                            className="mt-0.5"
                          />
                        </td>
                        <td className="px-4 py-3 text-foreground">{doctor.department || '—'}</td>
                        <td className="px-4 py-3 text-foreground">{doctor.specialist || '—'}</td>
                        <td className="px-4 py-3 text-foreground">{doctor.mobile || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={doctor.is_active ? 'success' : 'outline'}>
                            {doctor.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{actionsFor(doctor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border">
                {doctors.map(doctor => (
                  <div key={doctor.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">{doctor.name}</div>
                        <div className="text-xs text-muted">
                          {[doctor.qualification, doctor.designation].filter(Boolean).join(' · ') ||
                            '—'}
                        </div>
                      </div>
                      <Badge variant={doctor.is_active ? 'success' : 'outline'}>
                        {doctor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted">Department</div>
                        <div className="text-foreground">{doctor.department || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted">Specialist</div>
                        <div className="text-foreground">{doctor.specialist || '—'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-muted">Mobile</div>
                        <div className="text-foreground">{doctor.mobile || '—'}</div>
                        <UpdatedStamp
                          by={doctor.updated_by_user?.username}
                          at={doctor.updated_at}
                        />
                      </div>
                    </div>
                    {actionsFor(doctor)}
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

      <DoctorFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSuccess={fetchDoctors}
        doctor={editing}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title={`Delete ${deleteTarget?.doctor.name ?? 'doctor'}?`}
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            {deleteTarget?.references?.length ? (
              <Button
                onClick={() => deleteTarget && toggleActive(deleteTarget.doctor)}
                disabled={busy}
              >
                <Power size={16} className="mr-2" />
                Deactivate instead
              </Button>
            ) : (
              <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
                Delete
              </Button>
            )}
          </div>
        }
      >
        {deleteTarget?.references?.length ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2 p-3 rounded-md bg-warning-subtle border border-warning/30 text-warning-text">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>This doctor is referenced by existing records and cannot be deleted.</span>
            </div>
            <ul className="list-disc pl-5 text-foreground space-y-1">
              {deleteTarget.references.map(r => (
                <li key={r.label}>
                  {r.count} {r.label}
                </li>
              ))}
            </ul>
            <p className="text-muted">
              Deactivating hides them from every picker. The records above keep their name.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            This permanently removes the doctor. If anything still references them the delete is
            refused and you will be offered deactivation instead.
          </p>
        )}
      </Modal>
    </DashboardLayout>
  )
}
