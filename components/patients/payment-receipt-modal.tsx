'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Download, Eye, Lock, Plus, Printer, RotateCcw, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { rupeesInWords } from '@/lib/format/rupees-in-words'
import { loadLogoDataUri } from '@/lib/pdf/logo'
import {
  generatePaymentReceiptPDF,
  previewPaymentReceipt,
  printPaymentReceipt,
  receiptAmount,
  type PaymentReceiptData,
} from '@/lib/pdf/payment-receipt-pdf'
import { ReceiptDoctorInput, type DoctorOption } from './receipt-doctor-input'

/**
 * The payment receipt form (client, 1 Oct).
 *
 * The app fills the receipt in — the patient, the doctors who visited, each
 * payment's row — and the desk changes whatever needs changing before it is
 * printed. Only the amount is locked: it is the payment's own. The receipt
 * number is typed from the desk's book and is required. Saving keeps what was
 * typed, so the receipt reopens the same.
 *
 * A consultant doctor is picked from the Doctors list or typed in; picking one
 * brings their designation (and the department, if that is still empty).
 *
 * One form for the three ways in:
 *   single    the Receipt button on one payment — that row only
 *   several   "Receipt for several payments" — a tick list of every payment
 *   saved     a receipt opened from the Saved receipts list
 */

export type ReceiptTarget =
  | { kind: 'single'; installmentId: string }
  | { kind: 'several' }
  | { kind: 'saved'; receiptId: string }

interface Props {
  patientId: string
  target: ReceiptTarget | null
  onClose: () => void
  /** A receipt was saved — the tab reloads its list. */
  onSaved: () => void
}

interface LineForm {
  line_date: string
  payment_mode: string
  transaction_type: string
  remarks: string
}

interface HeaderForm {
  receipt_no: string
  heading: string
  patient_name: string
  age_sex: string
  mobile: string
  address: string
  ip_no: string
  department: string
  created_by_label: string
}

interface DoctorForm {
  name: string
  designation: string
}

const doctorsOf = (stored: unknown): DoctorForm[] =>
  (Array.isArray(stored) ? stored : []).map(entry =>
    typeof entry === 'string'
      ? { name: entry, designation: '' }
      : { name: String(entry?.name ?? ''), designation: String(entry?.designation ?? '') },
  )

const EMPTY_HEADER: HeaderForm = {
  receipt_no: '',
  heading: 'Cash Receipt',
  patient_name: '',
  age_sex: '',
  mobile: '',
  address: '',
  ip_no: '',
  department: '',
  created_by_label: '',
}

const MAX_DOCTORS = 8

const inputClass =
  'w-full bg-surface-inset text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-ring focus:outline-none disabled:opacity-50'
const cardClass = 'rounded-xl border border-border bg-surface-hover/40 p-4 space-y-3'
const headingClass = 'text-xs font-semibold uppercase tracking-wide text-muted'
const cellClass =
  'w-full min-w-[6rem] bg-surface-inset text-foreground rounded-md px-2 py-1.5 text-sm border border-border focus:border-ring focus:outline-none disabled:opacity-40'
const labelClass = 'block text-xs font-medium text-muted mb-1'

const lineOf = (source: any): LineForm => ({
  line_date: source?.line_date ? String(source.line_date).slice(0, 10) : '',
  payment_mode: source?.payment_mode ?? '',
  transaction_type: source?.transaction_type ?? '',
  remarks: source?.remarks ?? '',
})

