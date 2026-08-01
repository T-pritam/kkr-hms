'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BRANDING } from '@/lib/pdf/branding'
import { generateLabReportPDF, type LabReportData, type LabReportItem } from '@/lib/pdf/lab-report-pdf'
import { hasCapability } from '@/lib/lab/authz'
import { Download, Printer, ShieldCheck, AlertCircle } from 'lucide-react'

interface ReportPreviewModalProps {
  isOpen: boolean
  orderId: string
  onClose: () => void
  onChanged?: () => void
}

/**
 * Scoped so printing produces the report alone. The old modal called
 * `window.print()` with no print stylesheet, so the sidebar and page chrome
 * came out with it.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #lab-report-print, #lab-report-print * { visibility: visible !important; }
  #lab-report-print {
    position: absolute; left: 0; top: 0; width: 100%;
    background: #fff; color: #000; padding: 0; margin: 0;
  }
  .lab-report-noprint { display: none !important; }
  @page { size: A4 portrait; margin: 14mm; }
}
`

const dateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function ReportPreviewModal({ isOpen, orderId, onClose, onChanged }: ReportPreviewModalProps) {
  const [data, setData] = useState<LabReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/lab/orders/${orderId}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the report')
      setData(json.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (!isOpen) return
    void load()
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(u => setRole(u?.role || ''))
      .catch(() => setRole(''))
  }, [isOpen, load])

  const items = (data?.items || []).filter(i => i.status !== 'cancelled')
  const withResults = items.filter(i => i.values.length > 0)
  const canAuthorise = hasCapability(role, 'authorise')
  const pending = withResults.filter(i => i.status !== 'authorised')

  const authoriseAll = async () => {
    setBusy(true)
    setError('')
    try {
      for (const item of pending) {
        const res = await fetch(`/api/lab/order-items/${item.id}/authorise`, { method: 'POST' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to authorise')
      }
      await load()
      onChanged?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Laboratory Report" size="full">
      <style>{PRINT_CSS}</style>

      {loading ? (
        <div className="py-12 text-center text-muted">Loading report…</div>
      ) : !data ? (
        <div className="py-12 text-center text-muted">{error || 'Report not found'}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="lab-report-noprint flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="lab-report-noprint flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {pending.length === 0 && withResults.length > 0 ? (
                <Badge variant="success"><ShieldCheck size={12} />Authorised</Badge>
              ) : (
                <Badge variant="outline">Not authorised</Badge>
              )}
              <span className="text-xs text-muted">
                Authorisation is optional — the report can be issued either way.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canAuthorise && pending.length > 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={authoriseAll}>
                  <ShieldCheck size={14} className="mr-1.5" />
                  {busy ? 'Authorising…' : `Authorise (${pending.length})`}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer size={14} className="mr-1.5" />Print
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary-hover"
                onClick={() => generateLabReportPDF(data)}
              >
                <Download size={14} className="mr-1.5" />Download PDF
              </Button>
            </div>
          </div>

          {/* ── The report itself ─────────────────────────────────────────── */}
          <div id="lab-report-print" className="bg-white text-black rounded-lg p-6 sm:p-10">
            <header className="text-center pb-3 border-b-2 border-slate-800">
              <h1 className="text-xl font-bold text-slate-900">{BRANDING.name}</h1>
              <p className="text-[11px] text-slate-500 mt-1">{BRANDING.address}</p>
              <p className="text-[11px] text-slate-500">
                Ph: {BRANDING.phone}{BRANDING.email ? `   |   ${BRANDING.email}` : ''}
              </p>
            </header>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-1 py-4 border-b border-slate-300 text-[12px]">
              <Row label="Name" value={data.patient_name || '—'} />
              <Row label="Order No" value={data.order_no} />
              <Row
                label="Age / Sex"
                value={`${data.patient_age !== null && data.patient_age !== undefined ? `${data.patient_age} Y` : '—'} / ${data.patient_gender || '—'}`}
              />
              <Row label="Registered" value={dateTime(data.registered_at)} />
              <Row label="Patient ID" value={data.patient_display_id || 'Walk-in'} />
              <Row label="Collected" value={dateTime(data.collected_at)} />
              <Row label="Referred By" value={data.referring_doctor_name || 'Self'} />
              <Row label="Received" value={dateTime(data.received_at)} />
              <Row label="" value="" />
              <Row label="Reported" value={dateTime(data.reported_at)} />
            </section>

            {withResults.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-slate-500">
                No results have been entered for this order yet.
              </p>
            ) : (
              withResults.map(item => <TestSection key={item.id} item={item} />)
            )}

            <p className="text-center text-[11px] text-slate-500 mt-8">- -&nbsp;&nbsp;End of Report&nbsp;&nbsp;- -</p>

            <div className="flex justify-between items-end mt-8 text-[11px] text-slate-500">
              <div>
                {[...new Set(withResults.map(i => i.entered_by_name).filter(Boolean))].length > 0 && (
                  <div>Entered by: {[...new Set(withResults.map(i => i.entered_by_name).filter(Boolean))].join(', ')}</div>
                )}
                {[...new Set(withResults.map(i => i.authorised_by_name).filter(Boolean))].length > 0 && (
                  <div>Authorised by: {[...new Set(withResults.map(i => i.authorised_by_name).filter(Boolean))].join(', ')}</div>
                )}
              </div>
              <div className="text-right">
                <div className="w-48 border-t border-slate-400 pt-1 mt-8">Authorised Signatory</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  if (!label) return <div className="hidden sm:block" />
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-slate-500">:</span>
      <span className="font-medium text-slate-900 min-w-0 break-words">{value}</span>
    </div>
  )
}

