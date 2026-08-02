import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { validateAdvance, firstError } from '@/lib/employees/validate'
import { safeSearch } from '@/lib/api/query'

/**
 * The salary advance log.
 *
 * This endpoint already existed and returned very nearly the right data — and
 * **nothing in the app called it**. The only way to see an advance was one
 * employee, one month, behind a row click on the salary page. It now backs
 * `/employees/advances`, the month-wise log across all staff, which is the one
 * employee screen reception can reach.
 *
 * The cap on how much may be advanced is *not* enforced here, exactly as
 * before. That rule lives in lib/salary-advance-validation.ts and is applied by
 * `POST /api/employees/[id]/salary/advances`. The difference between the two
 * endpoints is long-standing (BUGS.md #55) and deliberately left alone.
 */

const LOG_SELECT = `
  id, employee_id, amount, date_given, month_year, remarks, given_by,
  created_at, updated_at,
  employee:employees(id, employee_code, name, designation, base_salary, status),
  created_by_user:users!created_by(id, username)
`

interface AdvanceRow {
  id: number
  employee_id: string
  amount: number | string
  employee?: { id: string; name?: string; designation?: string | null; base_salary?: number | string } | null
}

/**
 * Per-employee subtotals.
 *
 * Computed here rather than in the browser so the CSV and the PDF, which are
 * generated from the same response, cannot disagree with the screen.
 */
function subtotals(rows: AdvanceRow[]) {
  const byEmployee = new Map<string, {
    employee_id: string
    employee_code: string | null
    name: string
    designation: string | null
    base_salary: number
    total: number
    count: number
  }>()

  for (const row of rows) {
    const emp: any = row.employee ?? {}
    const key = row.employee_id

    const existing = byEmployee.get(key) ?? {
      employee_id: key,
      employee_code: emp.employee_code ?? null,
      name: emp.name ?? 'Unknown',
      designation: emp.designation ?? null,
      base_salary: Number.parseFloat(String(emp.base_salary ?? 0)) || 0,
      total: 0,
      count: 0,
    }

    existing.total += Number.parseFloat(String(row.amount)) || 0
    existing.count += 1
    byEmployee.set(key, existing)
  }

  return [...byEmployee.values()].sort((a, b) => b.total - a.total)
}

export async function GET(request: NextRequest) {
  try {
    // Reception is included in `advance:read` and nothing else in this module.
    const auth = await requireEmployee(request, 'advance:read')
    if (auth.response) return auth.response

    const params = request.nextUrl.searchParams
    const monthYear = params.get('month_year')

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'month_year parameter is required, as YYYY-MM' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    let query = supabase
      .from('advances')
      .select(LOG_SELECT)
      .eq('month_year', monthYear)

    const employeeId = params.get('employee_id')
    if (employeeId) query = query.eq('employee_id', employeeId)

    // A date range inside the month — "what went out in the first week".
    const from = params.get('from')
    const to = params.get('to')
    if (from) query = query.gte('date_given', from)
    if (to) query = query.lte('date_given', to)

    const { data, error } = await query.order('date_given', { ascending: false })

    if (error) throw error

    let rows = (data || []) as unknown as AdvanceRow[]

    /**
     * Designation and free-text search filter the joined employee, which
     * PostgREST cannot do without turning the embed into an inner join and
     * changing the shape of the response. At the volumes this table sees — one
     * month of advances for one hospital — filtering the rows here is simpler
     * and cannot silently drop a row whose employee was deleted.
     */
    const designation = params.get('designation')
    if (designation) {
      rows = rows.filter((r: any) => r.employee?.designation === designation)
    }

    const search = safeSearch(params.get('search')).toLowerCase()
    if (search) {
      rows = rows.filter((r: any) =>
        (r.employee?.name || '').toLowerCase().includes(search) ||
        (r.employee?.employee_code || '').toLowerCase().includes(search) ||
        (r.remarks || '').toLowerCase().includes(search) ||
        (r.given_by || '').toLowerCase().includes(search)
      )
    }

    const amounts = rows.map(r => Number.parseFloat(String(r.amount)) || 0)
    const totalAmount = amounts.reduce((sum, a) => sum + a, 0)

    // Same month last year is meaningless here; the useful comparison is the
    // month before, which is what the screen labels "vs last month".
    const [y, m] = monthYear.split('-').map(Number)
    const prev = new Date(Date.UTC(y, m - 2, 1))
    const previousMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`

    const { data: previous } = await supabase
      .from('advances')
      .select('amount')
      .eq('month_year', previousMonth)

    const previousTotal =
      previous?.reduce((sum: number, a: any) => sum + (Number.parseFloat(String(a.amount)) || 0), 0) ?? 0

    return NextResponse.json({
      success: true,
      data: rows,
      by_employee: subtotals(rows),
      summary: {
        month_year: monthYear,
        total_amount: totalAmount,
        advance_count: rows.length,
        employee_count: new Set(rows.map(r => r.employee_id)).size,
        largest_advance: amounts.length > 0 ? Math.max(...amounts) : 0,
        previous_month: previousMonth,
        previous_total: previousTotal,
      },
    })
  } catch (error: any) {
    console.error('Error fetching advances:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch advances' },
      { status: 500 }
    )
  }
}

/**
 * Record an advance.
 *
 * Previously guarded by the copy-pasted `ADMIN || DOCTOR` block; now the same
 * roles via `advance:write`. The validation, the recomputation of
 * `total_advance` and the absence of a cap are all as they were.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'advance:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const { employee_id, amount, date_given, month_year, remarks, given_by } = body

    if (!employee_id) {
      return NextResponse.json({ error: 'employee_id is required' }, { status: 400 })
    }

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
      .eq('id', employee_id)
      .single()

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const { data: advance, error: advError } = await supabase
      .from('advances')
      .insert({
        employee_id,
        amount: parseFloat(amount),
        date_given,
        month_year,
        remarks: remarks || null,
        // Who handed over the cash, and who was at the keyboard. Neither was
        // recorded anywhere before.
        given_by: given_by?.trim() || null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (advError) throw advError

    // Unchanged: re-sum the advances table and write the totals back.
    const { data: salaryRecord } = await supabase
      .from('salary_payments')
      .select('id, calculated_salary, total_advance')
      .eq('employee_id', employee_id)
      .eq('month_year', month_year)
      .maybeSingle()

    if (salaryRecord) {
      const { data: allAdvances } = await supabase
        .from('advances')
        .select('amount')
        .eq('employee_id', employee_id)
        .eq('month_year', month_year)

      const totalAdvance = allAdvances?.reduce((sum: number, adv: any) => sum + parseFloat(adv.amount), 0) || 0
      const finalSalary = salaryRecord.calculated_salary - totalAdvance

      await supabase
        .from('salary_payments')
        .update({
          total_advance: totalAdvance,
          final_salary: finalSalary,
          updated_by: user.id,
        })
        .eq('id', salaryRecord.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Advance payment recorded successfully',
      data: { ...advance, employee_name: employee.name },
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating advance:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create advance' },
      { status: 500 }
    )
  }
}
