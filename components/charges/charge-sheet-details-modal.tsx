'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ChevronRight, Download, Pill } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { PharmacyBillViewModal } from '@/components/patients/pharmacy-bill-view-modal'
import { groupByCharge, groupByDate } from '@/lib/billing/group-charges'

/**
 * Reading a charge sheet without opening it for editing.
 *
 * Edit used to be the only way to see a sheet's lines, which meant a forwarded
 * or cancelled sheet — the two that are locked against editing — could not be
 * inspected at all. This is the read-only counterpart, and it groups the lines
 * exactly as the patient Charges tab groups charges, through the same helpers,
 * because a sheet quotes what that tab bills.
 *
 * Nothing here writes. Download hands off to the existing picker so a sheet's
 * pharmacy bills can still be appended.
 */

interface SheetLine {
  id: string
  charge_name?: string | null
  description?: string | null
  charge_item_id?: string | null
  billing_mode?: string | null
  unit_price: number | string
  qty: number
  service_date?: string | null
  pharmacy_bill?: { id: string } | { id: string }[] | null
}

interface SheetDetail {
  id: string
  sheet_no: string
  subject_type: 'patient' | 'opd'
  patient?: { name?: string; patient_id?: string | null } | null
  opd_name?: string | null
  opd_phone?: string | null
  status: string
  total_amount: number | string
  notes?: string | null
  items?: SheetLine[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  sheetId: string
  /** Opens the download picker for this sheet, already fetched. */
  onDownload: (sheet: SheetDetail) => void
}

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const lineTotal = (l: SheetLine) => (Number(l.unit_price) || 0) * (Number(l.qty) || 1)

/** PostgREST hands an embed back as an array unless it can prove it is to-one. */
const billOf = (l: SheetLine) =>
  (Array.isArray(l.pharmacy_bill) ? l.pharmacy_bill[0] : l.pharmacy_bill) ?? null

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'outline'> = {
  draft: 'warning',
  forwarded: 'success',
  cancelled: 'outline',
}

export function ChargeSheetDetailsModal({ isOpen, onClose, sheetId, onDownload }: Props) {
  const [sheet, setSheet] = useState<SheetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'date' | 'charge'>('date')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pharmacyViewBillId, setPharmacyViewBillId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/charge-sheets/${sheetId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load the charge sheet')
      setSheet(json.chargeSheet)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sheetId])

  useEffect(() => {
    if (!isOpen) return
    setExpanded(new Set())
    void load()
  }, [isOpen, load])

  const lines = useMemo(() => sheet?.items ?? [], [sheet])

  const read = useCallback(
    (l: SheetLine) => ({
      date: String(l.service_date || ''),
      label: l.charge_name || l.description || 'Charge',
      itemId: l.charge_item_id,
      total: lineTotal(l),
    }),
    [],
  )

