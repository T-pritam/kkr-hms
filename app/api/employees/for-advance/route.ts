/**
 * GET /api/employees/for-advance — the employee picker the desk may see.
 *
 * Reception pays advances (CR-03) and so needs to pick a person, but must not
 * see what anyone earns. `/api/employees` returns the full staff record, salary
 * included, so reception gets this instead: code, name and designation, and
 * nothing else. Active staff only — you cannot advance money to someone who has
 * left.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'advance:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('employees')
      .select('id, employee_code, name, designation')
      .eq('status', 'Active')
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error: any) {
    console.error('Employee picker error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load employees' }, { status: 500 })
  }
}
