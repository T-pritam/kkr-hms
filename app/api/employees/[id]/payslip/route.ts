import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

/**
 * Everything one payslip needs, in one request.
 *
 * The employee record, that month's salary row, and the **itemised** advances —
 * which is the part nothing has ever shown. The only advance figure that
 * reached a document was the summed `total_advance` column in the finance
 * report; an employee being paid could not see which advances made it up, when
 * they were taken, or who handed them over.
 *
 * Purely a read. Nothing here recomputes or writes a salary figure.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireEmployee(request, 'salary:read')
    if (auth.response) return auth.response

    const { id: employeeId } = await context.params
    const monthYear = request.nextUrl.searchParams.get('month_year')

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'Invalid month_year format. Must be YYYY-MM' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    const { data: salaryRecord } = await supabase
      .from('salary_payments')
      .select('*, settled_by_user:users!settled_by(id, username)')
      .eq('employee_id', employeeId)
      .eq('month_year', monthYear)
      .maybeSingle()

    const { data: advances } = await supabase
      .from('advances')
      .select('id, amount, date_given, remarks, given_by, created_at, created_by_user:users!created_by(id, username)')
      .eq('employee_id', employeeId)
      .eq('month_year', monthYear)
      .order('date_given', { ascending: true })

    return NextResponse.json({
      success: true,
      data: {
        employee,
        month_year: monthYear,
        // A payslip for a month with no salary record is still worth printing —
        // it shows the advances already drawn against it.
        salary_record: salaryRecord ?? null,
        advances: advances ?? [],
      },
    })
  } catch (error: any) {
    console.error('Error building payslip:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to build the payslip' },
      { status: 500 }
    )
  }
}
