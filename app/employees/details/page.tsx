'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Edit, Trash2, Upload } from 'lucide-react'
import { CreateEmployeeModal } from '@/components/employees/create-employee-modal'
import { EditEmployeeModal } from '@/components/employees/edit-employee-modal'
import { ImportEmployeeModal } from '@/components/employees/import-employee-modal'
import { TablePagination } from '@/components/ui/table-pagination'

export default function EmployeeDetailsPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  const [totalEmployees, setTotalEmployees] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const url = `/api/employees?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(searchTerm)}`
      const response = await fetch(url)
      const data = await response.json()

      if (response.ok) {
        setEmployees(data.employees || [])
        setTotalEmployees(data.total || 0)
        setTotalPages(data.totalPages || 0)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(fetchEmployees, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, currentPage, pageSize])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return
    await fetch(`/api/employees/${id}`, { method: 'DELETE' })
    fetchEmployees()
  }

  const formatDate = (date?: string) =>
    date ? new Date(date).toLocaleDateString() : 'N/A'

  const formatCurrency = (amount?: number) =>
    amount ? `₹${amount.toLocaleString('en-IN')}` : '₹0'

  const getStatusColor = (status: string) =>
    status === 'Active'
      ? 'bg-green-900/30 text-green-400 border-green-800'
      : 'bg-red-900/30 text-red-400 border-red-800'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Employee Management
            </h1>
            <p className="text-gray-400 mt-1">
              Manage hospital employees
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setImportModalOpen(true)}
            >
              <Upload size={18} className="mr-2" />
              Import CSV
            </Button>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus size={18} className="mr-2" />
              Add Employee
            </Button>
          </div>
        </div>

        {/* Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span>Total {totalEmployees} employees</span>

              <div className="relative w-full sm:w-64">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-400">
                Loading...
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No employees found
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
                          Designation
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Salary
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Join Date
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-gray-400">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {employees.map((emp) => (
                        <tr
                          key={emp.id}
                          className="border-b border-gray-800 hover:bg-gray-900/50"
                        >
                          <td className="py-3 px-4 text-white">
                            {emp.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-3 py-1 rounded-full text-xs border bg-blue-900/30 text-blue-400 border-blue-800">
                              {emp.designation || 'N/A'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {formatCurrency(emp.base_salary)}
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {formatDate(emp.join_date)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-3 py-1 rounded-full text-xs border ${getStatusColor(emp.status)}`}
                            >
                              {emp.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedEmployee(emp)
                                  setEditModalOpen(true)
                                }}
                              >
                                <Edit size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(emp.id)}
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
                  {employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex justify-between mb-3">
                        <div>
                          <h3 className="text-white font-medium">
                            {emp.name}
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">
                            {emp.designation || 'N/A'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs border ${getStatusColor(emp.status)}`}
                        >
                          {emp.status}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Salary:</span>
                          <span className="text-white">
                            {formatCurrency(emp.base_salary)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Join Date:</span>
                          <span className="text-white">
                            {formatDate(emp.join_date)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setSelectedEmployee(emp)
                            setEditModalOpen(true)
                          }}
                        >
                          <Edit size={16} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(emp.id)}
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
                    totalItems={totalEmployees}
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

      {/* Modals */}
      <CreateEmployeeModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchEmployees}
      />

      <EditEmployeeModal
        isOpen={editModalOpen}
        employee={selectedEmployee}
        onClose={() => {
          setEditModalOpen(false)
          setSelectedEmployee(null)
        }}
        onSuccess={fetchEmployees}
      />

      <ImportEmployeeModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={fetchEmployees}
      />
    </DashboardLayout>
  )
}
