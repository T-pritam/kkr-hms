'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Eye, Edit, FileText } from 'lucide-react'
import { CreateTestOrderModal } from '@/components/lab/create-test-order-modal'
import { TestResultEntryModal } from '@/components/lab/test-result-entry-modal'
import { ViewTestResultModal } from '@/components/lab/view-test-result-modal'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

interface TestResult {
  id: string
  test_date: string
  status: string
  price: number
  final_price: number
  lab_tests: {
    name: string
    code: string
    category: string
  }
  patients: {
    name: string
    patient_id: string
    phone: string
  }
  patient_name?: string
  patient_phone?: string
}

export default function TestResultsPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null)
  const [viewingResult, setViewingResult] = useState<TestResult | null>(null)

  const statuses = ['pending', 'collected', 'processing', 'completed', 'verified', 'cancelled']

  useEffect(() => {
    fetchResults()
  }, [statusFilter])

  const fetchResults = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/test-results?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setResults(result.data.data)
      }
    } catch (error) {
      console.error('Error fetching test results:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-600/20 text-yellow-400'
      case 'collected':
        return 'bg-blue-600/20 text-blue-400'
      case 'processing':
        return 'bg-purple-600/20 text-purple-400'
      case 'completed':
        return 'bg-green-600/20 text-green-400'
      case 'verified':
        return 'bg-emerald-600/20 text-emerald-400'
      case 'cancelled':
        return 'bg-red-600/20 text-red-400'
      default:
        return 'bg-gray-600/20 text-gray-400'
    }
  }

  const filteredResults = searchQuery
    ? results.filter(
        (r) =>
          r.lab_tests.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.patients?.name || r.patient_name)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.patients?.patient_id)?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : results

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Patient Test Results
            </h1>
            <p className="text-gray-400">Manage test orders and results</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2" size={20} />
            New Test Order
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <Input
              type="text"
              placeholder="Search by patient name, ID, or test..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-900 border-gray-800 text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-md px-4 py-2 text-white"
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Results Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-400">Loading test results...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-12 bg-gray-900 rounded-lg border border-gray-800">
            <p className="text-gray-400">No test results found</p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Patient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Test
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Category
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
                  {filteredResults.map((result) => (
                    <tr key={result.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-gray-300">
                        {new Date(result.test_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-white">
                            {result.patients?.name || result.patient_name}
                          </div>
                          <div className="text-sm text-gray-400">
                            {result.patients?.patient_id}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-white">{result.lab_tests.name}</div>
                          <div className="text-sm text-gray-400">{result.lab_tests.code}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-sm">
                          {result.lab_tests.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">₹{result.final_price}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-sm ${getStatusColor(result.status)}`}>
                          {result.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {(result.status === 'completed' || result.status === 'verified') && (
                            <Button
                              onClick={() => setViewingResult(result)}
                              variant="ghost"
                              size="sm"
                              className="text-green-400 hover:text-green-300 hover:bg-green-600/20"
                            >
                              <FileText size={16} />
                            </Button>
                          )}
                          {(result.status === 'collected' || result.status === 'processing') && (
                            <Button
                              onClick={() => setSelectedResult(result)}
                              variant="ghost"
                              size="sm"
                              className="text-blue-400 hover:text-blue-300 hover:bg-blue-600/20"
                            >
                              <Edit size={16} />
                            </Button>
                          )}
                          <Button
                            onClick={() => setViewingResult(result)}
                            variant="ghost"
                            size="sm"
                            className="text-purple-400 hover:text-purple-300 hover:bg-purple-600/20"
                          >
                            <Eye size={16} />
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
        <CreateTestOrderModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={fetchResults}
        />
      )}

      {selectedResult && (
        <TestResultEntryModal
          isOpen={!!selectedResult}
          resultId={selectedResult.id}
          onClose={() => setSelectedResult(null)}
          onSuccess={fetchResults}
        />
      )}

      {viewingResult && (
        <ViewTestResultModal
          isOpen={!!viewingResult}
          resultId={viewingResult.id}
          onClose={() => setViewingResult(null)}
        />
        )}
      </div>
    </DashboardLayout>
  )
}
