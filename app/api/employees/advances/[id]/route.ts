/**
 * PUT / DELETE /api/employees/advances/[id] — correcting an advance (PRD v2, CR-03).
 *
 * Advances could not be changed at all before: a wrong amount stayed wrong, and
 * the only remedy was a second advance to cancel the first. The owner may now
 * correct or remove their own until payroll settles that salary month, at which
 * point the advance has already been deducted from what was paid (Q-17 = A).
 *
 * When the desk paid it, the petty cash debit follows the change — the float
 * and the advance log must never tell two different stories (CR-02).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { deleteAdvance, redactPayroll, updateAdvance } from '@/lib/employees/advances'
import { validateAdvance, firstError } from '@/lib/employees/validate'

async function loadAdvance(supabase: any, id: string) {
  const { data } = await supabase
    .from('advances')
    .select('id, employee_id, amount, date_given, month_year, remarks, created_by, petty_cash_entry_id')
    .eq('id', id)
    .maybeSingle()
  return data
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireEmployee(request, 'advance:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()

    const advance = await loadAdvance(supabase, id)
    if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })

    const check = validateAdvance({
      amount: body.amount,
      date_given: body.date_given ?? advance.date_given,
      month_year: advance.month_year,
    })
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 },
      )
    }

    const result = await updateAdvance(supabase, user, advance, {
      amount: parseFloat(body.amount),
      date_given: body.date_given ?? advance.date_given,
      remarks: body.remarks ?? advance.remarks ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({ success: true, data: redactPayroll(result.advance, user.role) })
  } catch (error: any) {
    console.error('Error updating advance:', error)
    return NextResponse.json({ error: error.message || 'Failed to update the advance' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireEmployee(request, 'advance:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id } = await params
    const supabase = await createClient()

    const advance = await loadAdvance(supabase, id)
    if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })

    const result = await deleteAdvance(supabase, user, advance)
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting advance:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete the advance' }, { status: 500 })
  }
}
