'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'

/**
 * Attaching a pharmacy bill by id, in two steps.
 *
 * Deliberately not the regular charge form — there is no catalogue entry to
 * pick and nothing to price by hand. One field: the bill id or bill number,
 * exactly as it appears on the pharmacy's own receipt.
 *
 * The bill used to be saved the moment the id was typed, so a mistyped digit
 * landed somebody else's medicines on the patient's bill and had to be deleted
 * afterwards. Now it is fetched and shown first, and only written when the desk
 * confirms it is the right invoice. The fetch is not repeated on save — the
 * server keeps the payload against the token returned here — so checking a bill
 * costs the pharmacy's API nothing extra.
 *
 * The date is the one thing editable: the pharmacy's own entry date can be
 * wrong, and correcting it here saves a second trip through the bill view.
 * Medicines, quantities and amounts are theirs and are shown as read-only.
 */

interface PreviewItem {
  product_name: string
  batch_number?: string | null
  packing?: string | null
  expiry?: string | null
  sale_quantity: number
  mrp?: number | string | null
  net_amount: number | string
}

interface PreviewHead {
  entry_number?: string | null
  entry_date?: string | null
  patient_name?: string | null
  doctor_name?: string | null
  net_amount?: number | null
}

interface Preview {
  token: string
  external_bill_id: number
  head: PreviewHead
  items: PreviewItem[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /**
   * Where to POST the confirmed bill — `/api/patients/<id>/pharmacy-bills` or
   * `/api/charge-sheets/<id>/pharmacy-bills`. The two store the same bill and
   * differ only in what owns it, so the form is the same either way. The fetch
   * itself always goes to the shared preview route.
   */
  endpoint: string
  /** Patient charges only: the bill the charge is placed on. */
  billingId?: string | null
  /** Set when the caller has no billing record and the form must say so. */
  requiresBilling?: boolean
}

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PharmacyBillAddModal({
  isOpen,
  onClose,
  onSuccess,
  endpoint,
  billingId,
  requiresBilling = false,
}: Props) {
  const [billId, setBillId] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [entryDate, setEntryDate] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setBillId('')
    setPreview(null)
    setEntryDate('')
    setError('')
  }, [isOpen])

  const blocked = requiresBilling && !billingId

  const fetchBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (blocked) return

    setFetching(true)
    setError('')

    try {
      const res = await fetch('/api/pharmacy-bills/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_id: billId }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Could not fetch that bill')

      setPreview(body)
      setEntryDate(String(body.head?.entry_date || '').slice(0, 10))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }

  const save = async () => {
    if (!preview) return

    setSaving(true)
    setError('')

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview_token: preview.token,
          entry_date: entryDate,
          patient_billing_id: billingId ?? null,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to add the pharmacy bill')

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  /** Back discards the parked preview by simply not using its token. */
  const back = () => {
    setPreview(null)
    setError('')
  }

  const total = Number(preview?.head?.net_amount ?? 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={preview ? 'lg' : 'md'}
      title="Add pharmacy bill"
      description={
        preview
          ? 'Check this is the right bill. Only the date can be changed.'
          : "Enter the bill id or bill number exactly as it appears on the pharmacy's receipt."
      }
      footer={
        preview ? (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button type="button" variant="outline" onClick={back} disabled={saving}>
              <ArrowLeft size={16} className="mr-1.5" />
              Back
            </Button>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={saving || !entryDate}>
                {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
                {saving ? 'Saving…' : 'Save bill'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={fetching}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="pharmacy-bill-add-form"
              disabled={fetching || !billId.trim() || blocked}
            >
              {fetching && <Loader2 size={16} className="mr-2 animate-spin" />}
              {fetching ? 'Fetching bill…' : 'Fetch bill'}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!preview ? (
          <form id="pharmacy-bill-add-form" onSubmit={fetchBill} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pharmacy-bill-id">
                Bill ID or bill number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pharmacy-bill-id"
                value={billId}
                onChange={e => setBillId(e.target.value)}
                disabled={fetching}
                placeholder="e.g. 34069611 or SI-KK-26-001558"
                autoFocus
              />
              <p className="text-xs text-muted">
                Nothing is saved yet — the bill is shown first so you can check it.
              </p>
            </div>

            {blocked && (
              <p className="text-xs text-destructive">
                This patient has no billing record yet, so a pharmacy bill cannot be added.
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted">Bill number</span>
                <p className="text-foreground font-medium">
                  {preview.head.entry_number || preview.external_bill_id}
                </p>
              </div>
              <div>
                <span className="text-muted">Bill patient / doctor</span>
                <p className="text-foreground font-medium">
                  {preview.head.patient_name || '—'}
                  {preview.head.doctor_name ? ` · ${preview.head.doctor_name}` : ''}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pharmacy-entry-date">Bill date</Label>
                <Input
                  id="pharmacy-entry-date"
                  type="date"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  disabled={saving}
                  className="max-w-[160px]"
                />
              </div>
              <div>
                <span className="text-muted">Amount</span>
                <p className="text-foreground font-semibold">{money(total)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-inset sticky top-0">
                  <tr>
                    {['Medicine', 'Batch', 'Pack', 'Expiry', 'Qty', 'MRP', 'Amount'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-3 py-2 text-xs font-medium text-foreground whitespace-nowrap ${
                          i >= 4 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-input-border">
                  {preview.items.map((item, index) => (
                    <tr key={`${item.product_name}-${item.batch_number}-${index}`}>
                      <td className="px-3 py-2 text-foreground">{item.product_name}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{item.batch_number || '—'}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{item.packing || '—'}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{item.expiry || '—'}</td>
                      <td className="px-3 py-2 text-foreground text-right">{item.sale_quantity}</td>
                      <td className="px-3 py-2 text-foreground text-right whitespace-nowrap">
                        {item.mrp != null ? money(Number(item.mrp)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-foreground text-right font-medium whitespace-nowrap">
                        {money(Number(item.net_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-inset font-semibold">
                    <td colSpan={6} className="px-3 py-2 text-right text-foreground">Total</td>
                    <td className="px-3 py-2 text-right text-foreground whitespace-nowrap">
                      {money(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
