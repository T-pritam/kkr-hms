import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateSalaryAdvance } from '@/lib/salary-advance-validation'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * GET /api/employees/[id]/salary/advances/validation
 * Get validation rules and limits for adding salary advance
 * 
 * Query params:
 * - month_year: YYYY-MM format (required)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id: employeeId } = await context.params
    const { searchParams } = new URL(request.url)
    const monthYear = searchParams.get('month_year')

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { error: 'Invalid month_year format. Must be YYYY-MM' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get employee details
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, name, base_salary')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    // Get salary record for the month
    const { data: salaryRecord, error: salaryError } = await supabase
      .from('salary_payments')
      .select('id, calculated_salary, total_advance, status, base_salary, status')
      .eq('employee_id', employeeId)
      .eq('month_year', monthYear)
      .single()

    if (salaryError && salaryError.code !== 'PGRST116') {
      throw salaryError
    }

    // Get all advances for the month
    const { data: advances, error: advError } = await supabase
      .from('advances')
      .select('amount')
      .eq('employee_id', employeeId)
      .eq('month_year', monthYear)

    if (advError) throw advError

    // Build salary data for validation
    const baseSalary = salaryRecord?.base_salary || employee.base_salary || 0
    const salaryData = {
      baseSalary,
      salaryRecord: salaryRecord ? {
        calculated_salary: parseFloat(salaryRecord.calculated_salary?.toString() || '0'),
        total_advance: parseFloat(salaryRecord.total_advance?.toString() || '0'),
        status: salaryRecord.status,
        settled_on: null
      } : null,
      currentAdvances: advances || []
    }

    // Validate and get limits
    const validation = validateSalaryAdvance(salaryData)

    return NextResponse.json({
      success: true,
      data: {
        employee_id: employeeId,
        employee_name: employee.name,
        month_year: monthYear,
        base_salary: baseSalary,
        has_salary_record: !!salaryRecord,
        calculated_salary: salaryRecord?.calculated_salary ? parseFloat(salaryRecord.calculated_salary.toString()) : null,
        current_total_advances: salaryData.currentAdvances.reduce(
          (sum, adv) => sum + parseFloat(adv.amount.toString()),
          0
        ),
        max_allowed_advance: validation.maxAllowedAdvance,
        can_add_advance: validation.isAllowed,
        validation_message: validation.reason,
        status: salaryRecord?.status || null,
        scenario: salaryRecord ? 'Salary Record Exists' : 'No Salary Record'
      }
    })
  } catch (error: any) {
    console.error('Error validating advance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate advance' },
      { status: 500 }
    )
  }
}
