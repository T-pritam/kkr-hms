import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * POST /api/employees/salary/monthly
 * Create/Update monthly salary for multiple employees (Admin only)
 * Implements upsert operation - creates or updates existing records
 * Prevents updates to settled records
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
    const { month_year, employees_data } = body

    // Validation
    if (!month_year || !/^\d{4}-\d{2}$/.test(month_year)) {
      return NextResponse.json(
        { error: 'Invalid month_year format. Must be YYYY-MM' },
        { status: 400 }
      )
    }

    if (!employees_data || !Array.isArray(employees_data) || employees_data.length === 0) {
      return NextResponse.json(
        { error: 'employees_data must be a non-empty array' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check for settled records
    const employeeIds = employees_data.map((e: any) => e.employee_id)
    const { data: existingRecords } = await supabase
      .from('salary_payments')
      .select('employee_id, status')
      .in('employee_id', employeeIds)
      .eq('month_year', month_year)
      .eq('status', 'settled')

    const settledEmployeeIds = new Set(existingRecords?.map((r: any) => r.employee_id) || [])

    // Filter out settled records
    const recordsToProcess = employees_data.filter((emp: any) => !settledEmployeeIds.has(emp.employee_id))

    if (recordsToProcess.length === 0) {
      return NextResponse.json(
        { error: 'All employees already have settled records for this month' },
        { status: 400 }
      )
    }

    // Get advances for each employee in this month
    const { data: advances } = await supabase
      .from('advances')
      .select('employee_id, amount')
      .in('employee_id', employeeIds)
      .eq('month_year', month_year)

    const advancesByEmployee = advances?.reduce((acc: any, adv: any) => {
      if (!acc[adv.employee_id]) acc[adv.employee_id] = 0
      acc[adv.employee_id] += parseFloat(adv.amount)
      return acc
    }, {}) || {}

    // Calculate salary for each employee
    const salaryRecords = recordsToProcess.map((emp: any) => {
      const baseSalary = parseFloat(emp.base_salary)
      const daysPresent = parseInt(emp.days_present)
      const otDays = parseInt(emp.ot_days) || 0

      // Validation
      if (daysPresent < 0 || daysPresent > 27) {
        throw new Error(`Invalid days_present for employee ${emp.employee_id}: must be 0-27`)
      }

      if (otDays < 0 || otDays > 3) {
        throw new Error(`Invalid ot_days for employee ${emp.employee_id}: must be 0-3`)
      }

      // OT only valid if days_present = 27
      const validOtDays = daysPresent === 27 ? otDays : 0

      // Daily rate = base_salary / 30
      const dailyRate = baseSalary / 30

      // Regular salary = base_salary - ((27 - days_present) × daily_rate)
      const regularSalary = baseSalary - ((27 - daysPresent) * dailyRate)

      // OT salary = daily_rate × ot_days (only if days_present = 27)
      const otSalary = dailyRate * validOtDays

      // Calculated salary = regular + OT
      const calculatedSalary = regularSalary + otSalary

      // Get total advances
      const totalAdvance = advancesByEmployee[emp.employee_id] || 0

      // Final salary = calculated - advances
      const finalSalary = calculatedSalary - totalAdvance

      return {
        employee_id: emp.employee_id,
        month_year,
        base_salary: baseSalary,
        total_working_days: 27,
        days_present: daysPresent,
        ot_days: validOtDays,
        total_advance: totalAdvance,
        calculated_salary: parseFloat(calculatedSalary.toFixed(2)),
        final_salary: parseFloat(finalSalary.toFixed(2)),
        status: 'pending'
      }
    })

    // Upsert salary records
    const { data: createdRecords, error } = await supabase
      .from('salary_payments')
      .upsert(salaryRecords, {
        onConflict: 'employee_id,month_year',
        ignoreDuplicates: false
      })
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `Successfully created/updated ${createdRecords?.length || 0} salary records for ${month_year}`,
      data: createdRecords,
      skipped_settled: settledEmployeeIds.size
    }, { status: 201 })

  } catch (error: any) {
    console.error('Error creating monthly salary:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create monthly salary' },
      { status: 500 }
    )
  }
}
