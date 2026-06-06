import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, KeyRound, Search } from 'lucide-react'
import { CreateUserModal } from '@/components/admin/create-user-modal'
import { EditUserModal } from '@/components/admin/edit-user-modal'
import { TablePagination } from '@/components/ui/table-pagination'
import { Input } from '@/components/ui/input'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'

export default function AdminPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const url = `/api/admin/users?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(searchTerm)}`
      const response = await fetch(url)
      const data = await response.json()
      if (response.ok) {
        setUsers(data.users || [])
        setTotalUsers(data.total || 0)
        setTotalPages(data.totalPages || 0)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers()
    }, 300) // Debounce search
    return () => clearTimeout(timer)
  }, [currentPage, pageSize, searchTerm])

  useRealtimeRefetch(['users'], fetchUsers)

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchUsers()
      } else {
        alert('Failed to delete user')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user')
    }
  }

  const handleResetPassword = async (userId: string, email: string) => {
    if (!confirm(`Reset password for ${email} to default password?`)) return

    try {
      const response = await apiFetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        alert('Password reset successfully. User will need to change it on next login.')
      } else {
        alert(data.error || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Error resetting password:', error)
      alert('Error resetting password')
    }
  }

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'

    try {
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        fetchUsers()
      } else {
        alert('Failed to update status')
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Error updating status')
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-accent-subtle text-accent border-accent/20'
      case 'DOCTOR':
        return 'bg-info-subtle text-info border-info/20'
      case 'NURSE':
        return 'bg-success-subtle text-success-text border-success/20'
      case 'RECEPTIONIST':
        return 'bg-primary-subtle text-primary border-primary/20'
      default:
        return 'bg-surface text-muted border-border'
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">User Management</h1>
            <p className="text-muted mt-1 text-sm sm:text-base">Manage users, roles, and permissions</p>
          </div>
          <Button onClick={() => setCreateModalOpen(true)} className="w-full sm:w-auto">
            <Plus size={20} className="mr-2" />
            Create User
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span className="text-base sm:text-lg">Total {totalUsers} users</span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" size={18} />
                  <Input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted">Loading...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted">
                No users found. Click "Create User" to add a new user.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">
                          Username
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">
                          Email
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">
                          Role
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">
                          Last Login
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user: any) => (
                        <tr
                          key={user.id}
                          className="border-b border-border hover:bg-table-row-hover"
                        >
                          <td className="py-3 px-4 text-foreground">{user.username}</td>
                          <td className="py-3 px-4 text-foreground">{user.email}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                                user.role
                              )}`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleStatus(user.id, user.status)}
                              disabled={user.role === 'ADMIN'}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                                user.role === 'ADMIN' ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              style={{
                                backgroundColor:
                                  user.status === 'ACTIVE' ? 'var(--primary)' : 'var(--input-border)',
                              }}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  user.status === 'ACTIVE'
                                    ? 'translate-x-6'
                                    : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>
                          <td className="py-3 px-4 text-muted text-sm">
                            {user.last_login
                              ? new Date(user.last_login).toLocaleString()
                              : 'Never'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedUser(user)
                                  setEditModalOpen(true)
                                }}
                                disabled={user.role === 'ADMIN'}
                              >
                                <Edit size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResetPassword(user.id, user.email)}
                              >
                                <KeyRound size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(user.id)}
                                disabled={user.role === 'ADMIN'}
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

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {users.map((user: any) => (
                    <div
                      key={user.id}
                      className="bg-surface-hover rounded-lg p-4 border border-input-border"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-foreground font-medium">{user.username}</h3>
                          <p className="text-muted text-sm">{user.email}</p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                            user.role
                          )}`}
                        >
                          {user.role}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted">Status:</span>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.status)}
                          disabled={user.role === 'ADMIN'}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            user.role === 'ADMIN' ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          style={{
                            backgroundColor:
                              user.status === 'ACTIVE' ? 'var(--primary)' : 'var(--input-border)',
                          }}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              user.status === 'ACTIVE'
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="text-sm text-muted mb-3">
                        Last login: {user.last_login
                          ? new Date(user.last_login).toLocaleString()
                          : 'Never'}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUser(user)
                            setEditModalOpen(true)
                          }}
                          disabled={user.role === 'ADMIN'}
                          className="flex-1"
                        >
                          <Edit size={16} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResetPassword(user.id, user.email)}
                          className="flex-1"
                        >
                          <KeyRound size={16} className="mr-1" />
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(user.id)}
                          disabled={user.role === 'ADMIN'}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {users.length > 0 && (
                  <div className="mt-6">
                    <TablePagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      totalItems={totalUsers}
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

      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchUsers}
      />

      <EditUserModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setSelectedUser(null)
        }}
        onSuccess={fetchUsers}
        user={selectedUser}
      />
    </DashboardLayout>
  )
}
