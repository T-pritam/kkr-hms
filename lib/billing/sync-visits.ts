/**
 * Rebuilds one bill's doctor-fee rows from its recorded visits — the logic of
 * POST /api/patients/[id]/settlements/sync, moved here unchanged so the
 * doctor's page can run it too (client, 28 Sep: pay a doctor without going
 * back to each patient). See that route for the reasoning.
 */

import { recalculatePatientBilling } from '@/lib/recalculate-billing'

type Db = { from: (table: string) => any }

/**
 * The agreed rate for a freshly-created bucket. Visit-entry no longer collects a
 * fee, so this is almost always 0 today — a new row is priced at settle time. Kept
 * for any visit still carrying a legacy `price_per_visit` from before that change.
 */
function rateFor(visits: any[]): number {
  const fees = visits.map(v => Number(v.price_per_visit) || 0).filter(f => f > 0)
  if (fees.length === 0) return 0
  return Math.max(...fees)
}

const bucketKey = (doctorId: string, purposeId: string | null) => `${doctorId}::${purposeId ?? ''}`

export interface SyncResult {
  created: { id: string; doctor_id: string; visit_purpose_id: string | null }[]
  updated: { id: string; doctor_id: string; visit_count: number }[]
  cleared: { id: string }[]
  buckets: number
}

export async function syncPatientVisits(
  db: Db,
  { patientId, billingId, userId }: { patientId: string; billingId: string; userId: string },
): Promise<SyncResult> {
  const supabase = db as any
  // Not-yet-billed visits. Every one of these is a candidate to join an
  // unsettled row — visits already linked to a settlement (settled or not) are
  // none of sync's business.
  const { data: unbilled } = await supabase
    .from('patient_consultations')
    .select('id, doctor_id, visit_purpose_id, price_per_visit')
    .eq('patient_id', patientId)
    .eq('billing_id', billingId)
    .is('deleted_at', null)
    .is('settlement_id', null)
    .order('consultation_date', { ascending: true })

  // Every live unsettled row for this cycle. At most one per (doctor, purpose)
  // by the partial unique index — settled rows for the same pair are history
  // and are deliberately not fetched here.
  const { data: unsettledRows } = await supabase
    .from('doctor_visit_settlements')
    .select('id, doctor_id, visit_purpose_id, amount_per_visit, visit_count')
    .eq('patient_billing_id', billingId)
    .eq('patient_id', patientId)
    .eq('settled', false)
    .is('deleted_at', null)

  const existingByKey = new Map<string, any>(
    (unsettledRows ?? []).map((row: any) => [bucketKey(row.doctor_id, row.visit_purpose_id), row] as [string, any]),
  )

  // Visits with no doctor are invisible to billing and always were.
  const buckets = new Map<string, { doctor_id: string; visit_purpose_id: string | null; visits: any[] }>()
  for (const visit of unbilled ?? []) {
    if (!visit.doctor_id) continue
    const key = bucketKey(visit.doctor_id, visit.visit_purpose_id)
    const bucket = buckets.get(key) ?? { doctor_id: visit.doctor_id, visit_purpose_id: visit.visit_purpose_id, visits: [] as any[] }
    bucket.visits.push(visit)
    buckets.set(key, bucket)
  }

  const created: any[] = []

  // Every unsettled row relevant this run, with the doctor and the rate it
  // should be priced at — built as rows are matched or created, so the recompute
  // pass below never has to reverse-engineer which bucket a row came from.
  const rowInfo = new Map<string, { doctor_id: string; amount_per_visit: number; isNew: boolean }>()
  for (const row of unsettledRows ?? []) {
    rowInfo.set(row.id, {
      doctor_id: row.doctor_id,
      amount_per_visit: Number(row.amount_per_visit) || 0,
      isNew: false,
    })
  }

  for (const [key, bucket] of buckets) {
    const match = existingByKey.get(key)
    const ids = bucket.visits.map(v => v.id)

    if (match) {
      const { error } = await supabase
        .from('patient_consultations')
        .update({ settlement_id: match.id })
        .in('id', ids)
      if (error) throw error
      continue
    }

    const rate = rateFor(bucket.visits)
    const { data: inserted, error } = await supabase
      .from('doctor_visit_settlements')
      .insert({
        patient_id: patientId,
        doctor_id: bucket.doctor_id,
        visit_purpose_id: bucket.visit_purpose_id,
        patient_billing_id: billingId,
        visit_count: 0,
        amount_per_visit: rate,
        total_amount: 0,
        // Explicit rather than left to the column default: the very next
        // query this same run may need to find this row again via
        // `.eq('settled', false)`, and that has to be a real value, not
        // whatever a client happens to see before the row round-trips.
        settled: false,
        settlement_type: 'regular',
        created_by: userId,
      })
      .select('id')
      .single()

    if (error) throw error

    const { error: linkError } = await supabase
      .from('patient_consultations')
      .update({ settlement_id: inserted.id })
      .in('id', ids)
    if (linkError) throw linkError

    created.push({ id: inserted.id, doctor_id: bucket.doctor_id, visit_purpose_id: bucket.visit_purpose_id })
    rowInfo.set(inserted.id, { doctor_id: bucket.doctor_id, amount_per_visit: rate, isNew: true })
  }

  // Recompute every live unsettled row for the cycle — not just the ones a
  // bucket touched this run — so a row whose linked visits shrank (one was
  // soft-deleted since the last sync) is caught too.
  const allIds = [...rowInfo.keys()]

  const { data: linkedCounts } = allIds.length
    ? await supabase
        .from('patient_consultations')
        .select('settlement_id')
        .in('settlement_id', allIds)
        .is('deleted_at', null)
    : { data: [] as any[] }

  const countBySettlement = new Map<string, number>()
  for (const row of linkedCounts ?? []) {
    countBySettlement.set(row.settlement_id, (countBySettlement.get(row.settlement_id) ?? 0) + 1)
  }

  const originalCount = new Map((unsettledRows ?? []).map((r: any) => [r.id, r.visit_count] as [string, number]))
  const updated: any[] = []
  const cleared: any[] = []

  for (const [id, info] of rowInfo) {
    const count = countBySettlement.get(id) ?? 0

    // A freshly-created row always needs its placeholder count/total written.
    // A pre-existing one only needs writing — and reporting — if its count
    // actually moved.
    if (!info.isNew && originalCount.get(id) === count) continue

    const { error } = await supabase
      .from('doctor_visit_settlements')
      .update({
        visit_count: count,
        total_amount: info.amount_per_visit * count,
        updated_by: userId,
      })
      .eq('id', id)
    if (error) throw error

    if (!info.isNew) {
      if (count === 0) cleared.push({ id })
      else updated.push({ id, doctor_id: info.doctor_id, visit_count: count })
    }
  }

  await recalculatePatientBilling(supabase, billingId)

  return { created, updated, cleared, buckets: buckets.size }
}
