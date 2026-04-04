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
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'

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
      const response = await fetch(`/api/employees?status=Active`, {
        credentials: 'include'
      })
      const data = await response.json()

      if (response.ok && data.success) {
        // Filter by search term client-side for now
        const filtered = searchTerm
          ? (data.data || []).filter((emp: any) =>
              emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              emp.designation?.toLowerCase().includes(searchTerm.toLowerCase())
            )
          : data.data || []

        // Implement client-side pagination
        const start = (currentPage - 1) * pageSize
        const end = start + pageSize
        const paginated = filtered.slice(start, end)

        setEmployees(paginated)
        setTotalEmployees(filtered.length)
        setTotalPages(Math.ceil(filtered.length / pageSize))
      } else {
        console.error('Failed to fetch:', data.error)
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

  useRealtimeRefetch(['employees'], fetchEmployees)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to mark this employee as Inactive? Their historical salary and advance records will be preserved.')) return

    try {
      const response = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        fetchEmployees()
      } else {
        alert(data.error || 'Failed to delete employee')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete employee')
    }
  }

  const formatDate = (date?: string) =>
    date ? new Date(date).toLocaleDateString() : 'N/A'

  const formatCurrency = (amount?: number) =>
    amount ? `₹${amount.toLocaleString('en-IN')}` : '₹0'

  const getStatusColor = (status: string) =>
    status === 'Active'
      ? 'bg-success-subtle text-success-text border-success/20'
      : 'bg-destructive-subtle text-destructive border-destructive/20'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Employee Management
            </h1>
            <p className="text-muted mt-1">
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
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
              <div className="text-center py-12 text-muted">
                Loading...
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-12 text-muted">
                No employees found
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
                          Designation
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Salary
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Join Date
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {employees.map((emp) => (
                        <tr
                          key={emp.id}
                          className="border-b border-border hover:bg-table-row-hover"
                        >
                          <td className="py-3 px-4 text-foreground">
                            {emp.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-3 py-1 rounded-full text-xs border bg-info-subtle text-info border-info/20">
                              {emp.designation || 'N/A'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-foreground">
                            {formatCurrency(emp.base_salary)}
                          </td>
                          <td className="py-3 px-4 text-foreground">
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
                      className="bg-surface-hover rounded-lg p-4 border border-input-border"
                    >
                      <div className="flex justify-between mb-3">
                        <div>
                          <h3 className="text-foreground font-medium">
                            {emp.name}
                          </h3>
                          <p className="text-sm text-muted mt-1">
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
                          <span className="text-muted">Salary:</span>
                          <span className="text-foreground">
                            {formatCurrency(emp.base_salary)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Join Date:</span>
                          <span className="text-foreground">
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
