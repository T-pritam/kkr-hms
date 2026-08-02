'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ReportPreviewModal } from '@/components/lab/report-preview-modal'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/lab/status'
import { FileText, FlaskConical, AlertCircle } from 'lucide-react'

interface Item {
  id: string
  test_name: string
  test_code: string
  category: string | null
  status: string
  price: number
  interpretation: string | null
}

interface Order {
  id: string
  order_no: string
  status: OrderStatus
  priority: string
  registered_at: string
  reported_at: string | null
  net_amount: number
  updated_at: string | null
  updated_by_user: { username: string } | null
  lab_order_items: Item[]
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  registered: 'outline', collected: 'warning', received: 'info',
  in_progress: 'accent', reported: 'success', cancelled: 'destructive',
}

const money = (n: number) =>
  `Rs.${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—'

/**
 * A patient's lab history, newest first.
 *
 * Only possible now that orders carry a real `patient_id`. Previously the lab
 * copied demographics as text and discarded the link, so this view could not
 * exist.
 */
export default function LabHistoryTab({ patientId }: { patientId: string }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportOrderId, setReportOrderId] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/lab-orders?pageSize=50`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load lab history')
      setOrders(json.data.data || [])
    } catch (err: any) {
      setError(err.message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void fetchOrders() }, [fetchOrders])
  useRealtimeRefetch(['lab_orders', 'lab_order_items'], fetchOrders)

  const hasResults = (order: Order) =>
    order.lab_order_items?.some(i => i.status === 'results_entered' || i.status === 'authorised')

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="mt-2 text-muted">Loading lab history…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-border">
          <FlaskConical className="mx-auto mb-2 text-muted" size={28} />
          <p className="text-muted">No lab orders for this patient yet</p>
        </div>
      ) : (
        orders.map(order => (
          <div key={order.id} className="bg-surface rounded-lg border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">{order.order_no}</span>
                  <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  {order.priority === 'urgent' && <Badge variant="warning">Urgent</Badge>}
                </div>
                <div className="text-xs text-muted mt-1">
                  Registered {dateTime(order.registered_at)}
                  {order.reported_at && ` · Reported ${dateTime(order.reported_at)}`}
                </div>
                <UpdatedStamp by={order.updated_by_user?.username} at={order.updated_at} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{money(order.net_amount)}</span>
                {hasResults(order) && (
                  <Button size="sm" variant="outline" onClick={() => setReportOrderId(order.id)}>
                    <FileText size={14} className="mr-1.5" />Report
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {order.lab_order_items?.map(item => (
                <Badge
                  key={item.id}
                  variant={item.status === 'pending' ? 'outline' : 'info'}
                  title={item.interpretation || undefined}
                >
                  {item.test_name}
                </Badge>
              ))}
            </div>
          </div>
        ))
      )}

      {reportOrderId && (
        <ReportPreviewModal
          isOpen
          orderId={reportOrderId}
          onClose={() => setReportOrderId(null)}
          onChanged={fetchOrders}
        />
      )}
    </div>
  )
}
