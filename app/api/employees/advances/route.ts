import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * GET /api/employees/advances?month_year=YYYY-MM
 * Get all advances for a month with employee details
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

    const searchParams = request.nextUrl.searchParams
    const monthYear = searchParams.get('month_year')

    if (!monthYear) {
      return NextResponse.json(
        { error: 'month_year parameter is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: advances, error } = await supabase
      .from('advances')
      .select(`
        *,
        employee:employees(id, name, designation)
      `)
      .eq('month_year', monthYear)
      .order('date_given', { ascending: false })

    if (error) throw error

    // Calculate totals
    const totalAmount = advances?.reduce((sum: number, adv: any) => sum + parseFloat(adv.amount), 0) || 0
    const employeeCount = new Set(advances?.map((a: any) => a.employee_id)).size

    return NextResponse.json({
      success: true,
      data: advances || [],
      summary: {
        total_amount: totalAmount,
        advance_count: advances?.length || 0,
        employee_count: employeeCount
      }
    })

  } catch (error: any) {
    console.error('Error fetching advances:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch advances' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/employees/advances
 * Create advance payment (Admin only)
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

    const body = await request.json()
    const { employee_id, amount, date_given, month_year, remarks } = body

    // Validation
    if (!employee_id) {
      return NextResponse.json(
        { error: 'employee_id is required' },
        { status: 400 }
      )
    }

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      )
    }

    if (!date_given) {
      return NextResponse.json(
        { error: 'date_given is required' },
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

    // Verify employee exists
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, name')
      .eq('id', employee_id)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    // Insert advance
    const { data: advance, error: advError } = await supabase
      .from('advances')
      .insert({
        employee_id,
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
      .select('id, calculated_salary, total_advance')
      .eq('employee_id', employee_id)
      .eq('month_year', month_year)
      .single()

    if (salaryRecord) {
      // Get all advances for this employee/month
      const { data: allAdvances } = await supabase
        .from('advances')
        .select('amount')
        .eq('employee_id', employee_id)
        .eq('month_year', month_year)

      const totalAdvance = allAdvances?.reduce((sum: number, adv: any) => sum + parseFloat(adv.amount), 0) || 0
      const finalSalary = salaryRecord.calculated_salary - totalAdvance

      await supabase
        .from('salary_payments')
        .update({
          total_advance: totalAdvance,
          final_salary: finalSalary
        })
        .eq('id', salaryRecord.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Advance payment recorded successfully',
      data: {
        ...advance,
        employee_name: employee.name
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('Error creating advance:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create advance' },
      { status: 500 }
    )
  }
}
