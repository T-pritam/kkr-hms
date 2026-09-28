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
import { requireBilling } from '@/lib/billing/authz'
import { syncPatientVisits } from '@/lib/billing/sync-visits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    /**
     * Reception syncs too. It prices and pays doctor fees (CR-04), and sync is
     * what creates the row to price — without it the desk could edit a fee but
     * never raise one, which made "reception may price an unsettled fee"
     * half a feature.
     */
    const auth = await requireBilling(request, 'doctor-fee:write')
    if (auth.response) return auth.response
    const authResult = { user: auth.user }

    const supabase = await createClient()
    const { id: patientId } = await params
    const body = await request.json().catch(() => ({}))
    const billingId = body.billing_id

    if (!billingId) {
      return NextResponse.json({ error: 'billing_id is required' }, { status: 400 })
    }

    const { created, updated, cleared, buckets } = await syncPatientVisits(supabase, {
      patientId,
      billingId,
      userId: authResult.user.id,
    })

    const parts = [`Created: ${created.length}`, `Updated: ${updated.length}`]
    if (cleared.length) parts.push(`Cleared: ${cleared.length}`)

    return NextResponse.json(
      {
        success: true,
        created,
        updated,
        cleared,
        total_settlements: buckets,
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
