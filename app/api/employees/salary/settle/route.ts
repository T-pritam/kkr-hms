import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * POST /api/employees/salary/settle
 * Settle individual salary (Admin only)
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
        role: refreshPayload.role
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json()
    const { employee_id, month_year } = body

    // Validation
    if (!employee_id) {
      return NextResponse.json(
        { error: 'employee_id is required' },
        { status: 400 }
      )
    }

    if (!month_year || !/^\d{4}-\d{2}$/.test(month_year)) {
      return NextResponse.json(
        { error: 'Invalid month_year format. Must be YYYY-MM' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if record exists and is pending
    const { data: existingRecord, error: fetchError } = await supabase
      .from('salary_payments')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('month_year', month_year)
      .single()
      
    if (fetchError || !existingRecord) {
      return NextResponse.json(
        { error: 'Salary record not found' },
        { status: 404 }
      )
    }

    if (existingRecord.status === 'settled') {
      return NextResponse.json(
        { error: 'Salary already settled' },
        { status: 400 }
      )
    }

    // Settle the salary
    const { data: settledRecord, error } = await supabase
      .from('salary_payments')
      .update({
        status: 'settled',
        settled_on: new Date().toISOString().split('T')[0]
      })
      .eq('employee_id', employee_id)
      .eq('month_year', month_year)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Salary settled successfully',
      data: settledRecord
    })

  } catch (error: any) {
    console.error('Error settling salary:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to settle salary' },
      { status: 500 }
    )
  }
}
