'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'

/**
 * Attaching a pharmacy bill by id.
 *
 * Deliberately not the regular charge form — there is no catalogue entry to
 * pick and nothing to price by hand. One field: the bill id or bill number,
 * exactly as it appears on the pharmacy's own receipt. Everything else
 * (medicines, amount, GST) comes back from the fetch and is stored as-is; if
 * the wrong bill gets attached, the fix is deleting the row and adding the
 * right one, not editing this one.
 */

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  patientId: string
  billingId: string | null
}

export function PharmacyBillAddModal({ isOpen, onClose, onSuccess, patientId, billingId }: Props) {
  const [billId, setBillId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setBillId('')
    setError('')
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!billingId) return

    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/patients/${patientId}/pharmacy-bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_id: billId, patient_billing_id: billingId }),
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Add pharmacy bill"
      description="Enter the bill id or bill number exactly as it appears on the pharmacy's receipt."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="pharmacy-bill-add-form" disabled={saving || !billId.trim() || !billingId}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            {saving ? 'Fetching bill…' : 'Fetch & add'}
          </Button>
        </div>
      }
    >
      <form id="pharmacy-bill-add-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pharmacy-bill-id">
            Bill ID or bill number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pharmacy-bill-id"
            value={billId}
            onChange={e => setBillId(e.target.value)}
            disabled={saving}
            placeholder="e.g. 34069611 or SI-KK-26-001558"
            autoFocus
          />
          <p className="text-xs text-muted">
            This is fetched once and stored here — if it&apos;s the wrong bill, delete the row afterward and add the correct one.
          </p>
        </div>

        {!billingId && (
          <p className="text-xs text-destructive">
            This patient has no billing record yet, so a pharmacy bill cannot be added.
          </p>
        )}
      </form>
    </Modal>
  )
}
