'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import {
  PATIENT_STATUSES,
  STATUS_HINTS,
  STATUS_VARIANTS,
  type PatientStatus,
} from '@/lib/patients/constants'
import { hasPatientCapability } from '@/lib/patients/authz'
import { formatAge } from '@/lib/patients/age'
import { useUser } from '@/hooks/use-user'
import { AlertTriangle } from 'lucide-react'

/**
 * The read-only view of a patient record.
 *
 * Two things it used to show that were never real: an `email` field, which had
 * no column and therefore always read "N/A", and a status dropdown whose only
 * option wrote lowercase `'cancelled'` while the rest of the app wrote
 * `'Discharged'` and `'Active'`.
 *
 * It also never displayed `referred_by`, despite both patient forms collecting
 * it since the beginning.
 */

interface PatientInfoTabProps {
  patient: any
  onStatusChange?: (newStatus: string) => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="text-sm text-foreground font-medium text-right min-w-0 break-words">
        {children}
      </span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface-hover rounded-lg p-4 sm:p-6">
      <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">{children}</div>
    </section>
  )
}

const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default function PatientInfoTab({ patient, onStatusChange }: PatientInfoTabProps) {
  const { user } = useUser()
  const canWrite = hasPatientCapability(user?.role, 'patient:write')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!patient) {
    return <div className="text-muted">Loading patient information…</div>
  }

  const status = (patient.status || 'Active') as PatientStatus

  const changeStatus = async (next: string) => {
    if (next === status) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to update the status')
      onStatusChange?.(next)
    } catch (err: any) {
      // The old handler only console.error'd, so a rejected change looked
      // exactly like a successful one.
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const age = formatAge(patient)
  const emergency = [patient.emergency_contact_name, patient.emergency_contact_relation]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-0 sm:pr-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Block title="Patient information">
        <Row label="Full name">{patient.name || '—'}</Row>
        <Row label="Patient ID">{patient.patient_id || '—'}</Row>
        <Row label="Gender">{patient.gender || '—'}</Row>
        <Row label="Age">
          {age ? (
            <>
              {age} {patient.date_of_birth ? '' : <span className="text-muted">(stated)</span>}
            </>
          ) : (
            '—'
          )}
        </Row>
        <Row label="Date of birth">{date(patient.date_of_birth)}</Row>
        <Row label="Date of join">{date(patient.date_of_join)}</Row>
        <Row label="Blood group">{patient.blood_group || '—'}</Row>
        <Row label="Phone">{patient.phone || '—'}</Row>
        <Row label="Alternate phone">{patient.alternate_phone || '—'}</Row>
        <Row label="Email">{patient.email || '—'}</Row>
        <Row label="Referred by">{patient.referral?.name || '—'}</Row>
        <Row label="ID proof">
          {patient.id_proof_type
            ? [patient.id_proof_type, patient.id_proof_number].filter(Boolean).join(' · ')
            : '—'}
        </Row>
        <div className="md:col-span-2">
          <Row label="Address">{patient.address || '—'}</Row>
        </div>

        <div className="md:col-span-2 pt-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted">Status</div>
              <div className="text-xs text-muted mt-0.5">{STATUS_HINTS[status]}</div>
            </div>
            {canWrite ? (
              <Select
                value={status}
                onChange={e => changeStatus(e.target.value)}
                disabled={saving}
                className="sm:w-48"
              >
                {PATIENT_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            ) : (
              <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>{status}</Badge>
            )}
          </div>
        </div>
      </Block>

      <Block title="Medical information">
        <div className="md:col-span-2">
          <Row label="Medical history">
            <span className="whitespace-pre-wrap">{patient.medical_history || 'None recorded'}</span>
          </Row>
          <Row label="Allergies">
            <span className="whitespace-pre-wrap">{patient.allergies || 'None recorded'}</span>
          </Row>
          <Row label="Current medications">
            <span className="whitespace-pre-wrap">
              {patient.current_medications || 'None recorded'}
            </span>
          </Row>
          <Row label="Emergency contact">
            {emergency || patient.emergency_contact_phone
              ? [emergency, patient.emergency_contact_phone].filter(Boolean).join(' — ')
              : '—'}
          </Row>
        </div>
      </Block>

      <UpdatedStamp by={patient.updated_by_user?.username} at={patient.updated_at} />
    </div>
  )
}
