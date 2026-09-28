/**
 * /api/doctors/[id]/unpaid — what this doctor is still owed, per patient and
 * purpose (client, 28 Sep: pay a doctor from the doctor's page instead of
 * going back to every patient, syncing and pricing there).
 *
 *   GET   the unpaid fee rows, and how many visits are not billed yet
 *         (`payout:read`, like the rest of the doctor's report)
 *   POST  first syncs every bill that has an unbilled visit of this doctor —
 *         the same sync as the patient's "Sync Visits" — then answers as GET
 *         (`doctor-fee:write`, the desk that prices and pays)
 *
 * Paying and editing go through the fee routes the patient page already uses
 * (/api/doctor-settlements/[id]), so every rule there still applies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { syncPatientVisits } from '@/lib/billing/sync-visits'
import { opdPatient } from '@/lib/ledger/opd'

type Db = Awaited<ReturnType<typeof createClient>>

async function unpaidFor(db: Db, doctorId: string) {
  const { data: rows, error } = await db
    .from('doctor_visit_settlements')
    .select(
      'id, patient_id, patient_billing_id, visit_count, amount_per_visit, total_amount, settlement_type, settlement_notes, ' +
        'doctor:doctors(id, name), purpose:visit_purposes(id, name), patient:patients(id, patient_id, name), ' +
        'opd:daily_ledger_transactions!opd_ledger_transaction_id(id, description)',
    )
    .eq('doctor_id', doctorId)
    .eq('settled', false)
    .is('deleted_at', null)
  if (error) throw error

  const { data: unbilled } = await db
    .from('patient_consultations')
    .select('id')
    .eq('doctor_id', doctorId)
    .is('deleted_at', null)
    .is('settlement_id', null)
    // A visit on no bill (very old data) can never be synced, so it is not
    // "waiting" for anything.
    .not('billing_id', 'is', null)

  const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
  const fees = ((rows ?? []) as any[])
    .filter(r => Number(r.visit_count) > 0)
    .map(r => ({
      id: r.id,
      patient_id: r.patient_id,
      patient: one(r.patient) ?? opdPatient(one(r.opd)),
      opd: !r.patient_id,
      purpose: one(r.purpose)?.name ?? null,
      doctor: one(r.doctor),
      visit_count: Number(r.visit_count) || 0,
      amount_per_visit: Number(r.amount_per_visit) || 0,
      total_amount: Number(r.total_amount) || 0,
      settlement_type: r.settlement_type,
      settlement_notes: r.settlement_notes,
    }))
    .sort((a, b) => String(a.patient?.patient_id ?? '').localeCompare(String(b.patient?.patient_id ?? '')))

  return { fees, unbilled_visits: (unbilled ?? []).length }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireBilling(request, 'payout:read')
    if (auth.response) return auth.response
    const { id } = await params
    const db = await createClient()
    return NextResponse.json(await unpaidFor(db, id))
  } catch (error: any) {
    console.error('Error listing unpaid doctor fees:', error)
    return NextResponse.json({ error: error.message || 'Failed to list the unpaid fees' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireBilling(request, 'doctor-fee:write')
    if (auth.response) return auth.response
    const { id } = await params
    const db = await createClient()

    // Every bill with a visit of this doctor that no fee row has picked up yet.
    const { data: visits, error } = await db
      .from('patient_consultations')
      .select('patient_id, billing_id')
      .eq('doctor_id', id)
      .is('deleted_at', null)
      .is('settlement_id', null)
    if (error) throw error

    const bills = new Map<string, string>()
    for (const v of (visits ?? []) as any[]) {
      if (v.patient_id && v.billing_id) bills.set(v.billing_id, v.patient_id)
    }
    for (const [billingId, patientId] of bills) {
      await syncPatientVisits(db, { patientId, billingId, userId: auth.user.id })
    }

    return NextResponse.json({ ...(await unpaidFor(db, id)), synced_bills: bills.size })
  } catch (error: any) {
    console.error('Error syncing a doctor\'s unpaid fees:', error)
    return NextResponse.json({ error: error.message || 'Failed to sync the doctor\'s visits' }, { status: 500 })
  }
}
