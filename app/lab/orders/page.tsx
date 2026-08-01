'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { TablePagination } from '@/components/ui/table-pagination'
import { CreateLabOrderModal } from '@/components/lab/create-lab-order-modal'
import { ResultEntryModal } from '@/components/lab/result-entry-modal'
import { ReportPreviewModal } from '@/components/lab/report-preview-modal'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import {
  ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus,
} from '@/lib/lab/status'
import { Plus, Search, FlaskConical, TestTube, FileText, AlertTriangle } from 'lucide-react'

interface OrderItem {
  id: string
  test_name: string
  test_code: string
  category: string | null
  status: string
  price: number
}

interface Order {
  id: string
  order_no: string
  patient_id: string | null
  patient_name: string
  patient_phone: string | null
  patient_display_id: string | null
  patient_status: string | null
  patient_age: number | null
  patient_gender: string | null
  priority: string
  status: OrderStatus
  registered_at: string
  collected_at: string | null
  received_at: string | null
  net_amount: number
  lab_order_items: OrderItem[]
}

const STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  registered:  'outline',
  collected:   'warning',
  received:    'info',
  in_progress: 'accent',
  reported:    'success',
  cancelled:   'destructive',
}

const money = (n: number) =>
  `Rs.${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—'

export default function LabOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [showCreate, setShowCreate] = useState(false)
  const [entryOrderId, setEntryOrderId] = useState<string | null>(null)
  const [reportOrderId, setReportOrderId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (statusFilter) params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await fetch(`/api/lab/orders?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load orders')

      setOrders(json.data.data || [])
      setTotal(json.data.pagination.total)
      setTotalPages(json.data.pagination.totalPages || 1)
    } catch (err: any) {
      setError(err.message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, debouncedSearch])

  useEffect(() => { void fetchOrders() }, [fetchOrders])
  useRealtimeRefetch(['lab_orders', 'lab_order_items', 'lab_result_values'], fetchOrders)

  const advance = async (order: Order, step: 'collect' | 'receive') => {
    setBusy(order.id)
    setError('')
    try {
      const res = await fetch(`/api/lab/orders/${order.id}/${step}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `Failed to record ${step}`)
      await fetchOrders()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const hasResults = (order: Order) =>
    order.lab_order_items?.some(i => i.status === 'results_entered' || i.status === 'authorised')

  const actionsFor = (order: Order) => {
    const disabled = busy === order.id
    switch (order.status) {
      case 'registered':
        return (
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => advance(order, 'collect')}>
            <TestTube size={14} className="mr-1.5" />Collect Sample
          </Button>
        )
      case 'collected':
        return (
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => advance(order, 'receive')}>
            Receive in Lab
          </Button>
        )
      case 'received':
      case 'in_progress':
      case 'reported':
        return (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEntryOrderId(order.id)}>
              <FlaskConical size={14} className="mr-1.5" />
              {hasResults(order) ? 'Edit Results' : 'Enter Results'}
            </Button>
            {hasResults(order) && (
              <Button size="sm" className="bg-primary hover:bg-primary-hover" onClick={() => setReportOrderId(order.id)}>
                <FileText size={14} className="mr-1.5" />Report
              </Button>
            )}
          </div>
        )
      default:
        return <span className="text-xs text-muted">—</span>
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Lab Orders</h1>
            <p className="text-muted">
              Register orders, track samples from collection to report, and enter results.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary-hover w-full sm:w-auto">
            <Plus className="mr-2" size={18} />New Lab Order
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by order number, patient name, ID or phone"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map(s => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {debouncedSearch || statusFilter ? 'No orders match those filters' : 'No lab orders yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      {['Order', 'Patient', 'Tests', 'Registered', 'Status', 'Amount'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.map(order => (
                      <tr key={order.id} className="hover:bg-table-row-hover">
                        <td className="px-4 py-3">
                          <div className="text-foreground font-medium">{order.order_no}</div>
                          {order.priority === 'urgent' && <Badge variant="warning" className="mt-1">Urgent</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{order.patient_name}</div>
                          <div className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                            {order.patient_display_id ? (
                              <>
                                <span>ID: {order.patient_display_id}</span>
                                {order.patient_status && (
                                  <Badge variant={order.patient_status.toLowerCase() === 'active' ? 'success' : 'outline'}>
                                    {order.patient_status}
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline">Walk-in</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{order.lab_order_items?.length ?? 0}</div>
                          <div className="text-xs text-muted truncate max-w-[220px]">
                            {order.lab_order_items?.map(i => i.test_code).join(', ')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">{dateTime(order.registered_at)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>
                            {ORDER_STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-foreground">{money(order.net_amount)}</td>
                        <td className="px-4 py-3 text-right">{actionsFor(order)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-border">
                {orders.map(order => (
                  <div key={order.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">{order.patient_name}</div>
                        <div className="text-xs text-muted">{order.order_no}</div>
                      </div>
                      <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted">Tests</div>
                        <div className="text-foreground">{order.lab_order_items?.length ?? 0}</div>
                      </div>
                      <div>
                        <div className="text-muted">Amount</div>
                        <div className="text-foreground">{money(order.net_amount)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-muted">Registered</div>
                        <div className="text-foreground">{dateTime(order.registered_at)}</div>
                      </div>
                    </div>
                    <div className="flex justify-end">{actionsFor(order)}</div>
                  </div>
                ))}
              </div>
            </div>

            <TablePagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={setPage}
              onPageSizeChange={size => { setPageSize(size); setPage(1) }}
            />
          </>
        )}
      </div>

      <CreateLabOrderModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={fetchOrders}
      />

      {entryOrderId && (
        <ResultEntryModal
          isOpen
          orderId={entryOrderId}
          onClose={() => setEntryOrderId(null)}
          onSaved={fetchOrders}
        />
      )}

      {reportOrderId && (
        <ReportPreviewModal
          isOpen
          orderId={reportOrderId}
          onClose={() => setReportOrderId(null)}
          onChanged={fetchOrders}
        />
      )}
    </DashboardLayout>
  )
}
