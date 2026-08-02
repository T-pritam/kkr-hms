import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

/**
 * One employee's whole payroll history — every salary month and every advance.
 *
 * Everything else in this module is scoped to a single month, because every
 * screen was. The details modal is the first thing that asks "what has happened
 * to this person", and answering it by looping the month-scoped endpoints would
 * mean one request per month since they joined.
 *
 * Read-only. Nothing here recomputes a salary figure.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireEmployee(request, 'salary:read')
    if (auth.response) return auth.response

    const { id: employeeId } = await context.params
    const supabase = await createClient()

    const [salaries, advances] = await Promise.all([
      supabase
        .from('salary_payments')
        .select('*, settled_by_user:users!settled_by(id, username)')
        .eq('employee_id', employeeId)
        .order('month_year', { ascending: false }),
      supabase
        .from('advances')
        .select('*, created_by_user:users!created_by(id, username)')
        .eq('employee_id', employeeId)
        .order('date_given', { ascending: false }),
    ])

    if (salaries.error) throw salaries.error
    if (advances.error) throw advances.error

    return NextResponse.json({
      success: true,
      data: {
        salaries: salaries.data ?? [],
        advances: advances.data ?? [],
      },
    })
  } catch (error: any) {
    console.error('Error loading employee history:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load the history' },
      { status: 500 }
    )
  }
}
