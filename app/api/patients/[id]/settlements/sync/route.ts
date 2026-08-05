/**
 * Rebuilds a patient's doctor settlements from their recorded visits.
 *
 * Grouping is by (doctor, purpose), as it was in the previous rewrite. What
 * changes here is how a visit is matched to a settlement: `patient_consultations
 * .settlement_id` now records which settlement (if any) has already billed a
 * visit. Sync only ever gathers visits where that is null — "not yet billed" —
 * and attaches them to the one live *unsettled* row for their (doctor, purpose),
 * creating one if none exists.
 *
 * This is what fixes the bug the old count-based matching had: settle two visits
 * of a doctor+purpose, then record two more of the same pair. The old code found
 * the same (now settled) row by key and either skipped it or — worse, before that
 * — silently changed a paid amount. Neither is right; the two new visits are
 * simply unbilled. Now, because the settled row's visits are linked to it and the
 * new ones are not, the new pair has nothing unsettled to attach to and starts a
 * fresh row. The database enforces this shape: a partial unique index allows at
 * most one live *unsettled* row per (cycle, doctor, purpose), but any number of
 * settled ones alongside it — see 20260809000002_settlement_visit_linking.sql.
 *
 * Every live unsettled row for the cycle has its count recomputed on every run —
 * touched by new visits or not — which is what keeps a row honest if one of its
 * visits was soft-deleted since the last sync (previously BUGS #30), with no
 * special-casing needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/verify'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can sync doctor visits' }, { status: 403 })
    }

    const supabase = await createClient()
    const { id: patientId } = await params
    const body = await request.json().catch(() => ({}))
    const billingId = body.billing_id

    if (!billingId) {
      return NextResponse.json({ error: 'billing_id is required' }, { status: 400 })
    }

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

    const existingByKey = new Map(
      (unsettledRows ?? []).map(row => [bucketKey(row.doctor_id, row.visit_purpose_id), row]),
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
          created_by: authResult.user.id,
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

    const originalCount = new Map((unsettledRows ?? []).map(r => [r.id, r.visit_count]))
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
          updated_by: authResult.user.id,
        })
        .eq('id', id)
      if (error) throw error

      if (!info.isNew) {
        if (count === 0) cleared.push({ id })
        else updated.push({ id, doctor_id: info.doctor_id, visit_count: count })
      }
    }

    await recalculatePatientBilling(supabase, billingId)

    const parts = [`Created: ${created.length}`, `Updated: ${updated.length}`]
    if (cleared.length) parts.push(`Cleared: ${cleared.length}`)

    return NextResponse.json(
      {
        success: true,
        created,
        updated,
        cleared,
        total_settlements: buckets.size,
        message: `Doctor visits synced. ${parts.join(', ')}.`,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error syncing doctor visits:', error)
    return NextResponse.json(
      { error: 'Failed to sync doctor visits', details: String(error) },
      { status: 500 },
    )
  }
}
