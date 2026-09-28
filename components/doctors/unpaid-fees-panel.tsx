'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/hooks/use-user'
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch'
import { EditDoctorFeeModal, PayDoctorFeeModal, type DoctorFeeRow } from '@/components/billing/doctor-fee-modals'

/**
 * What a doctor is still owed, per patient and purpose, with Pay and Edit right
 * here (client, 28 Sep) — no trip back to each patient to sync and settle.
 *
 * Opening the page as the desk (admin or reception) syncs first: any visit not
 * yet on a fee row gets one, exactly as the patient's "Sync Visits" does. The
 * forms are the ones the patient's Billing tab uses.
 */

interface UnpaidFee extends DoctorFeeRow {
  patient_id: string | null
  patient: { id: string | null; patient_id: string | null; name: string | null } | null
  purpose: string | null
}

const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`

export function UnpaidFeesPanel({ doctorId, onChanged }: { doctorId: string; onChanged?: () => void }) {
  const { user } = useUser()
  const canPay = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST'

  const [fees, setFees] = useState<UnpaidFee[]>([])
  const [unbilled, setUnbilled] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState<UnpaidFee | null>(null)
  const [editing, setEditing] = useState<UnpaidFee | null>(null)

  const load = useCallback(
    async (sync: boolean) => {
      try {
        const res = await fetch(`/api/doctors/${doctorId}/unpaid`, { method: sync ? 'POST' : 'GET' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || 'Failed to load what is owed')
        setFees(body.fees ?? [])
        setUnbilled(body.unbilled_visits ?? 0)
        setError('')
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [doctorId],
  )

  // Sync once when the desk opens the page; after that, just re-read.
  useEffect(() => {
    if (user) void load(canPay)
  }, [user, canPay, load])
  const reread = useCallback(() => void load(false), [load])
  useRealtimeRefetch(['doctor_visit_settlements'], reread)

  const done = async () => {
    setPaying(null)
    setEditing(null)
    await load(false)
    onChanged?.()
  }

  const withSubtitle = (fee: UnpaidFee): DoctorFeeRow => ({
    ...fee,
    subtitle: [fee.patient?.patient_id, fee.patient?.name, fee.purpose].filter(Boolean).join(' · '),
  })

  return (
    <div className="bg-surface rounded-lg border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Still to pay</h2>
        <span className="text-sm text-muted">
          {loading
            ? 'Loading…'
            : `${fees.length} row${fees.length === 1 ? '' : 's'} · ${inr(fees.reduce((s, f) => s + (Number(f.total_amount) || 0), 0))} priced`}
          {!loading && unbilled > 0 && ` · ${unbilled} visit${unbilled === 1 ? '' : 's'} not billed yet`}
        </span>
      </div>

      {error && <p className="px-4 py-3 text-sm text-destructive">{error}</p>}

      {!loading && fees.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">Nothing is owed to this doctor.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted uppercase">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left">Patient</th>
                <th className="px-4 py-2 text-left">Purpose</th>
                <th className="px-4 py-2 text-right">Visits</th>
                <th className="px-4 py-2 text-right">Fee</th>
                {canPay && <th className="px-4 py-2 text-right sticky right-0 bg-surface">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fees.map(fee => (
                <tr key={fee.id}>
                  <td className="px-4 py-2.5">
                    {fee.patient && !fee.patient.id ? (
                      <span className="text-foreground">{fee.patient.patient_id} · {fee.patient.name}</span>
                    ) : fee.patient ? (
                      <Link href={`/patients/${fee.patient.id}`} className="text-info hover:underline">
                        {fee.patient.patient_id} {fee.patient.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{fee.purpose || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{fee.visit_count}</td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(fee.total_amount) > 0 ? (
                      <span className="font-medium text-foreground">{inr(Number(fee.total_amount))}</span>
                    ) : (
                      <span className="text-warning-text">not set</span>
                    )}
                  </td>
                  {canPay && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap sticky right-0 bg-surface">
                      <button onClick={() => setEditing(fee)} className="text-info text-sm font-medium mr-3">
                        Edit
                      </button>
                      <button onClick={() => setPaying(fee)} className="text-success-text text-sm font-medium">
                        Pay
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paying && <PayDoctorFeeModal fee={withSubtitle(paying)} onClose={() => setPaying(null)} onPaid={done} />}
      {editing && <EditDoctorFeeModal fee={withSubtitle(editing)} onClose={() => setEditing(null)} onSaved={done} />}
    </div>
  )
}
