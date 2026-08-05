'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'

/**
 * A doctor's rate card: what they are paid for each kind of visit.
 *
 * This is what makes a consultation worth 300 and an operation 5,000 for the same
 * doctor. The visit form prefills from it and the amount stays editable there, so
 * this screen sets the default rather than the price.
 *
 * A blank field means "no agreed rate", which is deliberately not the same as
 * zero — zero is a real answer ("this doctor does ward rounds free") and the two
 * must stay distinguishable. Clearing a field removes the rate card row entirely.
 */

interface ScheduleRow {
  visit_purpose_id: string
  code: string
  name: string
  fee: number | null
  default_fee: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  doctor: { id: string; name: string } | null
}

export function FeeScheduleModal({ isOpen, onClose, doctor }: Props) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [fees, setFees] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!isOpen || !doctor) return

    let cancelled = false
    setLoading(true)
    setError('')
    setNotice('')

    const load = async () => {
      try {
        const res = await fetch(`/api/doctors/${doctor.id}/fee-schedule`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load the fee schedule')
        if (cancelled) return

        const schedule: ScheduleRow[] = json.schedule || []
        setRows(schedule)
        setFees(
          Object.fromEntries(
            schedule.map(row => [row.visit_purpose_id, row.fee === null ? '' : String(row.fee)]),
          ),
        )
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [isOpen, doctor])

  const save = async () => {
    if (!doctor) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const res = await fetch(`/api/doctors/${doctor.id}/fee-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: rows.map(row => ({
            visit_purpose_id: row.visit_purpose_id,
            // '' clears the row; '0' is a rate of zero. Number('') is 0, which is
            // exactly the conflation the API is careful to avoid, so send the
            // blank through untouched.
            fee: fees[row.visit_purpose_id] === '' ? null : Number(fees[row.visit_purpose_id]),
          })),
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to save the fee schedule')

      setNotice(body.message || 'Fee schedule saved')
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
      title={doctor ? `Fee schedule — ${doctor.name}` : 'Fee schedule'}
      description="What this doctor is paid for each kind of visit. Prefilled into the visit form and editable there."
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
            Save schedule
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto animate-spin text-muted" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-md bg-info-subtle border border-info/30 text-info-text text-sm">
              {notice}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-muted">
              No visit purposes are set up yet, so there is nothing to price.
            </p>
          ) : (
            <>
              {rows.map(row => (
                <div key={row.visit_purpose_id} className="flex items-center gap-3">
                  <Label htmlFor={`fee-${row.visit_purpose_id}`} className="flex-1">
                    {row.name}
                    {row.default_fee > 0 && (
                      <span className="block text-xs text-muted">
                        Hospital default ₹{row.default_fee.toLocaleString('en-IN')}
                      </span>
                    )}
                  </Label>
                  <Input
                    id={`fee-${row.visit_purpose_id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-36"
                    placeholder="No rate"
                    value={fees[row.visit_purpose_id] ?? ''}
                    onFocus={e => e.target.select()}
                    onChange={e =>
                      setFees(prev => ({ ...prev, [row.visit_purpose_id]: e.target.value }))
                    }
                    disabled={saving}
                  />
                </div>
              ))}

              <p className="text-xs text-muted">
                Leave a field blank for no agreed rate — the visit form will then ask for the
                amount. A rate of 0 is treated as a real figure, not a blank.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
