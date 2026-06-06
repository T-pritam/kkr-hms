import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CreateDoctorModal } from '@/components/doctors/create-doctor-modal'
import { EditDoctorModal } from '@/components/doctors/edit-doctor-modal'
import { TablePagination } from '@/components/ui/table-pagination'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalDoctors, setTotalDoctors] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const fetchDoctors = async () => {
    try {
      setLoading(true)
      const url = `/api/doctors?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(searchTerm)}`
      const response = await apiFetch(url)
      const data = await response.json()

      if (response.ok) {
        setDoctors(data.doctors || [])
        setTotalDoctors(data.total || 0)
        setTotalPages(data.totalPages || 0)
      }
    } catch (error) {
      console.error('Error fetching doctors:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(fetchDoctors, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, currentPage, pageSize])

  useRealtimeRefetch(['doctors'], fetchDoctors)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this doctor?')) return

    try {
      const response = await apiFetch(`/api/doctors/${id}`, { method: 'DELETE' })
      if (response.ok) fetchDoctors()
      else alert('Failed to delete doctor')
    } catch (error) {
      console.error(error)
      alert('Error deleting doctor')
    }
  }

  const formatDate = (date: string) =>
    date ? new Date(date).toLocaleDateString() : 'N/A'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Doctor Management
            </h1>
            <p className="text-muted mt-1 text-sm sm:text-base">
              Manage hospital doctors
            </p>
          </div>

          <Button onClick={() => setCreateModalOpen(true)} className="w-full sm:w-auto">
            <Plus size={20} className="mr-2" />
            Add Doctor
          </Button>
        </div>

        {/* Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span className="text-base sm:text-lg">
                Total {totalDoctors} doctors
              </span>

              <div className="relative w-full sm:w-64">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <Input
                  placeholder="Search doctors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted">Loading...</div>
            ) : doctors.length === 0 ? (
              <div className="text-center py-12 text-muted">
                No doctors found.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-4 text-left text-muted">
                          Name
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Specialist
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Mobile
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Created At
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {doctors.map((doctor) => (
                        <tr
                          key={doctor.id}
                          className="border-b border-border hover:bg-table-row-hover"
                        >
                          <td className="py-3 px-4 text-foreground">
                            {doctor.name}
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            {doctor.specialist || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            {doctor.mobile || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            {formatDate(doctor.created_at)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedDoctor(doctor)
                                  setEditModalOpen(true)
                                }}
                              >
                                <Edit size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(doctor.id)}
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
                  {doctors.map((doctor) => (
                    <div
                      key={doctor.id}
                      className="bg-surface-elevated rounded-lg p-4 border border-input-border"
                    >
                      <div className="flex justify-between mb-3">
                        <div>
                          <h3 className="text-foreground font-medium">
                            {doctor.name}
                          </h3>
                          <p className="text-sm text-muted mt-1">
                            {doctor.specialist || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted">Mobile:</span>
                          <span className="text-foreground">
                            {doctor.mobile || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Created:</span>
                          <span className="text-foreground">
                            {formatDate(doctor.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setSelectedDoctor(doctor)
                            setEditModalOpen(true)
                          }}
                        >
                          <Edit size={16} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(doctor.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div className="mt-6">
                  <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalDoctors}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size)
                      setCurrentPage(1)
                    }}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateDoctorModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchDoctors}
      />

      <EditDoctorModal
        isOpen={editModalOpen}
        doctor={selectedDoctor}
        onClose={() => {
          setEditModalOpen(false)
          setSelectedDoctor(null)
        }}
        onSuccess={fetchDoctors}
      />
    </DashboardLayout>
  )
}
