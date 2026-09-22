'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2 } from 'lucide-react'
import { ReferralSelect } from './referral-select'

/**
 * The referral person and their commission on this stay.
 *
 * It used to set a base charge (a package) and two "included in package"
 * ticks as well. PRD v2 CR-15 removed the package: nothing is pre-decided,
 * charges are internal, and the referral commission is always the patient's
 * expense — paid out of their payments, never billed to them.
 */

interface SetChargesModalProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  billing: any
  onSuccess: () => void
}

interface ReferralForm {
  referral_commission_amount: string
  referral_id: string
}

const toAmountStr = (raw: any) => {
  const n = parseInt(raw ?? 0, 10)
  return isNaN(n) ? '0' : String(n)
}

export function SetChargesModal({ isOpen, onClose, patientId, billing, onSuccess }: SetChargesModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<ReferralForm>({
    referral_commission_amount: '0',
    referral_id: '',
  })

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setForm({
      referral_commission_amount: toAmountStr(billing?.referral_commission_amount),
      referral_id: billing?.referral?.id || '',
    })
  }, [isOpen, billing])

  const save = async (isDelete = false) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing.id,
          referral_id: isDelete ? null : form.referral_id,
          referral_commission_amount: isDelete ? 0 : parseInt(form.referral_commission_amount, 10) || 0,
        }),
      })

      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body?.error || 'Failed to update the referral')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Referral & commission"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => save(true)} disabled={loading}>
            {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
            Clear
          </Button>
          <Button type="submit" form="set-charges-form" disabled={loading}>
            {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <form
        id="set-charges-form"
        onSubmit={e => {
          e.preventDefault()
          save(false)
        }}
        className="space-y-4"
      >
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <ReferralSelect
            value={form.referral_id}
            onChange={value => setForm({ ...form, referral_id: value })}
          />
          <p className="text-xs text-muted">Optional.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="charges-commission">Referral commission (₹)</Label>
          <Input
            id="charges-commission"
            type="text"
            inputMode="numeric"
            value={form.referral_commission_amount}
            onFocus={e => e.target.select()}
            onChange={e => {
              if (/^\d*$/.test(e.target.value)) {
                setForm({ ...form, referral_commission_amount: e.target.value })
              }
            }}
            onBlur={() => setForm(prev => ({ ...prev, referral_commission_amount: toAmountStr(prev.referral_commission_amount) }))}
          />
          <p className="text-xs text-muted">
            Paid to the referrer out of the patient&apos;s payments — an expense of this patient, never
            billed to them.
          </p>
        </div>
      </form>
    </Modal>
  )
}
