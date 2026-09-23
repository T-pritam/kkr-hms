import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { payReferralCommission, validatePayout } from '@/lib/billing/payouts'
import { istToday } from '@/lib/dates/ist'

/**
 * GET /api/finances/referral-commissions
 * Query params: settled (true/false), referred_by
 * Returns patients with referral commissions
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'payout:read')
    if (auth.response) return auth.response



    const searchParams = request.nextUrl.searchParams
    const settled = searchParams.get('settled')
    const referredBy = searchParams.get('referred_by')

    const supabase = await createClient()

    let query = supabase
      .from('patient_billing')
      .select(`
        *,
        patient:patients(*)
      `)
      .gt('referral_commission_amount', 0)
      .order('created_at', { ascending: false })

    if (settled !== null) {
      query = query.eq('referral_settled', settled === 'true')
    }

    if (referredBy) {
      // Need to join with patients table
      const { data: patients } = await supabase
        .from('patients')
        .select('id')
        .eq('referred_by', referredBy)

      if (patients && patients.length > 0) {
        const patientIds = patients.map((p) => p.id)
        query = query.in('patient_id', patientIds)
      } else {
        return NextResponse.json({
          success: true,
          data: [],
        })
      }
    }

    const { data, error } = await query

    if (error) throw error

    // Get referral details for each
    const enrichedData = await Promise.all(
      (data || []).map(async (billing: any) => {
        if (billing.patient?.referred_by) {
          const { data: referral } = await supabase
            .from('referrals')
            .select('*')
            .eq('id', billing.patient.referred_by)
            .single()

          return {
            ...billing,
            referral,
          }
        }
        return billing
      })
    )

    return NextResponse.json({
      success: true,
      data: enrichedData,
    })
  } catch (error: any) {
    console.error('Error fetching referral commissions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch referral commissions',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/finances/referral-commissions
 * Settle one or more referral commissions
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'payout:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const { billing_ids } = body

    if (!billing_ids || !Array.isArray(billing_ids) || billing_ids.length === 0) {
      return NextResponse.json({ error: 'billing_ids array is required' }, { status: 400 })
    }

    const details = validatePayout({
      payment_method: body.payment_method,
      transaction_reference: body.transaction_reference,
      notes: body.settlement_notes,
    })
    if (!details.ok) {
      return NextResponse.json(
        { error: details.error, fieldErrors: details.fieldErrors },
        { status: details.status }
      )
    }

    const supabase = await createClient()

    const { data: pending, error: readError } = await supabase
      .from('patient_billing')
      .select('*')
      .in('id', billing_ids)
      .eq('referral_settled', false)

    if (readError) throw readError

    const settled: any[] = []

    // One path for every payout (CR-13): the commission is marked paid only
    // once its ledger OUT exists, and that row is kept on the bill so un-paying
    // can remove it again.
    for (const billing of pending ?? []) {
      const result = await payReferralCommission(supabase, user, billing, { details: details.value })

      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error, ...(result.code ? { code: result.code } : {}) },
          { status: result.status }
        )
      }

      settled.push(billing.id)
    }

    return NextResponse.json({
      success: true,
      message: `${settled.length} commission(s) settled successfully`,
      data: settled,
    })
  } catch (error: any) {
    console.error('Error settling referral commissions:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to settle referral commissions' },
      { status: 500 }
    )
  }
}
