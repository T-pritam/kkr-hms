import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  verifyToken,
  getAccessToken,
  getRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} from '@/lib/auth/jwt'

/**
 * GET /api/finances/referral-commissions
 * Query params: settled (true/false), referred_by
 * Returns patients with referral commissions
 */
export async function GET(request: NextRequest) {
  try {
    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin and Doctor only
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json(
        { error: 'Forbidden. Admin or Doctor access required.' },
        { status: 403 }
      )
    }

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
    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role,
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (payload.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      billing_ids,
      payment_method,
      transaction_reference,
      settlement_notes,
    } = body

    if (!billing_ids || !Array.isArray(billing_ids) || billing_ids.length === 0) {
      return NextResponse.json(
        { error: 'billing_ids array is required' },
        { status: 400 }
      )
    }

    if (!payment_method) {
      return NextResponse.json(
        { error: 'payment_method is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Update billing records
    const { data: updated, error: updateError } = await supabase
      .from('patient_billing')
      .update({
        referral_settled: true,
        referral_settlement_date: new Date().toISOString(),
        referral_settlement_notes: settlement_notes,
        updated_by: payload.userId,
        updated_at: new Date().toISOString(),
      })
      .in('id', billing_ids)
      .eq('referral_settled', false)
      .select(`
        *,
        patient:patients(*)
      `)

    if (updateError) throw updateError

    // Create ledger entries for each commission
    if (updated && updated.length > 0) {
      const ledgerEntries = updated.map((billing: any) => ({
        transaction_date: new Date().toISOString().split('T')[0],
        transaction_type: 'debit',
        source: 'referral_commission',
        amount: billing.referral_commission_amount,
        payment_mode: payment_method,
        reference_number: transaction_reference,
        patient_id: billing.patient_id,
        description: `Referral commission - ${billing.patient?.name || 'Unknown Patient'}`,
        notes: settlement_notes,
        status: 'verified',
        created_by: payload.userId,
      }))

      await supabase.from('daily_ledger_transactions').insert(ledgerEntries)
    }

    return NextResponse.json({
      success: true,
      message: `${updated?.length || 0} commission(s) settled successfully`,
      data: updated,
    })
  } catch (error: any) {
    console.error('Error settling referral commissions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to settle referral commissions',
      },
      { status: 500 }
    )
  }
}
