/**
 * GET /api/finances/medicine?month=YYYY-MM
 *
 * What is behind the "Medicine" line in Finances → Expenses: every medicine
 * charge dated in the month, with the patient it belongs to, so an admin
 * checking the figure can see who it is made of and open any of them.
 *
 * The line is worked out from the charges rather than stored
 * (lib/finances/medicine-expense.ts), so this endpoint and the Overview's total
 * run the same query and cannot drift apart.
 *
 * `finance:read`, like the rest of Finances.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { monthRange } from '@/lib/finances/overview'
import { medicineExpense } from '@/lib/finances/medicine-expense'
import { istMonth } from '@/lib/dates/ist'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'finance:read')
    if (auth.response) return auth.response

    const month = request.nextUrl.searchParams.get('month') || istMonth()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month must look like 2026-09' }, { status: 400 })
    }

    const supabase = await createClient()
    const expense = await medicineExpense(supabase, monthRange(month))

    return NextResponse.json({ month, ...expense })
  } catch (error: any) {
    console.error('Error reading the medicine expense:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to read the medicine expense' },
      { status: 500 }
    )
  }
}
