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
 * GET /api/finances/doctor-settlements
 * Query params: settled (true/false), doctor_id, patient_id
 * Returns doctor visit settlements with details
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
    const doctorId = searchParams.get('doctor_id')
    const patientId = searchParams.get('patient_id')

    const supabase = await createClient()

    let query = supabase
      .from('doctor_visit_settlements')
      .select(`
        *,
        doctor:doctors(*),
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
      settlement_ids,
      settlement_amount,
      payment_method,
      transaction_reference,
      settlement_notes,
    } = body

    if (!settlement_ids || !Array.isArray(settlement_ids) || settlement_ids.length === 0) {
      return NextResponse.json(
        { error: 'settlement_ids array is required' },
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

    // Update settlements
    const { data: updated, error: updateError } = await supabase
      .from('doctor_visit_settlements')
      .update({
        settled: true,
        settlement_date: new Date().toISOString(),
        settlement_amount: settlement_amount,
        payment_method,
        transaction_reference,
        settlement_notes,
        updated_by: payload.userId,
        updated_at: new Date().toISOString(),
      })
      .in('id', settlement_ids)
      .eq('settled', false)
      .select()

    if (updateError) throw updateError

    // Create ledger entries for each settlement
    if (updated && updated.length > 0) {
      const ledgerEntries = updated.map((settlement: any) => ({
        transaction_date: new Date().toISOString().split('T')[0],
        transaction_type: 'debit',
        source: 'doctor_settlement',
        amount: settlement_amount || settlement.total_amount,
        payment_mode: payment_method,
        reference_number: transaction_reference,
        description: `Doctor settlement - ${settlement.doctor?.name || 'Unknown Doctor'}`,
        notes: settlement_notes,
        status: 'verified',
        created_by: payload.userId,
      }))

      await supabase.from('daily_ledger_transactions').insert(ledgerEntries)
    }

    return NextResponse.json({
      success: true,
      message: `${updated?.length || 0} settlement(s) processed successfully`,
      data: updated,
    })
  } catch (error: any) {
    console.error('Error settling doctor visits:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to settle doctor visits',
      },
      { status: 500 }
    )
  }
}
