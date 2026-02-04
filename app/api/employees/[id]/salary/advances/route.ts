import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

// POST - Add advance for an employee for a specific month
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let accessToken = await getAccessToken()
    if (!accessToken) {
      // Try to refresh token
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Generate new access token
      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      // Optionally refresh the refresh token too
      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      // Token is expired or invalid, try to refresh
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Generate new access token
      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      // Optionally refresh the refresh token too
      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const { id: employeeId } = await context.params
    const { amount, date_given, month_year, remarks } = await request.json()

    if (!amount || !date_given || !month_year) {
      return NextResponse.json(
        { error: 'Amount, date, and month_year are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Insert advance (allow advances even without salary record)
    const { data: advance, error: advError } = await supabase
      .from('advances')
      .insert({
        employee_id: employeeId,
        amount: parseFloat(amount),
        date_given,
        month_year,
        remarks: remarks || null
      })
      .select()
      .single()

    if (advError) throw advError

    // Update total_advance in salary_payments if record exists
    const { data: salaryRecord } = await supabase
      .from('salary_payments')
      .select('id, total_advance')
      .eq('employee_id', employeeId)
      .eq('month_year', month_year)
      .single()

    if (salaryRecord) {
      const currentTotal = salaryRecord.total_advance || 0
      const newTotal = currentTotal + parseFloat(amount)

      await supabase
        .from('salary_payments')
        .update({ total_advance: newTotal })
        .eq('id', salaryRecord.id)
    }

    return NextResponse.json({ advance })
  } catch (error: any) {
    console.error('Error adding advance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add advance' },
      { status: 500 }
    )
  }
}