  const byDate = useMemo(() => groupByDate(lines, read), [lines, read])
  const byCharge = useMemo(() => groupByCharge(lines, read), [lines, read])

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const who =
    sheet?.subject_type === 'patient'
      ? sheet?.patient?.name || 'Unknown patient'
      : sheet?.opd_name || 'Walk-in'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="full"
        title={sheet ? `Charge sheet ${sheet.sheet_no}` : 'Charge sheet'}
        description={sheet ? `${who} · an estimate, not a bill` : undefined}
      >
        {loading ? (
          <div className="py-12 text-center text-muted">Loading sheet…</div>
        ) : !sheet ? (
          <div className="py-12 text-center text-muted">{error || 'Charge sheet not found'}</div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant={STATUS_VARIANT[sheet.status] ?? 'outline'}>
                {sheet.status === 'draft'
                  ? 'Draft — not billed'
                  : sheet.status === 'forwarded'
                    ? 'Forwarded to billing'
                    : 'Cancelled'}
              </Badge>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-border overflow-hidden">
                  {(['date', 'charge'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3 py-1.5 text-sm transition-colors ${
                        view === v
                          ? 'bg-info text-foreground'
                          : 'bg-surface-inset text-muted hover:text-foreground'
                      }`}
                    >
                      {v === 'date' ? 'By date' : 'By charge'}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => onDownload(sheet)}>
                  <Download size={14} className="mr-1.5" />
                  Download
                </Button>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="bg-surface-hover rounded-lg p-8 text-center text-muted">
                This sheet has no lines
              </div>
            ) : view === 'date' ? (
              <div className="space-y-3">
                {byDate.map(day => {
                  const isOpen = expanded.has(day.key)
                  return (
                    <div
                      key={day.key}
                      className="bg-surface-hover rounded-lg overflow-hidden border border-border"
                    >
                      <button
                        onClick={() => toggle(day.key)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-table-row-hover"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight
                            size={16}
                            className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {day.date ? new Date(day.date).toLocaleDateString() : 'No date'}
                            </p>
                            <p className="text-xs text-muted">
                              {day.rows.length} line{day.rows.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-foreground shrink-0">
                          {money(day.total)}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="divide-y divide-input-border border-t border-input-border">
                          {day.rows.map(line => (
                            <SheetLineRow
                              key={line.id}
                              line={line}
                              onViewBill={setPharmacyViewBillId}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {byCharge.map(group => {
                  const isOpen = expanded.has(group.key)
                  return (
                    <div
                      key={group.key}
                      className="bg-surface-hover rounded-lg overflow-hidden border border-border"
                    >
                      <button
                        onClick={() => toggle(group.key)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-table-row-hover"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight
                            size={16}
                            className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{group.label}</p>
                            <p className="text-xs text-muted">
                              {group.rows.length} line{group.rows.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-foreground shrink-0">
                          {money(group.total)}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="divide-y divide-input-border border-t border-input-border">
                          {group.rows.map(line => (
                            <SheetLineRow
                              key={line.id}
                              line={line}
                              showDate
                              onViewBill={setPharmacyViewBillId}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="bg-surface-inset rounded-lg p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-sm font-semibold text-foreground">
                {money(Number(sheet.total_amount))}
              </span>
            </div>

            {sheet.notes && (
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">Notes</h4>
                <p className="text-sm text-muted whitespace-pre-wrap">{sheet.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {pharmacyViewBillId && (
        <PharmacyBillViewModal
          isOpen={Boolean(pharmacyViewBillId)}
          onClose={() => setPharmacyViewBillId(null)}
          endpoint={`/api/charge-sheets/${sheetId}/pharmacy-bills/${pharmacyViewBillId}`}
          patient={
            sheet?.subject_type === 'patient' && sheet.patient
              ? { name: sheet.patient.name || 'Patient', patient_id: sheet.patient.patient_id ?? null }
              : { name: sheet?.opd_name || 'Walk-in', patient_id: null }
          }
          onDateChanged={load}
        />
      )}
    </>
  )
}

/** One line inside an expanded block. Read-only — this view never writes. */
function SheetLineRow({
  line,
  showDate,
  onViewBill,
}: {
  line: SheetLine
  /** Grouping by charge rather than by date, so the day still needs saying. */
  showDate?: boolean
  onViewBill: (billId: string) => void
}) {
  const bill = billOf(line)

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {line.charge_name || line.description || 'Charge'}
          {bill && <Badge variant="info" className="ml-2">Pharmacy</Badge>}
          {line.billing_mode === 'per_day' && (
            <span className="ml-2 text-xs text-muted">per day</span>
          )}
          {line.billing_mode === 'per_hour' && (
            <span className="ml-2 text-xs text-muted">per hour</span>
          )}
        </p>
        {line.charge_name && line.description && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{line.description}</p>
        )}
        {showDate && (
          <p className="text-xs text-muted mt-0.5">
            {line.service_date ? new Date(line.service_date).toLocaleDateString() : 'No date'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm text-right">
          {/* Hours explain an hourly line's total; a per-day row is always one
              unit of one day, so a "1 ×" there says nothing. */}
          {line.billing_mode === 'per_hour' ? (
            <span className="text-muted mr-2">{line.qty || 1} hrs</span>
          ) : (
            line.billing_mode !== 'per_day' &&
            (line.qty || 1) > 1 && <span className="text-muted mr-2">{line.qty} ×</span>
          )}
          <span className="font-medium text-foreground">{money(lineTotal(line))}</span>
        </span>

        {bill && (
          <button
            onClick={() => onViewBill(bill.id)}
            className="text-info text-sm font-medium inline-flex items-center gap-1"
          >
            <Pill size={14} />
            View
          </button>
        )}
      </div>
    </div>
  )
}
