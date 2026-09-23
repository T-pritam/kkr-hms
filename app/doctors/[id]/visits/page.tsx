'use client'

/**
 * One doctor's visits, and what was paid for them.
 *
 * Built on the shape of the advance log (`app/employees/advances/page.tsx`):
 * filters, KPI cards, a subtotal panel, a detail table, and the same two export
 * buttons — so the two reports read and behave alike.
 *
 * The date range is empty by default rather than "this month". These records are
 * sparse — a doctor may do three visits in a quarter — and a month default would
 * open on an empty screen for nearly everyone.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { inr } from '@/lib/format/currency'
import { toCsv, downloadCsv, csvFilename } from '@/lib/export/csv'
import { amountCell } from '@/lib/format/currency'
import { generateDoctorVisitsPDF } from '@/lib/pdf/doctor-visits-pdf'
import { formatIST } from '@/lib/consultations/ist'
import { istMonth } from '@/lib/dates/ist'
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw, Stethoscope } from 'lucide-react'

interface VisitRow {
  id: string
  consultation_date: string
  notes: string | null
  patient: { id: string; patient_id: string; name: string } | null
  purpose: { id: string; name: string } | null
  fee: number | null
  billed: boolean
  paid: boolean
  payment: {
    settled_on: string | null
    settled_by: string | null
    payment_method: string | null
    transaction_reference: string | null
  } | null
}

interface PurposeRow {
  purpose: string
  visits: number
  paid: number
  unpaid: number
}

interface Summary {
  visits: number
  fees_paid: number
  fees_pending: number
  unbilled_visits: number
  from: string | null
  to: string | null
}

export default function DoctorVisitsPage() {
  const params = useParams()
  const doctorId = params.id as string

  const [doctor, setDoctor] = useState<any>(null)
  const [rows, setRows] = useState<VisitRow[]>([])
  const [byPurpose, setByPurpose] = useState<PurposeRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [settled, setSettled] = useState('')

  const fetchVisits = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (settled) params.set('settled', settled)

      const response = await fetch(`/api/doctors/${doctorId}/visits?${params}`, {
        credentials: 'include',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Failed to load the visits')

      setDoctor(body.doctor)
      setRows(body.data || [])
      setByPurpose(body.by_purpose || [])
      setSummary(body.summary || null)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [doctorId, from, to, settled])

  useEffect(() => {
    void fetchVisits()
  }, [fetchVisits])

  useRealtimeRefetch(['patient_consultations', 'doctor_visit_settlements'], fetchVisits)

  /** Printed under the PDF's title, so the page explains what it is showing. */
  const activeFilters = useMemo(() => {
    const filters: string[] = []
    if (settled === 'true') filters.push('Paid only')
    if (settled === 'false') filters.push('Unpaid only')
    return filters
  }, [settled])

  const thisMonth = () => {
    const month = istMonth()
    const [year, m] = month.split('-').map(Number)
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
    setFrom(`${month}-01`)
    setTo(`${month}-${String(last).padStart(2, '0')}`)
  }

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { header: 'Date', value: r => formatIST(r.consultation_date) },
      { header: 'Patient ID', value: r => r.patient?.patient_id ?? '' },
      { header: 'Patient', value: r => r.patient?.name ?? '' },
      { header: 'Purpose', value: r => r.purpose?.name ?? '' },
      { header: 'Fee', value: r => (r.billed && r.fee !== null ? amountCell(r.fee) : '') },
      { header: 'Status', value: r => (!r.billed ? 'Not billed' : r.paid ? 'Paid' : 'Unpaid') },
      { header: 'Paid on', value: r => r.payment?.settled_on?.slice(0, 10) ?? '' },
      { header: 'Paid by', value: r => r.payment?.settled_by ?? '' },
      { header: 'Mode', value: r => r.payment?.payment_method ?? '' },
      { header: 'Reference', value: r => r.payment?.transaction_reference ?? '' },
      { header: 'Notes', value: r => r.notes ?? '' },
    ], {
      footer: summary
        ? [['TOTAL PAID', '', '', '', amountCell(summary.fees_paid), '', '', '', '', '', '']]
        : undefined,
    })

    downloadCsv(csv, csvFilename('Doctor_Visits', doctor?.name ?? 'doctor', from || 'all', to || ''))
  }

  const exportPdf = () => {
    if (!summary || !doctor) return
    generateDoctorVisitsPDF({
      doctor,
      rows: rows as any,
      by_purpose: byPurpose,
      summary,
      filters: activeFilters,
    })
  }

  const cards = summary
    ? [
        { label: 'Visits', value: String(summary.visits), hint: 'in this period' },
        { label: 'Fees paid', value: inr(summary.fees_paid), hint: 'already handed over' },
        { label: 'Still to pay', value: inr(summary.fees_pending), hint: 'priced, not yet paid' },
        { label: 'Not billed', value: String(summary.unbilled_visits), hint: 'no fee row yet' },
      ]
    : []

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link
              href="/doctors"
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Back to doctors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Stethoscope className="h-6 w-6" />
                {doctor?.name || 'Doctor'}
              </h1>
              <p className="text-sm text-muted">
                {[doctor?.specialist, doctor?.department].filter(Boolean).join(' · ') ||
                  'Visits, and what has been paid for them'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="flex-1 sm:flex-none">
              <FileSpreadsheet size={18} className="mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={!summary} className="flex-1 sm:flex-none">
              <Download size={18} className="mr-2" />
              PDF
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-subtle p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(card => (
            <div key={card.label} className="bg-surface rounded-lg border border-border p-4">
              <p className="text-xs text-muted">{card.label}</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{card.value}</p>
              <p className="text-xs text-muted mt-1">{card.hint}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-surface rounded-lg border border-border p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted">From</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted">To</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted">Payment</label>
            <select
              className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm"
              value={settled}
              onChange={e => setSettled(e.target.value)}
            >
              <option value="">All visits</option>
              <option value="true">Paid</option>
              <option value="false">Not paid</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={thisMonth} className="flex-1">
              This month
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFrom('')
                setTo('')
                setSettled('')
              }}
              className="flex-1"
            >
              All
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="animate-spin h-8 w-8 text-primary" />
          </div>
        ) : (
          <>
            {/* By visit type */}
            {byPurpose.length > 0 && (
              <div className="bg-surface rounded-lg border border-border">
                <div className="p-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">By visit type</h2>
                  <p className="text-xs text-muted mt-0.5">What was done, and what is still owed on it.</p>
                </div>
                <div className="divide-y divide-border">
                  {byPurpose.map(row => (
                    <div key={row.purpose} className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-foreground truncate">{row.purpose}</p>
                        <p className="text-xs text-muted">
                          {row.visits} visit{row.visits === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-sm">
                        <span className="text-success-text">{inr(row.paid)} paid</span>
                        {row.unpaid > 0 && (
                          <Badge variant="warning">{inr(row.unpaid)} to pay</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Every visit */}
            <div className="bg-surface rounded-lg border border-border">
              <div className="p-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Every visit</h2>
              </div>

              {rows.length === 0 ? (
                <p className="p-8 text-center text-muted">
                  {from || to || settled
                    ? 'No visits match these filters.'
                    : 'No visits recorded for this doctor yet.'}
                </p>
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-inset text-muted">
                        <tr>
                          <th className="p-3 text-left font-medium">Date</th>
                          <th className="p-3 text-left font-medium">Patient</th>
                          <th className="p-3 text-left font-medium">Purpose</th>
                          <th className="p-3 text-right font-medium">Fee</th>
                          <th className="p-3 text-left font-medium">Paid on</th>
                          <th className="p-3 text-left font-medium">Paid by</th>
                          <th className="p-3 text-left font-medium">Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map(row => (
                          <tr key={row.id} className="hover:bg-surface-hover">
                            <td className="p-3 whitespace-nowrap">{formatIST(row.consultation_date)}</td>
                            <td className="p-3">
                              {row.patient ? (
                                <Link href={`/patients/${row.patient.id}`} className="text-primary hover:underline">
                                  {row.patient.patient_id} {row.patient.name}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3">{row.purpose?.name || '—'}</td>
                            <td className="p-3 text-right">
                              {!row.billed ? (
                                <span className="text-xs text-muted">not billed</span>
                              ) : (
                                inr(row.fee ?? 0)
                              )}
                            </td>
                            <td className="p-3">
                              {row.paid ? (
                                row.payment?.settled_on?.slice(0, 10) ?? '—'
                              ) : (
                                <Badge variant="warning">unpaid</Badge>
                              )}
                            </td>
                            <td className="p-3">{row.payment?.settled_by || '—'}</td>
                            <td className="p-3 capitalize">
                              {row.payment?.payment_method?.replace('_', ' ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden divide-y divide-border">
                    {rows.map(row => (
                      <div key={row.id} className="p-4 space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-foreground truncate">
                              {row.patient ? `${row.patient.patient_id} ${row.patient.name}` : '—'}
                            </p>
                            <p className="text-xs text-muted">
                              {formatIST(row.consultation_date)} · {row.purpose?.name || 'No purpose'}
                            </p>
                          </div>
                          <span className="font-semibold text-foreground shrink-0">
                            {row.billed ? inr(row.fee ?? 0) : '—'}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          {!row.billed
                            ? 'Not billed yet'
                            : row.paid
                              ? `Paid ${row.payment?.settled_on?.slice(0, 10) ?? ''} by ${row.payment?.settled_by ?? '—'}`
                              : 'Priced, not yet paid'}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