export function PaymentReceiptModal({ patientId, target, onClose, onSaved }: Props) {
  const [loaded, setLoaded] = useState<any>(null)
  const [loadError, setLoadError] = useState('')
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [header, setHeader] = useState<HeaderForm>(EMPTY_HEADER)
  const [doctors, setDoctors] = useState<DoctorForm[]>([])
  const [lines, setLines] = useState<Record<string, LineForm>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const targetKey = target ? JSON.stringify(target) : ''

  useEffect(() => {
    if (!target) return
    let cancelled = false
    setLoaded(null)
    setLoadError('')
    setError('')

    fetch(`/api/patients/${patientId}/receipts`)
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || 'Failed to load the receipt')
        return body
      })
      .then(body => {
        if (cancelled) return
        const payments: any[] = body.payments ?? []
        const defaultLines = Object.fromEntries(payments.map(p => [p.id, lineOf(p.line)]))

        // A payment's own receipt, if one was saved before, reopens as it was.
        const saved =
          target.kind === 'saved'
            ? (body.receipts ?? []).find((r: any) => r.id === target.receiptId)
            : target.kind === 'single'
              ? (body.receipts ?? []).find(
                  (r: any) => r.lines.length === 1 && r.lines[0].installment_id === target.installmentId,
                )
              : null

        if (target.kind === 'saved' && !saved) {
          setLoadError('That receipt is no longer there.')
          return
        }

        if (saved) {
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
          setLines({
            ...defaultLines,
            ...Object.fromEntries(saved.lines.map((line: any) => [line.installment_id, lineOf(line)])),
          })
          setPicked(new Set(saved.lines.map((line: any) => line.installment_id)))
        } else {
          const single = target.kind === 'single' ? payments.find(p => p.id === target.installmentId) : null
          if (target.kind === 'single' && !single) {
            setLoadError('That payment is no longer there.')
            return
          }
          setReceiptId(null)
          setHeader({
            ...EMPTY_HEADER,
            ...body.defaults,
            receipt_no: '',
            // Whoever took the payment made the receipt; for several, whoever is at the desk now.
            created_by_label: single?.recorded_by || body.me || '',
          })
          setDoctors(doctorsOf(body.defaults?.doctors))
          setLines(defaultLines)
          setPicked(new Set(single ? [single.id] : payments.map(p => p.id)))
        }
        setLoaded(body)
      })
      .catch(err => !cancelled && setLoadError(err.message))

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, targetKey])

  const payments: any[] = useMemo(() => loaded?.payments ?? [], [loaded])
  const doctorOptions: DoctorOption[] = useMemo(() => loaded?.doctor_options ?? [], [loaded])
  // A single payment's receipt shows that row alone; the others offer every payment.
  const pickable = target?.kind !== 'single'
  const shown = pickable ? payments : payments.filter(p => picked.has(p.id))
  const chosen = payments.filter(p => picked.has(p.id))
  const total = chosen.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  const set = (field: keyof HeaderForm) => (e: { target: { value: string } }) =>
    setHeader(prev => ({ ...prev, [field]: e.target.value }))

  const setLine = (id: string, field: keyof LineForm, value: string) =>
    setLines(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const refill = () => {
    if (!loaded) return
    setHeader(prev => ({ ...prev, ...loaded.defaults, receipt_no: prev.receipt_no, created_by_label: prev.created_by_label }))
    setDoctors(doctorsOf(loaded.defaults?.doctors))
    setLines(Object.fromEntries(payments.map(p => [p.id, lineOf(p.line)])))
  }

  const ready = Boolean(header.receipt_no.trim() && header.patient_name.trim() && chosen.length > 0)

  const setDoctor = (index: number, patch: Partial<DoctorForm>) =>
    setDoctors(prev => prev.map((doctor, i) => (i === index ? { ...doctor, ...patch } : doctor)))

  // Typing over a picked doctor drops the designation that came with them: it
  // belonged to the name that is no longer there. One the desk typed stays.
  const typeDoctor = (index: number, name: string) =>
    setDoctors(prev =>
      prev.map((doctor, i) => {
        if (i !== index) return doctor
        const was = doctorOptions.find(option => option.name === doctor.name)
        const stale = Boolean(was?.designation) && was?.designation === doctor.designation && name !== doctor.name
        return { name, designation: stale ? '' : doctor.designation }
      }),
    )

  // Picking from the list brings the designation, and the department while it is empty.
  const pickDoctor = (index: number, doctor: DoctorOption) => {
    setDoctor(index, { name: doctor.name, designation: doctor.designation })
    if (doctor.department) setHeader(prev => (prev.department.trim() ? prev : { ...prev, department: doctor.department }))
  }

  const typedDoctors = () =>
    doctors
      .map(doctor => ({ name: doctor.name.trim(), designation: doctor.designation.trim() }))
      .filter(doctor => doctor.name)

  const receiptData = async (): Promise<PaymentReceiptData> => ({
    ...header,
    receipt_no: header.receipt_no.trim(),
    doctors: typedDoctors(),
    lines: chosen.map(p => ({
      line_date: lines[p.id]?.line_date || null,
      payment_mode: lines[p.id]?.payment_mode ?? '',
      transaction_type: lines[p.id]?.transaction_type ?? '',
      remarks: lines[p.id]?.remarks ?? '',
      amount: Number(p.amount) || 0,
    })),
    logo: await loadLogoDataUri(),
  })

  /** Looks at the receipt as it stands, without saving it. */
  const preview = async () => previewPaymentReceipt(await receiptData())

  const save = async (then: 'download' | 'print') => {
    setBusy(true)
    setError('')
    try {
      const body = {
        ...header,
        doctors: typedDoctors(),
        lines: chosen.map(p => ({ installment_id: p.id, ...lines[p.id], line_date: lines[p.id]?.line_date || null })),
      }
      const response = await fetch(
        receiptId ? `/api/patients/${patientId}/receipts/${receiptId}` : `/api/patients/${patientId}/receipts`,
        {
          method: receiptId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
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

  const allPicked = payments.length > 0 && chosen.length === payments.length

  return (
    <Modal
      isOpen={Boolean(target)}
      onClose={onClose}
      title={receiptId ? 'Payment receipt' : 'New payment receipt'}
      description="Filled in from the patient's record. Change anything before printing; only the amount is fixed. What you type is kept with the receipt."
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {loaded && !loadError && (
            <span className="mr-auto text-xs text-muted">
              {!header.receipt_no.trim()
                ? 'Type the receipt number to download or print.'
                : chosen.length === 0
                  ? 'Tick at least one payment.'
                  : !header.patient_name.trim()
                    ? "Type the patient's name."
                    : `${chosen.length} payment${chosen.length === 1 ? '' : 's'} · ₹${receiptAmount(total)}`}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => void preview()} disabled={busy || !loaded || chosen.length === 0}>
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
      {loadError ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {loadError}
        </p>
      ) : !loaded ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section className={cardClass}>
            <h4 className={headingClass}>Receipt</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="receipt-no" className={labelClass}>
                  Receipt No <span className="text-destructive">*</span>
                </label>
                <input
                  id="receipt-no"
                  autoFocus
                  value={header.receipt_no}
                  onChange={set('receipt_no')}
                  placeholder="From your receipt book, e.g. 287(A)"
                  maxLength={40}
                  className={`${inputClass} font-semibold ${header.receipt_no.trim() ? '' : 'border-warning'}`}
                />
              </div>
              <div>
                <label htmlFor="receipt-heading" className={labelClass}>Heading</label>
                <input id="receipt-heading" value={header.heading} onChange={set('heading')} maxLength={60} className={inputClass} />
              </div>
              <div>
                <label htmlFor="receipt-created-by" className={labelClass}>Created by</label>
                <input
                  id="receipt-created-by"
                  value={header.created_by_label}
                  onChange={set('created_by_label')}
                  maxLength={60}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h4 className={headingClass}>Bill to</h4>
              <button type="button" onClick={refill} className="inline-flex items-center gap-1 text-xs text-info hover:underline">
                <RotateCcw size={12} /> Fill from the patient&apos;s record again
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label htmlFor="receipt-name" className={labelClass}>
                  Patient name <span className="text-destructive">*</span>
                </label>
                <input id="receipt-name" value={header.patient_name} onChange={set('patient_name')} maxLength={120} className={inputClass} />
              </div>
              <div>
                <label htmlFor="receipt-age" className={labelClass}>Age / sex</label>
                <input id="receipt-age" value={header.age_sex} onChange={set('age_sex')} maxLength={40} className={inputClass} />
              </div>
              <div>
                <label htmlFor="receipt-ip" className={labelClass}>IP no</label>
                <input id="receipt-ip" value={header.ip_no} onChange={set('ip_no')} maxLength={40} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label htmlFor="receipt-mobile" className={labelClass}>Mobile no</label>
                <input id="receipt-mobile" value={header.mobile} onChange={set('mobile')} maxLength={60} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label htmlFor="receipt-address" className={labelClass}>Address</label>
                <input
                  id="receipt-address"
                  value={header.address}
                  onChange={set('address')}
                  maxLength={300}
                  placeholder="Left out of the receipt when empty"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <h4 className={headingClass}>Consultant doctors</h4>
            {doctors.length === 0 ? (
              <p className="text-xs text-muted">None yet. The line is left out of the receipt.</p>
            ) : (
              <div className="space-y-2">
                <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2rem] gap-2 text-xs font-medium text-muted">
                  <span>Doctor (pick from the list, or type a name)</span>
                  <span>Designation</span>
                  <span />
                </div>
                {doctors.map((doctor, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_2rem] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2rem] gap-2 items-center"
                  >
                    <ReceiptDoctorInput
                      ariaLabel={`Doctor ${index + 1}`}
                      value={doctor.name}
                      options={doctorOptions}
                      onType={name => typeDoctor(index, name)}
                      onPick={picked => pickDoctor(index, picked)}
                      className={inputClass}
                    />
                    <input
                      aria-label={`Designation of doctor ${index + 1}`}
                      value={doctor.designation}
                      maxLength={80}
                      placeholder="Designation (optional)"
                      onChange={e => setDoctor(index, { designation: e.target.value })}
                      className={`${inputClass} col-start-1 row-start-2 sm:col-start-2 sm:row-start-1`}
                    />
                    <button
                      type="button"
                      onClick={() => setDoctors(prev => prev.filter((_, i) => i !== index))}
                      className="col-start-2 row-start-1 sm:col-start-3 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-inset hover:text-destructive"
                      aria-label={`Remove doctor ${index + 1}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3">
              {doctors.length < MAX_DOCTORS ? (
                <button
                  type="button"
                  onClick={() => setDoctors(prev => [...prev, { name: '', designation: '' }])}
                  className="inline-flex items-center gap-1 text-sm text-info hover:underline"
                >
                  <Plus size={14} /> Add doctor
                </button>
              ) : (
                <span />
              )}
              <div className="w-full sm:w-72">
                <label htmlFor="receipt-department" className={labelClass}>Department</label>
                <input
                  id="receipt-department"
                  value={header.department}
                  onChange={set('department')}
                  maxLength={80}
                  placeholder="e.g. General Medicine"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h4 className={headingClass}>{pickable ? 'Payments on this receipt' : 'Payment'}</h4>
              {pickable && payments.length > 0 && (
                <span className="text-xs text-muted">
                  {chosen.length} of {payments.length} ticked
                </span>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-muted">This patient has no payments yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-inset text-left text-xs text-muted">
                    <tr>
                      {pickable && (
                        <th className="px-2 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={allPicked}
                            onChange={() => setPicked(allPicked ? new Set() : new Set(payments.map(p => p.id)))}
                            aria-label="Tick every payment"
                            className="h-4 w-4"
                          />
                        </th>
                      )}
                      <th className="px-2 py-2 font-medium">#</th>
                      <th className="px-2 py-2 font-medium">Date</th>
                      <th className="px-2 py-2 font-medium">Payment mode</th>
                      <th className="px-2 py-2 font-medium">Transaction type</th>
                      <th className="px-2 py-2 font-medium text-right">Amount</th>
                      <th className="px-2 py-2 font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map(payment => {
                      const on = picked.has(payment.id)
                      const line = lines[payment.id] ?? lineOf(null)
                      return (
                        <tr key={payment.id} className={on ? '' : 'opacity-60'}>
                          {pickable && (
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(payment.id)}
                                aria-label={`Include payment ${payment.installment_number}`}
                                className="h-4 w-4"
                              />
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-foreground">{payment.installment_number}</td>
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              aria-label="Date"
                              disabled={!on}
                              value={line.line_date}
                              onChange={e => setLine(payment.id, 'line_date', e.target.value)}
                              className={cellClass}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              aria-label="Payment mode"
                              disabled={!on}
                              value={line.payment_mode}
                              maxLength={40}
                              onChange={e => setLine(payment.id, 'payment_mode', e.target.value)}
                              className={cellClass}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              aria-label="Transaction type"
                              disabled={!on}
                              value={line.transaction_type}
                              maxLength={40}
                              onChange={e => setLine(payment.id, 'transaction_type', e.target.value)}
                              className={cellClass}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-foreground whitespace-nowrap">
                            <span className="inline-flex items-center gap-1" title="The amount is the payment's own and cannot be changed here">
                              <Lock size={11} className="text-muted" /> ₹{receiptAmount(Number(payment.amount) || 0)}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              aria-label="Remarks"
                              disabled={!on}
                              value={line.remarks}
                              maxLength={120}
                              onChange={e => setLine(payment.id, 'remarks', e.target.value)}
                              className={cellClass}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg bg-surface-inset px-4 py-3">
              <p className="text-sm text-muted first-letter:uppercase">Rupees: {rupeesInWords(total)}.</p>
              <p className="text-lg font-semibold text-foreground">
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted">Total</span>₹{receiptAmount(total)}/-
              </p>
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}
