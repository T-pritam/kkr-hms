'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ChargeItemFormModal, type ChargeItem } from '@/components/charges/charge-item-form-modal'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { useUser } from '@/hooks/use-user'
import {
  CHARGE_BILLING_MODE_LABELS,
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
} from '@/lib/billing/constants'

/**
 * The price list.
 *
 * Modelled on app/lab/tests/page.tsx, which is the same kind of screen: master
 * data that only an admin may change but everyone needs to see. Writes are hidden
 * rather than merely rejected for non-admins — offering a button that always
 * 403s is worse than not offering it.
 */

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ChargeCataloguePage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'ADMIN'

  const [items, setItems] = useState<ChargeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ChargeItem | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '100' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoryFilter) params.set('category', categoryFilter)
      if (modeFilter) params.set('billing_mode', modeFilter)

      const res = await fetch(`/api/charge-items?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load the catalogue')
      setItems(json.chargeItems || [])
    } catch (err: any) {
      setError(err.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter, modeFilter])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  useRealtimeRefetch(['charge_items'], fetchItems)

  const openEditor = (item: ChargeItem | null) => {
    setEditing(item)
    setEditorOpen(true)
  }

  const remove = async (item: ChargeItem) => {
    if (!confirm(`Remove "${item.name}" from the catalogue?`)) return
    setNotice('')
    setError('')

    try {
      const res = await fetch(`/api/charge-items/${item.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to remove the charge')

      // One that has been billed is retired rather than deleted; say which happened.
      setNotice(json.message)
      await fetchItems()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const filtered = debouncedSearch || categoryFilter || modeFilter

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Charge Catalogue</h1>
            <p className="text-muted">
              What can be billed, and what it costs by default. Per-day and per-hour charges
              expand into one line per day when placed on a patient.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => openEditor(null)} className="w-full sm:w-auto">
              <Plus className="mr-2" size={18} />
              New Charge
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-md bg-info-subtle border border-info/30 text-info-text text-sm">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by name or code"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {CHARGE_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {CHARGE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
            <option value="">All billing modes</option>
            <option value="one_time">One-time only</option>
            <option value="per_day">Per day only</option>
            <option value="per_hour">Per hour only</option>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading catalogue…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {filtered ? 'No charges match those filters' : 'No charges in the catalogue yet'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    {['Charge', 'Category', 'Billing', 'Default price', 'Status'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted uppercase"
                      >
                        {h}
                      </th>
                    ))}
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3">
                        <div className="text-foreground">{item.name}</div>
                        {item.code && <div className="text-xs text-muted">{item.code}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info">
                          {CHARGE_CATEGORY_LABELS[
                            item.category as keyof typeof CHARGE_CATEGORY_LABELS
                          ] ?? item.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            item.billing_mode === 'per_day'
                              ? 'warning'
                              : item.billing_mode === 'per_hour'
                                ? 'accent'
                                : 'outline'
                          }
                        >
                          {CHARGE_BILLING_MODE_LABELS[
                            item.billing_mode as keyof typeof CHARGE_BILLING_MODE_LABELS
                          ] ?? item.billing_mode}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {money(item.default_price)}
                        {item.unit_label && (
                          <span className="text-xs text-muted"> {item.unit_label}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={item.is_active ? 'success' : 'outline'}>
                          {item.is_active ? 'Available' : 'Retired'}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openEditor(item)}
                              aria-label={`Edit ${item.name}`}
                              className="p-2 text-muted hover:text-foreground"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => remove(item)}
                              aria-label={`Remove ${item.name}`}
                              className="p-2 text-muted hover:text-destructive"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {items.map(item => (
                <div key={item.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{item.name}</div>
                      <div className="text-xs text-muted">
                        {CHARGE_CATEGORY_LABELS[
                          item.category as keyof typeof CHARGE_CATEGORY_LABELS
                        ] ?? item.category}
                      </div>
                    </div>
                    <Badge variant={item.is_active ? 'success' : 'outline'}>
                      {item.is_active ? 'Available' : 'Retired'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">
                      {CHARGE_BILLING_MODE_LABELS[
                        item.billing_mode as keyof typeof CHARGE_BILLING_MODE_LABELS
                      ] ?? item.billing_mode}
                    </span>
                    <span className="text-foreground">
                      {money(item.default_price)}
                      {item.unit_label && (
                        <span className="text-xs text-muted"> {item.unit_label}</span>
                      )}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEditor(item)}
                        aria-label={`Edit ${item.name}`}
                        className="p-2 text-muted hover:text-foreground"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => remove(item)}
                        aria-label={`Remove ${item.name}`}
                        className="p-2 text-muted hover:text-destructive"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ChargeItemFormModal
        isOpen={editorOpen}
        item={editing}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        onSuccess={fetchItems}
      />
    </DashboardLayout>
  )
}
