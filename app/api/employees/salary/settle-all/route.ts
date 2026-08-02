import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

/**
 * POST /api/employees/salary/settle-all
 * Settle all pending salaries for a month (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'salary:settle')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const { month_year } = body

    // Validation
    if (!month_year || !/^\d{4}-\d{2}$/.test(month_year)) {
      return NextResponse.json(
        { error: 'Invalid month_year format. Must be YYYY-MM' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if all active employees have salary records
    const { data: activeEmployees } = await supabase
      .from('employees')
      .select('id')
      .eq('status', 'Active')

    const { data: salaryRecords } = await supabase
      .from('salary_payments')
      .select('employee_id')
      .eq('month_year', month_year)

    const activeEmployeeIds = new Set(activeEmployees?.map((e: any) => e.id) || [])
    const recordedEmployeeIds = new Set(salaryRecords?.map((s: any) => s.employee_id) || [])

    const missingEmployees = Array.from(activeEmployeeIds).filter(id => !recordedEmployeeIds.has(id))

    if (missingEmployees.length > 0) {
      return NextResponse.json(
        { 
          error: `Cannot settle all: ${missingEmployees.length} active employees are missing salary records`,
          missing_employee_ids: missingEmployees
        },
        { status: 400 }
      )
    }

    // Settle all pending records
    const { data: settledRecords, error } = await supabase
      .from('salary_payments')
      .update({
        status: 'settled',
        settled_on: new Date().toISOString().split('T')[0],
        // settled_on recorded when; nothing recorded who.
        settled_by: user.id,
        updated_by: user.id,
      })
      .eq('month_year', month_year)
      .eq('status', 'pending')
      .select()

    if (error) throw error

    if (!settledRecords || settledRecords.length === 0) {
      return NextResponse.json(
        { 
          success: true,
          message: 'No pending salaries to settle',
          settled_count: 0
        }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Successfully settled ${settledRecords.length} salary records for ${month_year}`,
      settled_count: settledRecords.length,
      data: settledRecords
    })

  } catch (error: any) {
    console.error('Error settling all salaries:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to settle all salaries' },
      { status: 500 }
    )
  }
}