function TestSection({ item }: { item: LabReportItem }) {
  const byId = new Map(item.parameters.map(p => [p.id, p]))
  const rows = item.values.filter(v => byId.has(v.parameter_id))
  if (rows.length === 0) return null

  const anyAbnormal = rows.some(v => v.abnormal)
  const printable = withGroupHeadings(rows, byId)

  return (
    <section className="pt-6 break-inside-avoid">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-900">{item.test_name}</h2>
      {(item.specimen || item.method) && (
        <p className="text-[11px] text-slate-500 mt-0.5">
          {item.specimen && <>Specimen: {item.specimen}</>}
          {item.specimen && item.method && <span className="inline-block w-8" />}
          {item.method && <>Method: {item.method}</>}
        </p>
      )}

      {/* Borderless: one rule under the headings, one above the legend. */}
      <table className="w-full mt-3 text-[12px] border-collapse">
        <thead>
          <tr className="text-left text-slate-700 border-b border-slate-800">
            <th className="font-semibold pb-1 pr-2 w-[42%]">Investigation</th>
            <th className="font-semibold pb-1 pr-2 w-[20%]">Result</th>
            <th className="font-semibold pb-1 pr-2 w-[14%]">Unit</th>
            <th className="font-semibold pb-1 w-[24%]">Biological Ref. Interval</th>
          </tr>
        </thead>
        <tbody>
          {printable.map(({ value, parameter, showGroup }) => {
            const result = value.value !== null && value.value !== undefined
              ? Number(value.value).toFixed(parameter.decimals ?? 2)
              : (value.text_value || '—')

            return (
              <FragmentRow
                key={value.parameter_id}
                showGroup={showGroup}
                groupName={parameter.group_name}
                name={parameter.name}
                method={parameter.method}
                result={result}
                abnormal={value.abnormal}
                critical={value.is_critical}
                unit={value.unit}
                refDisplay={value.ref_display}
              />
            )
          })}
        </tbody>
      </table>

      <div className="border-t border-slate-300 mt-1 pt-1">
        {anyAbnormal && (
          <p className="text-[10px] text-slate-500">
            H = above reference interval &nbsp;&nbsp;&nbsp; L = below reference interval
          </p>
        )}
      </div>

      {item.interpretation?.trim() && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold tracking-wide text-slate-900">INTERPRETATION</h3>
          <p className="text-[12px] text-slate-800 whitespace-pre-wrap mt-1">{item.interpretation.trim()}</p>
        </div>
      )}
    </section>
  )
}

/** Flags the first row of each sub-heading group, without mutating render state. */
function withGroupHeadings(
  values: LabReportItem['values'],
  byId: Map<string, LabReportItem['parameters'][number]>,
) {
  let last: string | null = null
  return values.map(value => {
    const parameter = byId.get(value.parameter_id)!
    const showGroup = !!parameter.group_name && parameter.group_name !== last
    if (parameter.group_name) last = parameter.group_name
    return { value, parameter, showGroup }
  })
}

function FragmentRow({
  showGroup, groupName, name, method, result, abnormal, critical, unit, refDisplay,
}: {
  showGroup: boolean
  groupName: string | null
  name: string
  method: string | null
  result: string
  abnormal: 'H' | 'L' | 'A' | null
  critical: boolean
  unit: string | null
  refDisplay: string | null
}) {
  return (
    <>
      {showGroup && groupName && (
        <tr>
          <td colSpan={4} className="pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {groupName}
          </td>
        </tr>
      )}
      <tr>
        <td className="py-1 pr-2 align-top text-slate-900">
          {name}
          {method && <div className="text-[10px] text-slate-500">{method}</div>}
        </td>
        <td className={`py-1 pr-2 align-top ${abnormal ? 'font-bold' : ''} ${critical ? 'text-red-600' : 'text-slate-900'}`}>
          {result}
          {abnormal && <span className="ml-2">{abnormal}</span>}
        </td>
        <td className="py-1 pr-2 align-top text-slate-500">{unit || '—'}</td>
        <td className="py-1 align-top text-slate-500">{refDisplay || '—'}</td>
      </tr>
    </>
  )
}
