'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, Eye, Pencil, Plus, Printer, Search, Send, Trash2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ChargeSheetModal } from '@/components/charges/charge-sheet-modal'
import { ChargeSheetDownloadModal } from '@/components/charges/charge-sheet-download-modal'
import { ChargeSheetDetailsModal } from '@/components/charges/charge-sheet-details-modal'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { useUser } from '@/hooks/use-user'
import { printChargeSheetToPrinter } from '@/lib/pdf/charge-sheet-pdf'

/**
 * Temporary charge sheets.
 *
 * The list is deliberately plain: these are short-lived working documents, and
 * the two things anyone does with one are print it and forward it. Forwarding is
 * the only irreversible action on the page, so it is admin-only, confirmed, and
 * the row visibly changes state afterwards.
 */

interface ChargeSheet {
  id: string
  sheet_no: string
  subject_type: 'patient' | 'opd'
  patient: { id: string; patient_id: string; name: string; phone: string | null } | null
  opd_name: string | null
  opd_phone: string | null
  status: 'draft' | 'forwarded' | 'cancelled'
  total_amount: number
  created_at: string
}

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  draft: 'warning',
  forwarded: 'success',
  cancelled: 'outline',
}

export default function ChargeSheetsPage() {
  const { user } = useUser()
  const isAdmin = user?.role === 'ADMIN'

  const [sheets, setSheets] = useState<ChargeSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [downloadSheet, setDownloadSheet] = useState<any | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchSheets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '50' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/charge-sheets?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load charge sheets')
      setSheets(json.chargeSheets || [])
    } catch (err: any) {
      setError(err.message)
      setSheets([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter])

  useEffect(() => {
    void fetchSheets()
  }, [fetchSheets])

  useRealtimeRefetch(['charge_sheets', 'charge_sheet_items'], fetchSheets)

  const subjectOf = (sheet: ChargeSheet) =>
    sheet.subject_type === 'patient'
      ? sheet.patient?.name || 'Unknown patient'
      : sheet.opd_name || 'Walk-in'

  // The list carries no lines, so both actions fetch the detail first.
  const loadSheetDetail = async (sheet: ChargeSheet) => {
    const res = await fetch(`/api/charge-sheets/${sheet.id}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load the charge sheet')
    return json.chargeSheet
  }

  // Opens the picker rather than saving straight away: a sheet may carry
  // pharmacy bills, and those are appended by choice, not automatically.
  const download = async (sheet: ChargeSheet) => {
    setError('')
    setBusyId(sheet.id)
    try {
      setDownloadSheet(await loadSheetDetail(sheet))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const printToPrinter = async (sheet: ChargeSheet) => {
    setError('')
    setBusyId(sheet.id)
    try {
      printChargeSheetToPrinter(await loadSheetDetail(sheet))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const forward = async (sheet: ChargeSheet) => {
    if (
      !confirm(
        `Forward ${sheet.sheet_no} to ${subjectOf(sheet)}'s bill?\n\n` +
          `${money(sheet.total_amount)} will be added as real charges and become due. This cannot be undone from here.`,
      )
    )
      return

    setError('')
    setNotice('')
    setBusyId(sheet.id)

    try {
      const res = await fetch(`/api/charge-sheets/${sheet.id}/forward`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to forward the sheet')

      setNotice(json.message)
      await fetchSheets()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (sheet: ChargeSheet) => {
    if (!confirm(`Delete ${sheet.sheet_no}?`)) return

    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/charge-sheets/${sheet.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete the sheet')

      setNotice(json.message)
      await fetchSheets()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Charge Sheets</h1>
            <p className="text-muted">
              Estimates for registered patients and walk-ins. Nothing is billed and no due is
              created until a sheet is forwarded.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingId(null)
              setModalOpen(true)
            }}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2" size={18} />
            New Sheet
          </Button>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by sheet number or name"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All sheets</option>
            <option value="draft">Draft</option>
            <option value="forwarded">Forwarded</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading charge sheets…</p>
          </div>
        ) : sheets.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {debouncedSearch || statusFilter
                ? 'No sheets match those filters'
                : 'No charge sheets yet'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    {['Sheet', 'For', 'Type', 'Total', 'Status'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted uppercase"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sheets.map(sheet => (
                    <tr key={sheet.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3">
                        <div className="text-foreground">{sheet.sheet_no}</div>
                        <div className="text-xs text-muted">
                          {new Date(sheet.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{subjectOf(sheet)}</div>
                        {sheet.patient?.patient_id && (
                          <div className="text-xs text-muted">{sheet.patient.patient_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={sheet.subject_type === 'patient' ? 'info' : 'outline'}>
                          {sheet.subject_type === 'patient' ? 'Registered' : 'OPD'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">{money(sheet.total_amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[sheet.status] ?? 'outline'}>
                          {sheet.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setDetailsId(sheet.id)}
                            aria-label={`View ${sheet.sheet_no}`}
                            className="p-2 text-muted hover:text-foreground"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => download(sheet)}
                            disabled={busyId === sheet.id}
                            aria-label={`Download ${sheet.sheet_no} as PDF`}
                            className="p-2 text-muted hover:text-foreground disabled:opacity-50"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => printToPrinter(sheet)}
                            disabled={busyId === sheet.id}
                            aria-label={`Print ${sheet.sheet_no}`}
                            className="p-2 text-muted hover:text-foreground disabled:opacity-50"
                          >
                            <Printer size={16} />
                          </button>

                          {sheet.status === 'draft' && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingId(sheet.id)
                                  setModalOpen(true)
                                }}
                                aria-label={`Edit ${sheet.sheet_no}`}
                                className="p-2 text-muted hover:text-foreground"
                              >
                                <Pencil size={16} />
                              </button>

                              {/* Only a registered patient has a bill to forward into. */}
                              {isAdmin && sheet.subject_type === 'patient' && (
                                <button
                                  onClick={() => forward(sheet)}
                                  disabled={busyId === sheet.id}
                                  aria-label={`Forward ${sheet.sheet_no} to billing`}
                                  className="p-2 text-info hover:text-info-hover disabled:opacity-50"
                                  title="Forward to patient billing"
                                >
                                  <Send size={16} />
                                </button>
                              )}

                              <button
                                onClick={() => remove(sheet)}
                                aria-label={`Delete ${sheet.sheet_no}`}
                                className="p-2 text-muted hover:text-destructive"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-border">
              {sheets.map(sheet => (
                <div key={sheet.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{sheet.sheet_no}</div>
                      <div className="text-xs text-muted truncate">{subjectOf(sheet)}</div>
                    </div>
                    <Badge variant={STATUS_VARIANT[sheet.status] ?? 'outline'}>
                      {sheet.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">
                      {sheet.subject_type === 'patient' ? 'Registered' : 'OPD'}
                    </span>
                    <span className="text-foreground">{money(sheet.total_amount)}</span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setDetailsId(sheet.id)}
                      aria-label={`View ${sheet.sheet_no}`}
                      className="p-2 text-muted hover:text-foreground"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => download(sheet)}
                      disabled={busyId === sheet.id}
                      aria-label={`Download ${sheet.sheet_no} as PDF`}
                      className="p-2 text-muted hover:text-foreground disabled:opacity-50"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => printToPrinter(sheet)}
                      disabled={busyId === sheet.id}
                      aria-label={`Print ${sheet.sheet_no}`}
                      className="p-2 text-muted hover:text-foreground disabled:opacity-50"
                    >
                      <Printer size={16} />
                    </button>
                    {sheet.status === 'draft' && (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(sheet.id)
                            setModalOpen(true)
                          }}
                          aria-label={`Edit ${sheet.sheet_no}`}
                          className="p-2 text-muted hover:text-foreground"
                        >
                          <Pencil size={16} />
                        </button>
                        {isAdmin && sheet.subject_type === 'patient' && (
                          <button
                            onClick={() => forward(sheet)}
                            disabled={busyId === sheet.id}
                            aria-label={`Forward ${sheet.sheet_no} to billing`}
                            className="p-2 text-info disabled:opacity-50"
                          >
                            <Send size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => remove(sheet)}
                          aria-label={`Delete ${sheet.sheet_no}`}
                          className="p-2 text-muted hover:text-destructive"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ChargeSheetModal
        isOpen={modalOpen}
        sheetId={editingId}
        onClose={() => {
          setModalOpen(false)
          setEditingId(null)
        }}
        onSuccess={fetchSheets}
      />

      <ChargeSheetDownloadModal
        isOpen={Boolean(downloadSheet)}
        onClose={() => setDownloadSheet(null)}
        sheet={downloadSheet}
      />

      {detailsId && (
        <ChargeSheetDetailsModal
          isOpen={Boolean(detailsId)}
          onClose={() => setDetailsId(null)}
          sheetId={detailsId}
          // Already fetched by the details view, so the picker needs no round trip.
          onDownload={sheet => setDownloadSheet(sheet)}
        />
      )}
    </DashboardLayout>
  )
}
