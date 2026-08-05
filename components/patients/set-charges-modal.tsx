'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2 } from 'lucide-react'
import { ReferralSelect } from './referral-select'

interface SetChargesModalProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  billing: any
  onSuccess: () => void
}

interface ChargesForm {
  base_charge: string
  referral_commission_amount: string
  referral_id: string
  referral_commission_included_in_package: boolean
  doctor_fees_included_in_package: boolean
}

const toAmountStr = (raw: any) => {
  const n = parseInt(raw ?? 0, 10)
  return isNaN(n) ? '0' : String(n)
}

export function SetChargesModal({ isOpen, onClose, patientId, billing, onSuccess }: SetChargesModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<ChargesForm>({
    base_charge: '0',
    referral_commission_amount: '0',
    referral_id: '',
    referral_commission_included_in_package: false,
    doctor_fees_included_in_package: false,
  })

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setForm({
      base_charge: toAmountStr(billing?.base_charge),
      referral_commission_amount: toAmountStr(billing?.referral_commission_amount),
      referral_id: billing?.referral?.id || '',
      referral_commission_included_in_package: billing?.referral_commission_included_in_package ?? false,
      doctor_fees_included_in_package: billing?.doctor_fees_included_in_package ?? false,
    })
  }, [isOpen, billing])

  // Live, so clearing the base charge disables the ticks as you type rather than
  // after a save.
  const hasPackage = (parseInt(form.base_charge, 10) || 0) > 0

  const save = async (isDelete = false) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing.id,
          base_charge: isDelete ? 0 : parseInt(form.base_charge, 10) || 0,
          referral_id: isDelete ? null : form.referral_id,
          referral_commission_amount: isDelete ? 0 : parseInt(form.referral_commission_amount, 10) || 0,
          // A tick can only be sent when there is a package to be inside of. The
          // server enforces this too; sending it honestly keeps the two agreeing.
          referral_commission_included_in_package:
            isDelete || !hasPackage ? false : form.referral_commission_included_in_package,
          doctor_fees_included_in_package:
            isDelete || !hasPackage ? false : form.doctor_fees_included_in_package,
        }),
      })

      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body?.error || 'Failed to update charges')
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
      title="Set charges"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => save(true)} disabled={loading}>
            {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
            Delete
          </Button>
          <Button type="submit" form="set-charges-form" disabled={loading}>
            {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
            Save charges
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
          <Label htmlFor="charges-base">Base charge (₹)</Label>
          <p className="text-xs text-muted">
            Optional. Leave it at 0 to bill this patient purely from itemised charges.
          </p>
          <Input
            id="charges-base"
            type="text"
            inputMode="numeric"
            value={form.base_charge}
            onFocus={e => e.target.select()}
            onChange={e => {
              if (/^\d*$/.test(e.target.value)) {
                setForm({ ...form, base_charge: e.target.value })
              }
            }}
            onBlur={() => setForm(prev => ({ ...prev, base_charge: toAmountStr(prev.base_charge) }))}
          />
        </div>

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
        </div>

        {/*
          Both ticks describe what the base charge already covers, so with no base
          charge there is no package for anything to be inside of. Disabled rather
          than hidden: a tick that vanishes when a number is cleared reads as a
          bug, whereas a disabled one with a reason explains itself. The server
          forces them false in this state regardless.
        */}
        {!hasPackage && (
          <div className="rounded-md bg-info-subtle border border-info/30 p-3 text-xs text-info-text">
            No base charge, so there is no package. Charges, doctor fees and payments are
            billed as they are entered, and the referral commission below is a payout to the
            referrer — it is not billed to this patient.
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="commission_included"
              checked={hasPackage && form.referral_commission_included_in_package}
              disabled={!hasPackage}
              onChange={e => setForm({ ...form, referral_commission_included_in_package: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
            />
            <label
              htmlFor="commission_included"
              className={`text-sm ${hasPackage ? 'text-foreground' : 'text-muted'}`}
            >
              Commission included in package
            </label>
          </div>
          <p className="text-xs text-muted pl-6">
            {hasPackage ? (
              <>
                On: this amount is already part of the base charge and won&apos;t be added again to the total.
                Off: billed as a separate line item on top of the base charge.
              </>
            ) : (
              <>Needs a base charge. The commission is a payout only and is not billed to the patient.</>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="doctor_fees_included"
              checked={hasPackage && form.doctor_fees_included_in_package}
              disabled={!hasPackage}
              onChange={e => setForm({ ...form, doctor_fees_included_in_package: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
            />
            <label
              htmlFor="doctor_fees_included"
              className={`text-sm ${hasPackage ? 'text-foreground' : 'text-muted'}`}
            >
              Doctor fees included in package
            </label>
          </div>
          <p className="text-xs text-muted pl-6">
            {hasPackage ? (
              <>
                On: doctor visit fees are already part of the base charge and won&apos;t be added again to the total.
                Off: billed as a separate line item on top of the base charge.
              </>
            ) : (
              <>Needs a base charge. Doctor fees are billed as they are recorded.</>
            )}
          </p>
        </div>
      </form>
    </Modal>
  )
}