import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { validateAdvance, firstError } from '@/lib/employees/validate'
import { assertAdvanceAllowed, recordAdvance, redactPayroll, seesPayroll } from '@/lib/employees/advances'

/**
 * Record a salary advance against one employee's month.
 *
 * **This handler had no role check.** It ran the token preamble, computed
 * `payload`, never read `payload.role`, and went straight to work — so any
 * signed-in user, a lab technician or a receptionist included, could pay an
 * advance out of anyone's salary. `advance:write` closes that; the roles are
 * the same ADMIN|DOCTOR every other route in the module already used.
 *
 * The settled-month block, the cap and the way `total_advance` and
 * `final_salary` are written back now live in lib/employees/advances.ts, shared
 * with `POST /api/employees/advances` — the two used to disagree (BUGS.md #55).
 * Reception reaches this route too (CR-03): its advance comes out of petty cash
 * and its response carries no payroll figures.
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
      .select('id, name')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const proposedAmount = parseFloat(amount)

    const allowed = await assertAdvanceAllowed(supabase, {
      employeeId,
      monthYear: month_year,
      amount: proposedAmount,
      role: user.role,
    })
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status })
    }

    const result = await recordAdvance(
      supabase,
      user,
      {
        employee_id: employeeId,
        amount: proposedAmount,
        date_given,
        month_year,
        remarks: remarks || null,
        given_by: given_by?.trim() || null,
      },
      { fromPettyCash: !seesPayroll(user.role), employeeName: employee.name },
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      message: 'Advance recorded successfully',
      data: redactPayroll(result.advance, user.role),
      petty_cash_entry: result.pettyCashEntry,
    })
  } catch (error: any) {
    console.error('Error adding advance:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add advance' },
      { status: 500 }
    )
  }
}
