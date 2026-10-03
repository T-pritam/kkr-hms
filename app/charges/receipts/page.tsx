'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Download, Pencil, Plus, Printer, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import { PatientSelect, type SelectedPatient } from '@/components/lab/patient-select'
import { PaymentReceiptModal, type ReceiptTarget } from '@/components/patients/payment-receipt-modal'
import { OldPatientReceiptModal, type OldReceiptTarget } from '@/components/receipts/old-patient-receipt-modal'
import type { DoctorOption } from '@/components/receipts/receipt-doctor-input'
import { useUser } from '@/hooks/use-user'
import { loadLogoDataUri } from '@/lib/pdf/logo'
import {
  generatePaymentReceiptPDF,
  printPaymentReceipt,
  receiptAmount,
  type PaymentReceiptData,
} from '@/lib/pdf/payment-receipt-pdf'

/**
 * Payment receipts (client, 3 Oct) — every receipt in one list, laid out like
 * Charge Sheets.
 *
 * Two kinds, as a charge sheet has Registered and OPD:
 *   Registered patient   rows are the patient's own payments (the same receipt
 *                        as the Payments tab makes)
 *   Old patient          someone not in the app; everything typed in, amounts
 *                        too. Print only — nothing reaches the Ledger.
 *
 * Reception and admin only, like the receipts themselves.
 */

type Kind = 'all' | 'patient' | 'old'

