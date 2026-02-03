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
      const response = await fetch(url)
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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this doctor?')) return

    try {
      const response = await fetch(`/api/doctors/${id}`, { method: 'DELETE' })
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
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Doctor Management
            </h1>
            <p className="text-gray-400 mt-1 text-sm sm:text-base">
              Manage hospital doctors
            </p>
          </div>

          <Button onClick={() => setCreateModalOpen(true)}>
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : doctors.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No doctors found.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="py-3 px-4 text-left text-gray-400">
                          Name
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Specialist
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Mobile
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Created At
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {doctors.map((doctor) => (
                        <tr
                          key={doctor.id}
                          className="border-b border-gray-800 hover:bg-gray-900/50"
                        >
                          <td className="py-3 px-4 text-white">
                            {doctor.name}
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {doctor.specialist || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {doctor.mobile || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-gray-300">
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
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex justify-between mb-3">
                        <div>
                          <h3 className="text-white font-medium">
                            {doctor.name}
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">
                            {doctor.specialist || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Mobile:</span>
                          <span className="text-white">
                            {doctor.mobile || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Created:</span>
                          <span className="text-white">
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
