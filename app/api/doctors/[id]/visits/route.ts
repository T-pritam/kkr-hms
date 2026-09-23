/**
 * GET /api/doctors/[id]/visits?from=&to=&purpose_id=&settled=
 *
 * One doctor's visits, with the money beside each one: which patient, when, what
 * the visit was for, what it was priced at, and — once the fee has been paid —
 * when, by whom, and how.
 *
 * Nothing answered this before. Every consultation read in the app is scoped to
 * one patient, so "what has Dr Rao done, and what have we paid him" meant
 * opening patients one at a time.
 *
 * **Payment is per settlement, not per visit.** A `doctor_visit_settlements`
 * row covers all the visits of one doctor, for one purpose, in one billing
 * cycle; a visit points at it through `patient_consultations.settlement_id`
 * (null until a sync bills it). So each visit's own money is the settlement's
 * `amount_per_visit`, and the payment columns are read off the settlement.
 *
 * `patient_consultations.price_per_visit` is *not* used: visit entry stopped
 * collecting it, so it is 0 on almost every row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { toISTInstant } from '@/lib/consultations/ist'

const num = (v: unknown) => Number(v) || 0
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

const SELECT = `
  id, consultation_date, notes, patient_id, settlement_id,
  patient:patients(id, patient_id, name),
  visit_purpose:visit_purposes(id, code, name),
  settlement:doctor_visit_settlements!settlement_id(
    id, amount_per_visit, total_amount, visit_count, settled,
    settlement_date, settlement_amount, payment_method, transaction_reference,
    settlement_type, given_by,
    settled_by_user:users!settled_by(id, username)
  )
`

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // The same people who may price and pay a doctor's fee may read what he
    // was paid: admin, doctor, reception (lib/billing/authz.ts).
    const auth = await requireBilling(request, 'payout:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: doctorId } = await params
    const search = request.nextUrl.searchParams

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, name, specialist, department, is_active')
      .eq('id', doctorId)
      .maybeSingle()

    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    let query = supabase
      .from('patient_consultations')
      .select(SELECT)
      .eq('doctor_id', doctorId)
      .is('deleted_at', null)

    /**
     * `consultation_date` is an instant, displayed as IST wall clock. A plain
     * `.gte(from)` would compare a day against a UTC instant and drop an
     * evening visit into the previous day — the bug lib/consultations/ist.ts
     * exists to prevent. So the day range is converted to IST bounds first.
     */
    const from = search.get('from')
    const to = search.get('to')
    if (from) query = query.gte('consultation_date', toISTInstant(from, '00:00'))
    if (to) query = query.lte('consultation_date', toISTInstant(to, '23:59'))

    const purposeId = search.get('purpose_id')
    if (purposeId) query = query.eq('visit_purpose_id', purposeId)

    const { data, error } = await query.order('consultation_date', { ascending: false })
    if (error) throw error

    const rows = (data ?? []).map((row: any) => {
      const settlement = one<any>(row.settlement)
      const purpose = one<any>(row.visit_purpose)
      const paid = Boolean(settlement?.settled)

      return {
        id: row.id,
        consultation_date: row.consultation_date,
        notes: row.notes,
        patient: one<any>(row.patient),
        purpose: purpose ? { id: purpose.id, name: purpose.name } : null,
        // What this one visit was worth. An unbilled visit has no fee yet.
        fee: settlement ? num(settlement.amount_per_visit) : null,
        billed: Boolean(row.settlement_id),
        paid,
        payment: settlement
          ? {
              settlement_id: settlement.id,
              settled: paid,
              settled_on: settlement.settlement_date ?? null,
              settled_by: one<any>(settlement.settled_by_user)?.username ?? settlement.given_by ?? null,
              payment_method: settlement.payment_method ?? null,
              transaction_reference: settlement.transaction_reference ?? null,
              settlement_total: num(settlement.settlement_amount ?? settlement.total_amount),
            }
          : null,
      }
    })

    /**
     * Subtotals are computed here, not in the browser, so the screen, the CSV
     * and the PDF are all reading the same arithmetic — the convention the
     * advance log set (app/api/employees/advances/route.ts).
     */
    const byPurpose = new Map<string, { purpose: string; visits: number; paid: number; unpaid: number }>()
    let feesPaid = 0
    let feesPending = 0
    let unbilled = 0

    for (const row of rows) {
      const key = row.purpose?.name ?? 'Not recorded'
      const bucket = byPurpose.get(key) ?? { purpose: key, visits: 0, paid: 0, unpaid: 0 }
      bucket.visits += 1

      const fee = row.fee ?? 0
      if (!row.billed) unbilled += 1
      else if (row.paid) {
        bucket.paid += fee
        feesPaid += fee
      } else {
        bucket.unpaid += fee
        feesPending += fee
      }

      byPurpose.set(key, bucket)
    }

    // The filter is applied after the fact, like the advance log's own joined
    // filters: PostgREST cannot filter an embed without turning it into an
    // inner join and silently dropping the unbilled visits.
    const settledFilter = search.get('settled')
    const filtered =
      settledFilter === 'true' ? rows.filter(r => r.paid)
      : settledFilter === 'false' ? rows.filter(r => !r.paid)
      : rows

    return NextResponse.json({
      success: true,
      doctor,
      data: filtered,
      by_purpose: [...byPurpose.values()].sort((a, b) => b.visits - a.visits),
      summary: {
        visits: rows.length,
        fees_paid: feesPaid,
        fees_pending: feesPending,
        unbilled_visits: unbilled,
        from: from || null,
        to: to || null,
      },
    })
  } catch (error: any) {
    console.error("Error loading the doctor's visits:", error)
    return NextResponse.json(
      { error: error.message || 'Failed to load the visits' },
      { status: 500 }
    )
  }
}
