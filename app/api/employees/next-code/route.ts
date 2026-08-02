import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

/**
 * The next employee code, for prefilling the form.
 *
 * A *peek*: it does not consume a number, because an abandoned form would
 * otherwise leave a permanent gap in a series people read off a payslip.
 *
 * The value returned here is a suggestion, not a reservation. Two people
 * opening the form at once both see it; the code actually issued comes from
 * `next_employee_code()` inside POST /api/employees, which takes a row lock. The
 * form must send the field blank when the user has not edited it, so that
 * allocation happens server-side.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'employee:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('peek_next_employee_code')

    if (error) throw error

    return NextResponse.json({ success: true, data: { employee_code: data } })
  } catch (error: any) {
    console.error('Error peeking next employee code:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to read the next employee code' },
      { status: 500 }
    )
  }
}
