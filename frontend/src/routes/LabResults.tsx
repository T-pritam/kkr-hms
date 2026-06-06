import { apiFetch } from '@/lib/api'
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Edit, FileText } from 'lucide-react'
import { CreateTestOrderModal } from '@/components/lab/create-test-order-modal'
import { TestResultEntryModal } from '@/components/lab/test-result-entry-modal'
import { ViewTestResultModal } from '@/components/lab/view-test-result-modal'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'

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
  patient_name: string | null
  patient_phone: string | null
  patient_age: number | null
  patient_gender: string | null
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

  const markAsCollected = async (resultId: string) => {
    try {
      await apiFetch(`/api/test-results/${resultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'collected' }),
      })
      fetchResults()
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  useEffect(() => {
    fetchResults()
  }, [statusFilter])

  const fetchResults = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)

      const response = await apiFetch(`/api/test-results?${params.toString()}`)
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

  useRealtimeRefetch(['patient_test_results', 'test_result_values'], fetchResults)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-warning-subtle text-warning-text'
      case 'collected':
        return 'bg-info-subtle text-info'
      case 'processing':
        return 'bg-accent-subtle text-accent'
      case 'completed':
        return 'bg-success-subtle text-success-text'
      case 'verified':
        return 'bg-success-subtle text-success-text'
      case 'cancelled':
        return 'bg-destructive-subtle text-destructive'
      default:
        return 'bg-surface-inset text-muted'
    }
  }

  const filteredResults = searchQuery
    ? results.filter(
        (r) =>
          r.lab_tests.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.patient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.patient_phone?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : results

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Patient Test Results
            </h1>
            <p className="text-muted">Manage test orders and results</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-info hover:bg-info-hover text-foreground w-full sm:w-auto"
          >
            <Plus className="mr-2" size={20} />
            New Test Order
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"
              size={20}
            />
            <Input
              type="text"
              placeholder="Search by patient name, ID, or test..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-surface border-border text-foreground"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface border border-border rounded-md px-4 py-2 min-h-[44px] text-foreground"
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
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-info"></div>
            <p className="mt-2 text-muted">Loading test results...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">No test results found</p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Patient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Test
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                      Category
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
                  {filteredResults.map((result) => (
                    <tr key={result.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3 text-foreground">
                        {new Date(result.test_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-foreground">{result.patient_name || '—'}</div>
                          <div className="text-sm text-muted">{result.patient_phone}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-foreground">{result.lab_tests.name}</div>
                          <div className="text-sm text-muted">{result.lab_tests.code}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-info-subtle text-info rounded text-sm">
                          {result.lab_tests.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">₹{result.final_price}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-sm ${getStatusColor(result.status)}`}>
                          {result.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {result.status === 'pending' && (
                            <Button
                              onClick={() => markAsCollected(result.id)}
                              size="sm"
                              variant="outline"
                              className="text-xs border-warning-text text-warning-text hover:bg-warning-subtle"
                            >
                              Collect Sample
                            </Button>
                          )}
                          {(result.status === 'collected' || result.status === 'processing') && (
                            <Button
                              onClick={() => setSelectedResult(result)}
                              size="sm"
                              variant="outline"
                              className="text-xs border-info text-info hover:bg-info-subtle"
                            >
                              <Edit size={14} className="mr-1" />
                              Enter Results
                            </Button>
                          )}
                          {(result.status === 'completed' || result.status === 'verified') && (
                            <Button
                              onClick={() => setViewingResult(result)}
                              size="sm"
                              variant="outline"
                              className="text-xs border-success-text text-success-text hover:bg-success-subtle"
                            >
                              <FileText size={14} className="mr-1" />
                              View Report
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border">
              {filteredResults.map((result) => (
                <div key={result.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-foreground font-semibold truncate">{result.patient_name || 'Walk-in'}</h3>
                      <p className="text-xs text-muted mt-0.5">{result.patient_phone}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(result.status)}`}>
                      {result.status}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Test:</span>
                      <span className="text-foreground font-medium">{result.lab_tests.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Category:</span>
                      <span className="px-2 py-0.5 bg-info-subtle text-info rounded text-xs">{result.lab_tests.category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Date:</span>
                      <span className="text-foreground">{new Date(result.test_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Price:</span>
                      <span className="text-foreground font-medium">₹{result.final_price}</span>
                    </div>
                  </div>
                  <div className="pt-1">
                    {result.status === 'pending' && (
                      <Button
                        onClick={() => markAsCollected(result.id)}
                        size="sm"
                        variant="outline"
                        className="w-full text-warning-text border-warning-text hover:bg-warning-subtle"
                      >
                        Collect Sample
                      </Button>
                    )}
                    {(result.status === 'collected' || result.status === 'processing') && (
                      <Button
                        onClick={() => setSelectedResult(result)}
                        size="sm"
                        variant="outline"
                        className="w-full text-info border-info hover:bg-info-subtle"
                      >
                        <Edit size={14} className="mr-1" />
                        Enter Results
                      </Button>
                    )}
                    {(result.status === 'completed' || result.status === 'verified') && (
                      <Button
                        onClick={() => setViewingResult(result)}
                        size="sm"
                        variant="outline"
                        className="w-full text-success-text border-success-text hover:bg-success-subtle"
                      >
                        <FileText size={14} className="mr-1" />
                        View Report
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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
