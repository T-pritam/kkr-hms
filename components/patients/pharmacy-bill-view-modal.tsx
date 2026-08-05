'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, ExternalLink, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { generatePharmacyBillPDF, printPharmacyBill } from '@/lib/pdf/pharmacy-bill-pdf'
import type { PatientChargesPatient } from '@/lib/pdf/patient-charges-pdf'

/**
 * Read-only view of a stored pharmacy bill.
 *
 * Everything here comes from our own DB (GET /pharmacy-bills/[billId]) —
 * viewing this never calls SmartPharma360 again. The only thing that can be
 * changed is the bill date; the medicine lines, batch numbers and amounts
 * are exactly what the pharmacy said they were and have no edit control at
 * all — wrong data is fixed by deleting the row from the charges list and
 * adding the correct bill.
 */

interface PharmacyBillItem {
  id: string
  product_name: string
  batch_number: string | null
  packing: string | null
  sale_quantity: number
  mrp: number | null
  gst_percent: number | null
  gst_value: number | null
  net_amount: number
}

interface PharmacyBillDetail {
  id: string
  entry_number: string | null
  entry_date: string
  external_bill_id: number
  invoice_number: string | null
  bill_patient_name: string | null
  doctor_name: string | null
  invoice_url: string | null
  net_amount: number
  items: PharmacyBillItem[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  patientId: string
  billId: string
  patient?: PatientChargesPatient | null
  onDateChanged?: () => void
}

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PharmacyBillViewModal({ isOpen, onClose, patientId, billId, patient, onDateChanged }: Props) {
  const [data, setData] = useState<PharmacyBillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateDraft, setDateDraft] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/pharmacy-bills/${billId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load the bill')
      setData(json)
      setDateDraft(String(json.entry_date || '').slice(0, 10))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [patientId, billId])

  useEffect(() => {
    if (!isOpen) return
    void load()
  }, [isOpen, load])

  const saveDate = async () => {
    if (!data || dateDraft === data.entry_date.slice(0, 10)) return
    setSavingDate(true)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/pharmacy-bills/${billId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_date: dateDraft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update the date')
      setData(json)
      onDateChanged?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingDate(false)
    }
  }

  const pdfData = data
    ? {
        patient: patient ?? { name: data.bill_patient_name || 'Patient', patient_id: null },
        entry_number: data.entry_number,
        external_bill_id: data.external_bill_id,
        entry_date: data.entry_date,
        net_amount: data.net_amount,
        items: data.items,
      }
    : null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pharmacy bill" size="lg">
      {loading ? (
        <div className="py-12 text-center text-muted">Loading bill…</div>
      ) : !data ? (
        <div className="py-12 text-center text-muted">{error || 'Bill not found'}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted">Bill number</span>
              <p className="text-foreground font-medium">{data.entry_number || data.external_bill_id}</p>
            </div>
            <div>
              <span className="text-muted">Bill patient / doctor</span>
              <p className="text-foreground font-medium">
                {data.bill_patient_name || '—'} {data.doctor_name ? `· ${data.doctor_name}` : ''}
              </p>
            </div>
            <div>
              <span className="text-muted">Bill date</span>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="date"
                  value={dateDraft}
                  onChange={e => setDateDraft(e.target.value)}
                  disabled={savingDate}
                  className="max-w-[160px]"
                />
                {dateDraft !== data.entry_date.slice(0, 10) && (
                  <Button size="sm" variant="outline" onClick={saveDate} disabled={savingDate}>
                    {savingDate && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                    Save
                  </Button>
                )}
              </div>
            </div>
            <div>
              <span className="text-muted">Amount</span>
              <p className="text-foreground font-semibold">{money(data.net_amount)}</p>
            </div>
          </div>

          {data.invoice_url && (
            <a
              href={data.invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-info hover:underline"
            >
              <ExternalLink size={14} />
              View original invoice
            </a>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-inset">
                <tr>
                  {['Medicine', 'Batch', 'Unit', 'Qty', 'Rate', 'GST %', 'Net Amount'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap ${
                        i >= 3 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-input-border">
                {data.items.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-foreground">{item.product_name}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{item.batch_number || '—'}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{item.packing || '—'}</td>
                    <td className="px-3 py-2 text-foreground text-right">{item.sale_quantity}</td>
                    <td className="px-3 py-2 text-foreground text-right whitespace-nowrap">
                      {item.mrp != null ? money(item.mrp) : '—'}
                    </td>
                    <td className="px-3 py-2 text-foreground text-right">
                      {item.gst_percent != null ? item.gst_percent : '—'}
                    </td>
                    <td className="px-3 py-2 text-foreground text-right font-medium whitespace-nowrap">
                      {money(item.net_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-inset font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-right text-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-foreground whitespace-nowrap">{money(data.net_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => pdfData && printPharmacyBill(pdfData)}>
              <Printer size={14} className="mr-1.5" />Print
            </Button>
            <Button onClick={() => pdfData && generatePharmacyBillPDF(pdfData)}>
              <Download size={14} className="mr-1.5" />Download PDF
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
