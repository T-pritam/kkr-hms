import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { validateAdvance, firstError } from '@/lib/employees/validate'
import { validateSalaryAdvance, isAdvanceAmountValid } from '@/lib/salary-advance-validation'

/**
 * Record a salary advance against one employee's month.
 *
 * **This handler had no role check.** It ran the token preamble, computed
 * `payload`, never read `payload.role`, and went straight to work — so any
 * signed-in user, a lab technician or a receptionist included, could pay an
 * advance out of anyone's salary. `advance:write` closes that; the roles are
 * the same ADMIN|DOCTOR every other route in the module already used.
 *
 * Everything downstream of the guard is unchanged: the settled-month block, the
 * cap from lib/salary-advance-validation.ts, and the way `total_advance` and
 * `final_salary` are written back all behave exactly as they did.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireEmployee(request, 'advance:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id: employeeId } = await context.params
    const { amount, date_given, month_year, remarks, given_by } = await request.json()

    const check = validateAdvance({ amount, date_given, month_year, given_by })
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
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
      .eq('month_year', month_year)
      .maybeSingle()

    if (salaryError && salaryError.code !== 'PGRST116') throw salaryError

    const { data: existingAdvances, error: advError } = await supabase
      .from('advances')
      .select('amount')
      .eq('employee_id', employeeId)
      .eq('month_year', month_year)

    if (advError) throw advError

    // Postgres numerics can arrive as strings; coerce once here so the cap
    // maths below is never comparing a string to a number.
    const baseSalary = parseFloat(
      String(salaryRecord?.base_salary ?? employee.base_salary ?? 0)
    ) || 0

    const salaryData = {
      baseSalary,
      salaryRecord: salaryRecord ? {
        calculated_salary: parseFloat(salaryRecord.calculated_salary?.toString() || '0'),
        total_advance: parseFloat(salaryRecord.total_advance?.toString() || '0'),
        status: salaryRecord.status || 'pending',
        settled_on: null,
      } : null,
      currentAdvances: existingAdvances || [],
    }

    if (salaryRecord && salaryRecord.status === 'settled') {
      return NextResponse.json(
        { error: 'Salary is already settled. No further advances can be added.' },
        { status: 400 }
      )
    }

    const validation = validateSalaryAdvance(salaryData)

    if (!validation.isAllowed) {
      return NextResponse.json(
        { error: validation.reason || 'Cannot add advance at this time' },
        { status: 400 }
      )
    }

    const proposedAmount = parseFloat(amount)
    const amountValidation = isAdvanceAmountValid(salaryData, proposedAmount)

    if (!amountValidation.valid) {
      return NextResponse.json(
        { error: amountValidation.reason || 'Invalid advance amount' },
        { status: 400 }
      )
    }

    const { data: advance, error: insertError } = await supabase
      .from('advances')
      .insert({
        employee_id: employeeId,
        amount: proposedAmount,
        date_given,
        month_year,
        remarks: remarks || null,
        // Who handed over the cash, and who was at the keyboard.
        given_by: given_by?.trim() || null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    if (salaryRecord) {
      const currentTotal = parseFloat(salaryRecord.total_advance?.toString() || '0')
      const newTotal = currentTotal + proposedAmount
      const calculatedSalary = parseFloat(salaryRecord.calculated_salary?.toString() || '0')
      const newFinalSalary = calculatedSalary - newTotal

      await supabase
        .from('salary_payments')
        .update({
          total_advance: newTotal,
          final_salary: newFinalSalary,
          updated_by: user.id,
        })
        .eq('id', salaryRecord.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Advance recorded successfully',
      data: advance,
    })
  } catch (error: any) {
    console.error('Error adding advance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add advance' },
      { status: 500 }
    )
  }
}
