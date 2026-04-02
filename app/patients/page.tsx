'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, Search, Download, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CreatePatientModal } from '@/components/patients/create-patient-modal'
import { EditPatientModal } from '@/components/patients/edit-patient-modal'
import { TablePagination } from '@/components/ui/table-pagination'
import { fetchPatientPDFData, generatePatientPDF } from '@/lib/pdf/patient-pdf'

export default function PatientsPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalPatients, setTotalPatients] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [downloadPatientId, setDownloadPatientId] = useState('')
  const [downloadPatientSearch, setDownloadPatientSearch] = useState('')
  const [downloadFilterType, setDownloadFilterType] = useState<'all' | 'last_month' | 'last_year' | 'custom'>('all')
  const [downloadCustomStart, setDownloadCustomStart] = useState('')
  const [downloadCustomEnd, setDownloadCustomEnd] = useState('')
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [allPatientsList, setAllPatientsList] = useState<any[]>([])

  const fetchAllPatients = async () => {
    try {
      const res = await fetch('/api/patients?page=1&pageSize=500')
      const data = await res.json()
      if (res.ok) setAllPatientsList(data.patients || [])
    } catch {}
  }

  const handleDownloadPDF = async () => {
    if (!downloadPatientId) { alert('Please select a patient'); return }
    setDownloadLoading(true)
    try {
      let dateFilter: { start?: string; end?: string } | undefined
      const now = new Date()
      if (downloadFilterType === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        dateFilter = {
          start: lastMonth.toISOString().split('T')[0],
          end: endOfLastMonth.toISOString().split('T')[0],
        }
      } else if (downloadFilterType === 'last_year') {
        dateFilter = {
          start: `${now.getFullYear() - 1}-01-01`,
          end: `${now.getFullYear() - 1}-12-31`,
        }
      } else if (downloadFilterType === 'custom' && downloadCustomStart && downloadCustomEnd) {
        dateFilter = { start: downloadCustomStart, end: downloadCustomEnd }
      }
      const data = await fetchPatientPDFData(downloadPatientId, dateFilter)
      generatePatientPDF(data)
    } catch {
      alert('Failed to generate PDF')
    } finally {
      setDownloadLoading(false)
    }
  }

  const fetchPatients = async () => {
    try {
      setLoading(true)
      const url = `/api/patients?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(searchTerm)}`
      const response = await fetch(url)
      const data = await response.json()
      if (response.ok) {
        setPatients(data.patients || [])
        setTotalPatients(data.total || 0)
        setTotalPages(data.totalPages || 0)
      }
    } catch (error) {
      console.error('Error fetching patients:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPatients()
    }, 300) // Debounce search
    return () => clearTimeout(timer)
  }, [searchTerm, currentPage, pageSize])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this patient?')) return

    try {
      const response = await fetch(`/api/patients/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchPatients()
      } else {
        alert('Failed to delete patient')
      }
    } catch (error) {
      console.error('Error deleting patient:', error)
      alert('Error deleting patient')
    }
  }

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const getStatusColor = (status: string) => {
    return status === 'Active'
      ? 'bg-success-subtle text-success-text border-success/20'
      : 'bg-surface text-muted border-border'
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Patient Management</h1>
            <p className="text-muted mt-1 text-sm sm:text-base">Manage patient records</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={() => {
                setDownloadModalOpen(true)
                if (allPatientsList.length === 0) fetchAllPatients()
              }}
              variant="outline"
              className="flex-1 sm:flex-none"
            >
              <Download size={18} className="mr-2" />
              Download Report
            </Button>
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="flex-1 sm:flex-none"
            >
              <Plus size={20} className="mr-2" />
              Add Patient
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span className="text-base sm:text-lg">Total {totalPatients} patients</span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" size={18} />
                  <Input
                    type="search"
                    placeholder="Search patients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted">Loading...</div>
            ) : patients.length === 0 ? (
              <div className="text-center py-12 text-muted">
                No patients found. {searchTerm && 'Try a different search term or '}Click "Add Patient" to create a new record.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Patient ID</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Name</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Gender</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Date of Join</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Phone</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map((patient: any) => (
                        <tr
                          key={patient.id}
                          className="border-b border-border hover:bg-table-row-hover cursor-pointer"
                          onClick={() => router.push(`/patients/${patient.id}`)}
                        >
                          <td className="py-3 px-4 text-info font-medium">{patient.patient_id}</td>
                          <td className="py-3 px-4 text-foreground flex items-center gap-2">
                            {patient.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-3 py-1 rounded-full text-xs font-medium border bg-info-subtle text-info border-info/20">
                              {patient.gender}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            {patient.date_of_join ? new Date(patient.date_of_join).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-foreground">{patient.phone || 'N/A'}</td>
                          <td className="py-3 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.status)}`}>
                              {patient.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPatient(patient)
                                  setEditModalOpen(true)
                                }}
                              >
                                <Edit size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={(e) => { 
                                  e.stopPropagation();
                                  handleDelete(patient.id)
                                }}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {patients.map((patient: any) => (
                    <div
                      key={patient.id}
                      className="bg-surface-elevated rounded-lg p-4 border border-input-border cursor-pointer hover:bg-surface-hover transition-colors"
                      onClick={() => router.push(`/patients/${patient.id}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-info font-medium text-sm">{patient.patient_id}</div>
                          <h3 className="text-foreground font-medium mt-1">{patient.name}</h3>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.status)}`}>
                          {patient.status}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted">Gender:</span>
                          <span className="text-foreground">{patient.gender}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Date of Join:</span>
                          <span className="text-foreground">
                            {patient.date_of_join ? new Date(patient.date_of_join).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Phone:</span>
                          <span className="text-foreground">{patient.phone || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedPatient(patient)
                            setEditModalOpen(true)
                          }}
                          className="flex-1"
                        >
                          <Edit size={16} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(patient.id)
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {patients.length > 0 && (
                  <div className="mt-6">
                    <TablePagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      totalItems={totalPatients}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={(size) => {
                        setPageSize(size)
                        setCurrentPage(1)
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <CreatePatientModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchPatients}
      />

      <EditPatientModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setSelectedPatient(null)
        }}
        onSuccess={fetchPatients}
        patient={selectedPatient}
      />

      {/* Download Report Modal */}
      {downloadModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Download Patient Report</h2>
              <button onClick={() => setDownloadModalOpen(false)} className="p-1 hover:bg-surface-hover rounded-lg">
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>

            {/* Patient Select */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">Select Patient *</label>
              <select
                value={downloadPatientId}
                onChange={(e) => setDownloadPatientId(e.target.value)}
                className="w-full bg-input border border-input-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Select a Patient --</option>
                {allPatientsList.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.patient_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">Date Range</label>
              <div className="grid grid-cols-2 gap-2">
                {(['all', 'last_month', 'last_year', 'custom'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDownloadFilterType(f)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      downloadFilterType === f
                        ? 'bg-primary text-foreground border-primary'
                        : 'bg-surface-hover text-muted border-border hover:text-foreground'
                    }`}
                  >
                    {f === 'all' ? 'All Time' : f === 'last_month' ? 'Last Month' : f === 'last_year' ? 'Last Year' : 'Custom'}
                  </button>
                ))}
              </div>
            </div>

            {downloadFilterType === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Start Date</label>
                  <input
                    type="date"
                    value={downloadCustomStart}
                    onChange={(e) => setDownloadCustomStart(e.target.value)}
                    className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">End Date</label>
                  <input
                    type="date"
                    value={downloadCustomEnd}
                    onChange={(e) => setDownloadCustomEnd(e.target.value)}
                    className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleDownloadPDF}
                disabled={downloadLoading || !downloadPatientId}
                className="flex-1 flex items-center justify-center gap-2 bg-info hover:bg-info-hover text-foreground px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {downloadLoading ? 'Generating...' : 'Download PDF'}
              </button>
              <button
                onClick={() => setDownloadModalOpen(false)}
                className="px-4 py-2.5 bg-surface-hover text-foreground rounded-lg hover:bg-surface-inset transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
