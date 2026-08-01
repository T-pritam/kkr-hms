'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { TestEditorModal } from '@/components/lab/test-editor-modal'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { TEST_CATEGORIES } from '@/lib/lab/constants'
import { Plus, Search, Pencil, Trash2, AlertCircle } from 'lucide-react'

interface LabTest {
  id: string
  name: string
  code: string
  category: string | null
  sample_type: string | null
  method: string | null
  price: number
  is_active: boolean
}

const money = (n: number) =>
  `Rs.${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function LabTestsPage() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchTests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '100' })
      if (debouncedSearch) params.set('name', debouncedSearch)
      if (categoryFilter) params.set('category', categoryFilter)

      const res = await fetch(`/api/lab-tests?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the catalogue')
      setTests(json.data.data || [])
    } catch (err: any) {
      setError(err.message)
      setTests([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter])

  useEffect(() => { void fetchTests() }, [fetchTests])
  useRealtimeRefetch(['lab_tests', 'test_parameters', 'test_parameter_ranges'], fetchTests)

  const remove = async (test: LabTest) => {
    if (!confirm(`Remove "${test.name}" from the catalogue?`)) return
    setNotice('')
    setError('')
    try {
      const res = await fetch(`/api/lab-tests/${test.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to remove the test')
      // A test that has been ordered is retired rather than deleted; say so.
      setNotice(json.message || '')
      await fetchTests()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const openEditor = (id: string | null) => { setEditingId(id); setEditorOpen(true) }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Test Catalogue</h1>
            <p className="text-muted">Tests, their parameters and the reference intervals they report against.</p>
          </div>
          <Button onClick={() => openEditor(null)} className="bg-primary hover:bg-primary-hover w-full sm:w-auto">
            <Plus className="mr-2" size={18} />New Test
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-md bg-info-subtle border border-info/30 text-info-text text-sm">{notice}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by test name"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* This filter existed in state but was never rendered. */}
          <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All departments</option>
            {TEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading catalogue…</p>
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {debouncedSearch || categoryFilter ? 'No tests match those filters' : 'No tests in the catalogue yet'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    {['Test', 'Department', 'Specimen', 'Price', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tests.map(test => (
                    <tr key={test.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3">
                        <div className="text-foreground">{test.name}</div>
                        <div className="text-xs text-muted">
                          {test.code}{test.method ? ` · ${test.method}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {test.category ? <Badge variant="info">{test.category}</Badge> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">{test.sample_type || '—'}</td>
                      <td className="px-4 py-3 text-foreground">{money(test.price)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={test.is_active ? 'success' : 'outline'}>
                          {test.is_active ? 'Available' : 'Retired'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEditor(test.id)} aria-label={`Edit ${test.name}`}
                            className="p-2 text-muted hover:text-foreground">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => remove(test)} aria-label={`Remove ${test.name}`}
                            className="p-2 text-muted hover:text-destructive">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {tests.map(test => (
                <div key={test.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{test.name}</div>
                      <div className="text-xs text-muted">{test.code}</div>
                    </div>
                    <Badge variant={test.is_active ? 'success' : 'outline'}>
                      {test.is_active ? 'Available' : 'Retired'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">
                      {test.category || '—'}{test.sample_type ? ` · ${test.sample_type}` : ''}
                    </span>
                    <span className="text-foreground">{money(test.price)}</span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEditor(test.id)} aria-label={`Edit ${test.name}`}
                      className="p-2 text-muted hover:text-foreground">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => remove(test)} aria-label={`Remove ${test.name}`}
                      className="p-2 text-muted hover:text-destructive">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TestEditorModal
        isOpen={editorOpen}
        testId={editingId}
        onClose={() => { setEditorOpen(false); setEditingId(null) }}
        onSaved={fetchTests}
      />
    </DashboardLayout>
  )
}
