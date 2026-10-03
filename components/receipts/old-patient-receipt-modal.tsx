'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Download, Eye, Plus, Printer, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { loadLogoDataUri } from '@/lib/pdf/logo'
import {
  generatePaymentReceiptPDF,
  previewPaymentReceipt,
  printPaymentReceipt,
  receiptAmount,
  type PaymentReceiptData,
} from '@/lib/pdf/payment-receipt-pdf'
import type { DoctorOption } from './receipt-doctor-input'
import {
  BillToCard,
  DoctorsCard,
  EMPTY_HEADER,
  ReceiptDetailsCard,
  ReceiptTotal,
  cardClass,
  cellClass,
  doctorsOf,
  fieldSetter,
  headerReady,
  headingClass,
  typedDoctors,
  type DoctorForm,
  type HeaderForm,
} from './receipt-form-sections'

/**
 * A receipt for an old patient (client, 3 Oct) — someone treated before the
 * app, or never registered. Nothing comes from the app: the desk types the
 * patient, the doctors and every row, amounts included.
 *
 * It is print only. Saving keeps what was typed so the receipt can be printed
 * again, and nothing reaches the Ledger, Payments or Finances.
 *
 * The cards above the rows are the same ones a registered patient's receipt
 * uses (`receipt-form-sections.tsx`), so the two forms look and behave alike.
 */

export type OldReceiptTarget = { kind: 'new' } | { kind: 'saved'; receipt: any }

interface Props {
  target: OldReceiptTarget | null
  doctorOptions: DoctorOption[]
  /** Who is signed in — the "Created by" of a new receipt. */
  me: string
  onClose: () => void
  onSaved: () => void
}

interface RowForm {
  key: number
  line_date: string
  payment_mode: string
  transaction_type: string
  amount: string
  remarks: string
}

let nextKey = 1
const blankRow = (): RowForm => ({
  key: nextKey++,
  line_date: '',
  payment_mode: 'Cash',
  transaction_type: 'cash',
  amount: '',
  remarks: '',
})

