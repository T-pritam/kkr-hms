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
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Lab Tests Management
            </h1>
            <p className="text-gray-400">Manage test catalog and parameters</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2" size={20} />
            Add New Test
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <Input
              type="text"
              placeholder="Search tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-900 border-gray-800 text-white"
            />
          </div>
        </div>

        {/* Tests Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-400">Loading tests...</p>
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12 bg-gray-900 rounded-lg border border-gray-800">
            <p className="text-gray-400">No tests found</p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Test Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Sample Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {tests.map((test) => (
                    <tr key={test.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-white">{test.name}</td>
                      <td className="px-4 py-3 text-gray-300">{test.code}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-sm">
                          {test.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{test.sample_type}</td>
                      <td className="px-4 py-3 text-gray-300">₹{test.price}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-sm ${
                            test.is_active
                              ? 'bg-green-600/20 text-green-400'
                              : 'bg-red-600/20 text-red-400'
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
                            className="text-purple-400 hover:text-purple-300 hover:bg-purple-600/20"
                          >
                            <Settings size={16} />
                          </Button>
                          <Button
                            onClick={() => setEditingTest(test)}
                            variant="ghost"
                            size="sm"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-600/20"
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            onClick={() => handleDelete(test.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-600/20"
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
