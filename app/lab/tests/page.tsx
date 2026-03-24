'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Edit, Trash2, Settings } from 'lucide-react'
import { CreateLabTestModal } from '@/components/lab/create-lab-test-modal'
import { EditLabTestModal } from '@/components/lab/edit-lab-test-modal'
import { ManageParametersModal } from '@/components/lab/manage-parameters-modal'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

interface LabTest {
  id: string
  name: string
  code: string
  category: string
  sample_type: string
  price: number
  is_active: boolean
}

export default function LabTestsPage() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTest, setEditingTest] = useState<LabTest | null>(null)
  const [managingParameters, setManagingParameters] = useState<LabTest | null>(null)
  const router = useRouter()

  const categories = ['Biochemistry', 'Hematology', 'Endocrinology', 'Clinical Pathology']

  useEffect(() => {
    fetchTests()
  }, [searchQuery, categoryFilter])

  const fetchTests = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('name', searchQuery)
      if (categoryFilter) params.append('category', categoryFilter)

      const response = await fetch(`/api/lab-tests?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setTests(result.data.data)
      }
    } catch (error) {
      console.error('Error fetching lab tests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this test?')) return

    try {
      const response = await fetch(`/api/lab-tests/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchTests()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete test')
      }
    } catch (error) {
      console.error('Error deleting test:', error)
      alert('Failed to delete test')
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Lab Tests Management
            </h1>
            <p className="text-muted">Manage test catalog and parameters</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-info hover:bg-info-hover text-foreground"
          >
            <Plus className="mr-2" size={20} />
            Add New Test
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" size={20} />
            <Input
              type="text"
              placeholder="Search tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-surface border-border text-foreground"
            />
          </div>
        </div>

        {/* Tests Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-info"></div>
            <p className="mt-2 text-muted">Loading tests...</p>
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">No tests found</p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Test Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Sample Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Price
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
                  {tests.map((test) => (
                    <tr key={test.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3 text-foreground">{test.name}</td>
                      <td className="px-4 py-3 text-foreground">{test.code}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-info-subtle text-info rounded text-sm">
                          {test.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{test.sample_type}</td>
                      <td className="px-4 py-3 text-foreground">₹{test.price}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-sm ${
                            test.is_active
                              ? 'bg-success-subtle text-success-text'
                              : 'bg-destructive-subtle text-destructive'
                          }`}
                        >
                          {test.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => setManagingParameters(test)}
                            variant="ghost"
                            size="sm"
                            className="text-accent hover:text-accent hover:bg-accent-subtle"
                          >
                            <Settings size={16} />
                          </Button>
                          <Button
                            onClick={() => setEditingTest(test)}
                            variant="ghost"
                            size="sm"
                            className="text-info hover:text-info hover:bg-info-subtle"
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            onClick={() => handleDelete(test.id)}
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive-subtle"
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
          </div>
        )}

        {/* Modals */}
        {showCreateModal && (
        <CreateLabTestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={fetchTests}
        />
      )}

      {editingTest && (
        <EditLabTestModal
          isOpen={!!editingTest}
          test={editingTest}
          onClose={() => setEditingTest(null)}
          onSuccess={fetchTests}
        />
      )}

      {managingParameters && (
        <ManageParametersModal
          isOpen={!!managingParameters}
          test={managingParameters}
          onClose={() => setManagingParameters(null)}
        />
        )}
      </div>
    </DashboardLayout>
  )
}
