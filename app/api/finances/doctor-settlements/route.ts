import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { payDoctorFee, validatePayout } from '@/lib/billing/payouts'
import { istToday } from '@/lib/dates/ist'

/**
 * GET /api/finances/doctor-settlements
 * Query params: settled (true/false), doctor_id, patient_id
 * Returns doctor visit settlements with details
 */
export async function GET(request: NextRequest) {
  try {
    // Reading the fee rows is what the desk prices from, so it follows
    // charge:read like the rest of a patient's billing (CR-04).
    const auth = await requireBilling(request, 'payout:read')
    if (auth.response) return auth.response

    const searchParams = request.nextUrl.searchParams
    const settled = searchParams.get('settled')
    const doctorId = searchParams.get('doctor_id')
    const patientId = searchParams.get('patient_id')

    const supabase = await createClient()

    let query = supabase
      .from('doctor_visit_settlements')
      .select(`
        *,
        doctor:doctors(*),
        visit_purpose:visit_purposes(id, code, name),
        patient:patients(*)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (settled !== null) {
      query = query.eq('settled', settled === 'true')
    }

    if (doctorId) {
      query = query.eq('doctor_id', doctorId)
    }

    if (patientId) {
      query = query.eq('patient_id', patientId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error: any) {
    console.error('Error fetching doctor settlements:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch doctor settlements',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/finances/doctor-settlements
 * Settle one or more doctor visit settlements
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'payout:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const { settlement_ids, settlement_amount } = body

    if (!settlement_ids || !Array.isArray(settlement_ids) || settlement_ids.length === 0) {
      return NextResponse.json({ error: 'settlement_ids array is required' }, { status: 400 })
    }

    // One amount cannot describe several settlements. The old code applied
    // `settlement_amount` to every selected row and booked a ledger debit of that
    // size for each — select three fees and pay one figure, and the hospital
    // records paying it three times. Each row settles at its own total unless a
    // single settlement is named.
    if (settlement_amount !== undefined && settlement_amount !== null && settlement_ids.length > 1) {
      return NextResponse.json(
        {
          error:
            'A settlement amount can only be given when settling one fee at a time. Settle them individually, or omit the amount to pay each at its own total.',
        },
        { status: 400 }
      )
    }

    const details = validatePayout({
      payment_method: body.payment_method,
      transaction_reference: body.transaction_reference,
      notes: body.settlement_notes,
      given_by_user_id: body.given_by_user_id,
      given_by: body.given_by,
    })
    if (!details.ok) {
      return NextResponse.json(
        { error: details.error, fieldErrors: details.fieldErrors },
        { status: details.status }
      )
    }

    const supabase = await createClient()

    // Read first, so each row's own total is known before it is overwritten, and
    // so already-settled ids are excluded exactly once.
    const { data: pending, error: readError } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .in('id', settlement_ids)
      .eq('settled', false)
      .is('deleted_at', null)

    if (readError) throw readError

    const updated: any[] = []

    // The same path the patient's Billing tab uses (CR-13), so a payout means
    // the same thing whichever screen it was made from.
    for (const settlement of pending ?? []) {
      const amount =
        settlement_amount !== undefined && settlement_amount !== null
          ? Number(settlement_amount)
          : Number(settlement.total_amount) || 0

      const result = await payDoctorFee(supabase, user, settlement, {
        amount,
        details: details.value,
      })

      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error, ...(result.code ? { code: result.code } : {}) },
          { status: result.status }
        )
      }

      updated.push(result.settlement)
    }

    return NextResponse.json({
      success: true,
      message: `${updated.length} settlement(s) settled successfully`,
      data: updated,
    })
  } catch (error: any) {
    console.error('Error settling doctor fees:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to settle doctor fees' },
      { status: 500 }
    )
  }
}
