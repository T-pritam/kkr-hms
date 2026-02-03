'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Edit, Trash2, Upload } from 'lucide-react'
import { CreateEmployeeModal } from '@/components/employees/create-employee-modal'
import { EditEmployeeModal } from '@/components/employees/edit-employee-modal'
import { ImportEmployeeModal } from '@/components/employees/import-employee-modal'
import { TablePagination } from '@/components/ui/table-pagination'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  const [totalEmployees, setTotalEmployees] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees()
    }, 300) // Debounce search
    return () => clearTimeout(timer)
  }, [searchTerm, currentPage, pageSize])

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
      } else {
        console.error('Failed to fetch employees:', data.error)
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) {
      return
    }

    try {
      const response = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchEmployees()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete employee')
      }
    } catch (error) {
      console.error('Error deleting employee:', error)
      alert('Failed to delete employee')
    }
  }

  const handleEdit = (employee: any) => {
    setSelectedEmployee(employee)
    setShowEditModal(true)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const formatCurrency = (amount: number) => {
    if (!amount) return '₹0'
    return `₹${amount.toLocaleString('en-IN')}`
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Employee Details</h1>
            <p className="text-gray-400 mt-1">Manage hospital employees</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => setShowImportModal(true)}
              variant="outline"
              className="w-full sm:w-auto flex items-center gap-2"
            >
              <Upload size={20} />
              Import from CSV
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto flex items-center gap-2"
            >
              <Plus size={20} />
              Add Employee
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <Input
            type="text"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Sl No.
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Designation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Base Salary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Join Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-400">
                      No employees found
                    </td>
                  </tr>
                ) : (
                  employees.map((employee, index) => (
                    <tr key={employee.id} className="hover:bg-gray-800/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {((currentPage - 1) * pageSize) + index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {employee.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 text-xs rounded-md bg-blue-900/30 text-blue-400 border border-blue-800">
                          {employee.designation || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatCurrency(employee.base_salary)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatDate(employee.join_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded-md ${
                            employee.status === 'Active'
                              ? 'bg-green-900/30 text-green-400 border border-green-800'
                              : 'bg-red-900/30 text-red-400 border border-red-800'
                          }`}
                        >
                          {employee.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(employee)}
                            className="text-orange-400 hover:text-orange-300 flex items-center gap-1 px-3 py-1 rounded-md bg-orange-900/20 border border-orange-800"
                          >
                            <Edit size={16} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(employee.id)}
                            className="text-red-400 hover:text-red-300 flex items-center gap-1 px-3 py-1 rounded-md bg-red-900/20 border border-red-800"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : employees.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No employees found</div>
          ) : (
            employees.map((employee, index) => (
              <div
                key={employee.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">#{((currentPage - 1) * pageSize) + index + 1}</span>
                      <h3 className="text-lg font-semibold text-white">{employee.name}</h3>
                    </div>
                    <span className="inline-block mt-2 px-2 py-1 text-xs rounded-md bg-blue-900/30 text-blue-400 border border-blue-800">
                      {employee.designation || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400">Base Salary:</span>
                    <p className="text-white mt-1 font-semibold">{formatCurrency(employee.base_salary)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Join Date:</span>
                    <p className="text-white mt-1">{formatDate(employee.join_date)}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">Status:</span>
                    <div className="mt-1">
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded-md ${
                          employee.status === 'Active'
                            ? 'bg-green-900/30 text-green-400 border border-green-800'
                            : 'bg-red-900/30 text-red-400 border border-red-800'
                        }`}
                      >
                        {employee.status || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleEdit(employee)}
                    className="flex-1 text-orange-400 hover:text-orange-300 flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-orange-900/20 border border-orange-800"
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(employee.id)}
                    className="flex-1 text-red-400 hover:text-red-300 flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-red-900/20 border border-red-800"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {employees.length > 0 && (
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
        )}
      </div>

      {/* Modals */}
      <CreateEmployeeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchEmployees()
          setShowCreateModal(false)
        }}
      />

      <EditEmployeeModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          fetchEmployees()
          setShowEditModal(false)
        }}
        employee={selectedEmployee}
      />

      <ImportEmployeeModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          fetchEmployees()
          setShowImportModal(false)
        }}
      />
    </DashboardLayout>
  )
}
