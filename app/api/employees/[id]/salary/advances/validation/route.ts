import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { validateSalaryAdvance } from '@/lib/salary-advance-validation'

/**
 * What the Pay Advance modal shows before you type anything: the base salary,
 * the calculated salary, what has already been drawn, and the ceiling.
 *
 * **This handler had no role check either**, so anyone signed in could read any
 * employee's payroll figures. `advance:read` closes it — and deliberately
 * includes RECEPTIONIST, because the advance log they can see quotes the same
 * numbers.
 *
 * Every number in the response is now coerced with `parseFloat`. It was not
 * before: `salaryRecord?.base_salary || employee.base_salary` was passed
 * straight through, and Postgres numerics can arrive as strings — so the modal,
 * which calls `.toFixed(2)` on the value, was one PostgREST serialisation
 * decision away from throwing. That is also one of the paths that could put a
 * malformed figure on screen.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireEmployee(request, 'advance:read')
    if (auth.response) return auth.response

    const { id: employeeId } = await context.params
    const monthYear = request.nextUrl.searchParams.get('month_year')

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { error: 'Invalid month_year format. Must be YYYY-MM' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, name, base_salary')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const { data: salaryRecord, error: salaryError } = await supabase
      .from('salary_payments')
      .select('id, calculated_salary, total_advance, status, base_salary')
      .eq('employee_id', employeeId)
      .eq('month_year', monthYear)
      .maybeSingle()

    if (salaryError && salaryError.code !== 'PGRST116') throw salaryError

    const { data: advances, error: advError } = await supabase
      .from('advances')
      .select('amount')
      .eq('employee_id', employeeId)
      .eq('month_year', monthYear)

    if (advError) throw advError

    const num = (v: unknown) => Number.parseFloat(String(v ?? 0)) || 0

    const baseSalary = num(salaryRecord?.base_salary ?? employee.base_salary)

    const salaryData = {
      baseSalary,
      salaryRecord: salaryRecord ? {
        calculated_salary: num(salaryRecord.calculated_salary),
        total_advance: num(salaryRecord.total_advance),
        status: salaryRecord.status,
        settled_on: null,
      } : null,
      currentAdvances: advances || [],
    }

    const validation = validateSalaryAdvance(salaryData)
    const isReceptionist = auth.user.role === 'RECEPTIONIST'

    return NextResponse.json({
      success: true,
      data: {
        employee_id: employeeId,
        employee_name: employee.name,
        month_year: monthYear,
        // Reception can add an advance without ever seeing what it's a
        // fraction of — every rupee figure below is null for that role.
        // `can_add_advance`/`validation_message` still gate and explain the
        // form; the cap itself is still enforced server-side on submit.
        base_salary: isReceptionist ? null : baseSalary,
        has_salary_record: !!salaryRecord,
        calculated_salary: isReceptionist ? null : (salaryRecord ? num(salaryRecord.calculated_salary) : null),
        current_total_advances: isReceptionist ? null : salaryData.currentAdvances.reduce(
          (sum, adv: any) => sum + num(adv.amount),
          0
        ),
        // Already clamped at zero by validateSalaryAdvance; belt and braces so a
        // negative ceiling can never reach the form.
        max_allowed_advance: isReceptionist ? null : Math.max(0, num(validation.maxAllowedAdvance)),
        can_add_advance: validation.isAllowed,
        validation_message: validation.reason ?? null,
        status: salaryRecord?.status || null,
        scenario: salaryRecord ? 'Salary Record Exists' : 'No Salary Record',
      },
    })
  } catch (error: any) {
    console.error('Error validating advance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate advance' },
      { status: 500 }
    )
  }
}