export default function ReceiptsPage() {
  const { user } = useUser()
  const allowed = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST'

  const [receipts, setReceipts] = useState<any[]>([])
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([])
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [choosing, setChoosing] = useState(false)
  const [chosenPatient, setChosenPatient] = useState<SelectedPatient | null>(null)
  const [patientReceipt, setPatientReceipt] = useState<{ patientId: string; target: ReceiptTarget } | null>(null)
  const [oldReceipt, setOldReceipt] = useState<OldReceiptTarget | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchReceipts = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ kind })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/receipts?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load receipts')
      setReceipts(json.receipts || [])
      setDoctorOptions(json.doctor_options || [])
      setMe(json.me || '')
    } catch (err: any) {
      setError(err.message)
      setReceipts([])
    } finally {
      setLoading(false)
    }
  }, [allowed, debouncedSearch, kind])

  useEffect(() => {
    void fetchReceipts()
  }, [fetchReceipts])

  const isOld = (receipt: any) => receipt.subject_type === 'old'

  const open = (receipt: any) =>
    isOld(receipt)
      ? setOldReceipt({ kind: 'saved', receipt })
      : setPatientReceipt({ patientId: receipt.patient_id, target: { kind: 'saved', receiptId: receipt.id } })

  // Straight from the list: the saved receipt as it stands, amounts included.
  const print = async (receipt: any, then: 'download' | 'print') => {
    setBusyId(receipt.id)
    try {
      const data: PaymentReceiptData = {
        receipt_no: receipt.receipt_no,
        heading: receipt.heading,
        patient_name: receipt.patient_name,
        age_sex: receipt.age_sex,
        mobile: receipt.mobile,
        address: receipt.address,
        ip_no: receipt.ip_no,
        doctors: receipt.doctors ?? [],
        department: receipt.department,
        created_by_label: receipt.created_by_label,
        lines: receipt.lines.map((line: any) => ({
          line_date: line.line_date,
          payment_mode: line.payment_mode,
          transaction_type: line.transaction_type,
          remarks: line.remarks,
          amount: line.amount,
        })),
        logo: await loadLogoDataUri(),
      }
      if (then === 'print') printPaymentReceipt(data)
      else generatePaymentReceiptPDF(data)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (receipt: any) => {
    const note = isOld(receipt) ? '' : " The patient's payments are not touched."
    if (!confirm(`Delete receipt ${receipt.receipt_no}?${note}`)) return
    setBusyId(receipt.id)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to delete the receipt')
      await fetchReceipts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const closeChooser = () => {
    setChoosing(false)
    setChosenPatient(null)
  }

  const rowsLabel = (receipt: any) =>
    isOld(receipt)
      ? `${receipt.lines.length} row${receipt.lines.length === 1 ? '' : 's'}`
      : receipt.lines.length === 1
        ? `payment #${receipt.lines[0].installment_number}`
        : `payments ${receipt.lines.map((line: any) => `#${line.installment_number}`).join(', ')}`

  const kindBadge = (receipt: any) =>
    isOld(receipt) ? <Badge variant="warning">Old patient</Badge> : <Badge variant="info">Registered</Badge>

  const who = (receipt: any) => (
    <>
      <div className="text-foreground">
        {receipt.patient && !isOld(receipt) ? (
          <Link href={`/patients/${receipt.patient.id}`} className="hover:underline">
            {receipt.patient_name || receipt.patient.name}
          </Link>
        ) : (
          receipt.patient_name
        )}
      </div>
      {receipt.ip_no && <div className="text-xs text-muted">IP no {receipt.ip_no}</div>}
    </>
  )

  const actions = (receipt: any) => (
    <div className="flex justify-end gap-1">
      <button
        onClick={() => open(receipt)}
        aria-label={`Open receipt ${receipt.receipt_no}`}
        title="Open and edit"
        className="p-2 text-muted hover:text-foreground"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={() => void print(receipt, 'download')}
        disabled={busyId === receipt.id}
        aria-label={`Download receipt ${receipt.receipt_no}`}
        title="Download"
        className="p-2 text-muted hover:text-foreground disabled:opacity-50"
      >
        <Download size={16} />
      </button>
      <button
        onClick={() => void print(receipt, 'print')}
        disabled={busyId === receipt.id}
        aria-label={`Print receipt ${receipt.receipt_no}`}
        title="Print"
        className="p-2 text-muted hover:text-foreground disabled:opacity-50"
      >
        <Printer size={16} />
      </button>
      <button
        onClick={() => void remove(receipt)}
        disabled={busyId === receipt.id}
        aria-label={`Delete receipt ${receipt.receipt_no}`}
        title="Delete"
        className="p-2 text-muted hover:text-destructive disabled:opacity-50"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )

  if (user && !allowed) {
    return (
      <DashboardLayout>
        <p className="text-muted">Receipts are for reception and admin.</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Receipts</h1>
            <p className="text-muted">
              Payment receipts for registered patients and for old patients who are not in the app. An old
              patient&apos;s receipt is print only.
            </p>
          </div>
          <Button onClick={() => setChoosing(true)} className="w-full sm:w-auto">
            <Plus className="mr-2" size={18} />
            New Receipt
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              placeholder="Search by receipt number, name or IP no"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={kind} onChange={e => setKind(e.target.value as Kind)} aria-label="Which receipts">
            <option value="all">All receipts</option>
            <option value="patient">Registered patients</option>
            <option value="old">Old patients</option>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-muted">Loading receipts…</p>
          </div>
        ) : receipts.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <p className="text-muted">
              {debouncedSearch || kind !== 'all' ? 'No receipts match those filters' : 'No receipts yet'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-hover">
                  <tr>
                    {['Receipt', 'For', 'Type', 'Rows', 'Total'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.map(receipt => (
                    <tr key={receipt.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{receipt.receipt_no}</div>
                        <UpdatedStamp by={receipt.saved_by} at={receipt.saved_at} action="Saved" />
                      </td>
                      <td className="px-4 py-3">{who(receipt)}</td>
                      <td className="px-4 py-3">{kindBadge(receipt)}</td>
                      <td className="px-4 py-3 text-sm text-muted">{rowsLabel(receipt)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">₹{receiptAmount(receipt.total)}</td>
                      <td className="px-4 py-3 text-right">{actions(receipt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="xl:hidden divide-y divide-border">
              {receipts.map(receipt => (
                <div key={receipt.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">Receipt {receipt.receipt_no}</div>
                      <div className="text-sm truncate">{who(receipt)}</div>
                    </div>
                    {kindBadge(receipt)}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">{rowsLabel(receipt)}</span>
                    <span className="font-medium text-foreground">₹{receiptAmount(receipt.total)}</span>
                  </div>
                  <UpdatedStamp by={receipt.saved_by} at={receipt.saved_at} action="Saved" />
                  {actions(receipt)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New receipt: which kind, as a charge sheet asks Registered or OPD. */}
      <Modal isOpen={choosing} onClose={closeChooser} title="New receipt" description="Who is the receipt for?" size="md">
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-info" />
              <div>
                <p className="font-medium text-foreground">Registered patient</p>
                <p className="text-sm text-muted">The rows come from the patient&apos;s payments in the app.</p>
              </div>
            </div>
            <PatientSelect value={chosenPatient} onChange={setChosenPatient} />
            <Button
              className="w-full"
              disabled={!chosenPatient}
              onClick={() => {
                if (!chosenPatient) return
                setPatientReceipt({ patientId: chosenPatient.id, target: { kind: 'several' } })
                closeChooser()
              }}
            >
              Continue with {chosenPatient?.name || 'the patient'}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => {
              closeChooser()
              setOldReceipt({ kind: 'new' })
            }}
            className="w-full rounded-xl border border-border p-4 text-left hover:bg-surface-hover"
          >
            <div className="flex items-start gap-3">
              <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">Old patient (not registered)</p>
                <p className="text-sm text-muted">
                  Type the patient, doctors and every row with its amount. Print only: nothing is added to the
                  Ledger, Payments or Finances.
                </p>
              </div>
            </div>
          </button>
        </div>
      </Modal>

      {patientReceipt && (
        <PaymentReceiptModal
          patientId={patientReceipt.patientId}
          target={patientReceipt.target}
          onClose={() => setPatientReceipt(null)}
          onSaved={() => void fetchReceipts()}
        />
      )}

      <OldPatientReceiptModal
        target={oldReceipt}
        doctorOptions={doctorOptions}
        me={me}
        onClose={() => setOldReceipt(null)}
        onSaved={() => void fetchReceipts()}
      />
    </DashboardLayout>
  )
}
