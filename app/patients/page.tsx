'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CreatePatientModal } from '@/components/patients/create-patient-modal'
import { EditPatientModal } from '@/components/patients/edit-patient-modal'
import { TablePagination } from '@/components/ui/table-pagination'

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
      ? 'bg-green-900/30 text-green-400 border-green-800'
      : 'bg-gray-900/30 text-gray-400 border-gray-800'
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Patient Management</h1>
            <p className="text-gray-400 mt-1 text-sm sm:text-base">Manage patient records</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <Input
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
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : patients.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No patients found. {searchTerm && 'Try a different search term or '}Click "Add Patient" to create a new record.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Patient ID</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Name</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Gender</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Date of Join</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Phone</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map((patient: any) => (
                        <tr
                          key={patient.id}
                          className="border-b border-gray-800 hover:bg-gray-900/50 cursor-pointer"
                          onClick={() => router.push(`/patients/${patient.id}`)}
                        >
                          <td className="py-3 px-4 text-blue-400 font-medium">{patient.patient_id}</td>
                          <td className="py-3 px-4 text-white flex items-center gap-2">
                            {patient.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-3 py-1 rounded-full text-xs font-medium border bg-blue-900/30 text-blue-400 border-blue-800">
                              {patient.gender}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {patient.date_of_join ? new Date(patient.date_of_join).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-gray-300">{patient.phone || 'N/A'}</td>
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
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => router.push(`/patients/${patient.id}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-blue-400 font-medium text-sm">{patient.patient_id}</div>
                          <h3 className="text-white font-medium mt-1">{patient.name}</h3>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.status)}`}>
                          {patient.status}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Gender:</span>
                          <span className="text-white">{patient.gender}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Date of Join:</span>
                          <span className="text-white">
                            {patient.date_of_join ? new Date(patient.date_of_join).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Phone:</span>
                          <span className="text-white">{patient.phone || 'N/A'}</span>
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
    </DashboardLayout>
  )
}
