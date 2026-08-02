import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

/**
 * GET /api/employees/salary?month_year=YYYY-MM
 * Get salary records for a specific month with employee and advance details
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'salary:read')
    if (auth.response) return auth.response

    const searchParams = request.nextUrl.searchParams
    const monthYear = searchParams.get('month_year')

    if (!monthYear) {
      return NextResponse.json(
        { error: 'month_year parameter is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Fetch all active employees
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('status', 'Active')
      .order('name')

    if (empError) throw empError

    // Fetch salary records for the month
    const { data: salaryRecords, error: salError } = await supabase
      .from('salary_payments')
      .select('*')
      .eq('month_year', monthYear)

    if (salError) throw salError

    // Fetch inactive employees who have salary records in this month
    // This ensures we show employee names for historical salary data
    const inactiveEmployeeIds = salaryRecords?.map((s: any) => s.employee_id) || []
    let inactiveEmployees: any[] = []
    
    if (inactiveEmployeeIds.length > 0) {
      const { data: inactive, error: inactiveError } = await supabase
        .from('employees')
        .select('*')
        .in('id', inactiveEmployeeIds)
        .eq('status', 'Inactive')
        .order('name')
      
      if (!inactiveError && inactive) {
        inactiveEmployees = inactive
      }
    }

    // Combine active and inactive employees with salary records
    const allEmployeesForMonth = [...(employees || []), ...inactiveEmployees]

    // Fetch advances for the month
    const { data: advances, error: advError } = await supabase
      .from('advances')
      // `created_by_user` so the salary details modal can name who recorded
      // each advance alongside who handed it over.
      .select('*, created_by_user:users!created_by(id, username)')
      .eq('month_year', monthYear)
      .order('date_given', { ascending: false })

    if (advError) throw advError

    // Combine data
    const employeesWithSalary = allEmployeesForMonth?.map((emp: any) => {
      const salaryRecord = salaryRecords?.find((s: any) => s.employee_id === emp.id)
      const empAdvances = advances?.filter((a: any) => a.employee_id === emp.id) || []
      const totalAdvance = empAdvances.reduce((sum: number, adv: any) => sum + parseFloat(adv.amount), 0)
      
      // Use base_salary from salary_payments if record exists, otherwise from employees
      const baseSalary = salaryRecord?.base_salary || emp.base_salary

      return {
        ...emp,
        base_salary: baseSalary,
        salary_record: salaryRecord || null,
        advances: empAdvances,
        advance_count: empAdvances.length,
        total_advance: totalAdvance
      }
    })

    // Calculate summary statistics
    const totalAdvancesPaid = advances?.reduce((sum: number, adv: any) => sum + parseFloat(adv.amount), 0) || 0
    const needToSettle = salaryRecords?.filter((s: any) => s.status === 'pending')
      .reduce((sum: number, s: any) => sum + parseFloat(s.final_salary || 0), 0) || 0
    const settledAmount = salaryRecords?.filter((s: any) => s.status === 'settled')
      .reduce((sum: number, s: any) => sum + parseFloat(s.final_salary || 0), 0) || 0
    const grandTotal = totalAdvancesPaid + needToSettle + settledAmount

    return NextResponse.json({
      success: true,
      data: employeesWithSalary || [],
      summary: {
        total_advances_paid: totalAdvancesPaid,
        need_to_settle: needToSettle,
        settled_amount: settledAmount,
        grand_total: grandTotal,
        pending_count: salaryRecords?.filter((s: any) => s.status === 'pending').length || 0,
        settled_count: salaryRecords?.filter((s: any) => s.status === 'settled').length || 0,
        total_employees: employees?.length || 0,
        employees_with_records: salaryRecords?.length || 0
      }
    })
  } catch (error: any) {
    console.error('Error fetching salary records:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch salary records' },
      { status: 500 }
    )
  }
}