const amountOf = (row: RowForm) => {
  const n = Number(row.amount)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function OldPatientReceiptModal({ target, doctorOptions, me, onClose, onSaved }: Props) {
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [header, setHeader] = useState<HeaderForm>(EMPTY_HEADER)
  const [doctors, setDoctors] = useState<DoctorForm[]>([])
  const [rows, setRows] = useState<RowForm[]>([blankRow()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const savedId = target?.kind === 'saved' ? target.receipt.id : null

  useEffect(() => {
    if (!target) return
    setError('')
    if (target.kind === 'saved') {
      const saved = target.receipt
      setReceiptId(saved.id)
      setHeader({
        receipt_no: saved.receipt_no ?? '',
        heading: saved.heading ?? 'Cash Receipt',
        patient_name: saved.patient_name ?? '',
        age_sex: saved.age_sex ?? '',
        mobile: saved.mobile ?? '',
        address: saved.address ?? '',
        ip_no: saved.ip_no ?? '',
        department: saved.department ?? '',
        created_by_label: saved.created_by_label ?? '',
      })
      setDoctors(doctorsOf(saved.doctors))
      setRows(
        (saved.lines ?? []).map((line: any) => ({
          key: nextKey++,
          line_date: line.line_date ? String(line.line_date).slice(0, 10) : '',
          payment_mode: line.payment_mode ?? '',
          transaction_type: line.transaction_type ?? '',
          amount: line.amount != null ? String(line.amount) : '',
          remarks: line.remarks ?? '',
        })),
      )
    } else {
      setReceiptId(null)
      setHeader({ ...EMPTY_HEADER, created_by_label: me })
      setDoctors([])
      setRows([blankRow()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, savedId])

  const set = fieldSetter(setHeader)
  const setRow = (key: number, patch: Partial<RowForm>) =>
    setRows(prev => prev.map(row => (row.key === key ? { ...row, ...patch } : row)))

  const total = rows.reduce((sum, row) => sum + amountOf(row), 0)
  const missingAmount = rows.findIndex(row => amountOf(row) === 0)
  const ready = headerReady(header) && rows.length > 0 && missingAmount === -1

  const receiptData = async (): Promise<PaymentReceiptData> => ({
    ...header,
    receipt_no: header.receipt_no.trim(),
    doctors: typedDoctors(doctors),
    lines: rows.map(row => ({
      line_date: row.line_date || null,
      payment_mode: row.payment_mode,
      transaction_type: row.transaction_type,
      remarks: row.remarks,
      amount: amountOf(row),
    })),
    logo: await loadLogoDataUri(),
  })

  const save = async (then: 'download' | 'print') => {
    setBusy(true)
    setError('')
    try {
      const body = {
        ...header,
        doctors: typedDoctors(doctors),
        lines: rows.map(row => ({
          line_date: row.line_date || null,
          payment_mode: row.payment_mode,
          transaction_type: row.transaction_type,
          remarks: row.remarks,
          amount: row.amount,
        })),
      }
      const response = await fetch(receiptId ? `/api/receipts/${receiptId}` : '/api/receipts', {
        method: receiptId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Failed to save the receipt')
      if (result?.id) setReceiptId(result.id)

      const data = await receiptData()
      if (then === 'print') printPaymentReceipt(data)
      else generatePaymentReceiptPDF(data)

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save the receipt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={Boolean(target)}
      onClose={onClose}
      title={receiptId ? 'Old patient receipt' : 'New receipt — old patient'}
      description="For a patient who is not in the app. Type everything, amounts included. Print only: nothing is added to the Ledger, Payments or Finances."
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted">
            {!header.receipt_no.trim()
              ? 'Type the receipt number to download or print.'
              : !header.patient_name.trim()
                ? "Type the patient's name."
                : missingAmount !== -1
                  ? `Row ${missingAmount + 1} needs an amount.`
                  : `${rows.length} row${rows.length === 1 ? '' : 's'} · ₹${receiptAmount(total)}`}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={async () => previewPaymentReceipt(await receiptData())} disabled={busy}>
            <Eye size={16} className="mr-1.5" /> Preview
          </Button>
          <Button variant="outline" onClick={() => void save('print')} disabled={busy || !ready}>
            <Printer size={16} className="mr-1.5" /> Save &amp; print
          </Button>
          <Button onClick={() => void save('download')} disabled={busy || !ready}>
            <Download size={16} className="mr-1.5" /> {busy ? 'Saving…' : 'Save & download'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <ReceiptDetailsCard header={header} onField={set} />
        <BillToCard header={header} onField={set} />
        <DoctorsCard doctors={doctors} setDoctors={setDoctors} options={doctorOptions} header={header} setHeader={setHeader} />

        <section className={cardClass}>
          <div className="flex items-center justify-between gap-3">
            <h4 className={headingClass}>Rows</h4>
            <span className="text-xs text-muted">The amount is typed here; it is not taken from the app.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-inset text-left text-xs text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Payment mode</th>
                  <th className="px-2 py-2 font-medium">Transaction type</th>
                  <th className="px-2 py-2 font-medium text-right">
                    Amount (₹) <span className="text-destructive">*</span>
                  </th>
                  <th className="px-2 py-2 font-medium">Remarks</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, index) => (
                  <tr key={row.key}>
                    <td className="px-2 py-1.5 text-foreground">{index + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        aria-label={`Row ${index + 1} date`}
                        value={row.line_date}
                        onChange={e => setRow(row.key, { line_date: e.target.value })}
                        className={cellClass}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`Row ${index + 1} payment mode`}
                        value={row.payment_mode}
                        maxLength={40}
                        onChange={e => setRow(row.key, { payment_mode: e.target.value })}
                        className={cellClass}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`Row ${index + 1} transaction type`}
                        value={row.transaction_type}
                        maxLength={40}
                        onChange={e => setRow(row.key, { transaction_type: e.target.value })}
                        className={cellClass}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`Row ${index + 1} amount`}
                        inputMode="decimal"
                        value={row.amount}
                        placeholder="0"
                        onChange={e => /^\d*\.?\d{0,2}$/.test(e.target.value) && setRow(row.key, { amount: e.target.value })}
                        className={`${cellClass} text-right font-semibold ${amountOf(row) === 0 ? 'border-warning' : ''}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`Row ${index + 1} remarks`}
                        value={row.remarks}
                        maxLength={120}
                        placeholder="e.g. advance"
                        onChange={e => setRow(row.key, { remarks: e.target.value })}
                        className={cellClass}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setRows(prev => prev.filter(r => r.key !== row.key))}
                        disabled={rows.length === 1}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-inset hover:text-destructive disabled:opacity-30"
                        aria-label={`Remove row ${index + 1}`}
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < 50 && (
            <button
              type="button"
              onClick={() => setRows(prev => [...prev, blankRow()])}
              className="inline-flex items-center gap-1 text-sm text-info hover:underline"
            >
              <Plus size={14} /> Add row
            </button>
          )}
          <ReceiptTotal total={total} />
        </section>
      </div>
    </Modal>
  )
}
