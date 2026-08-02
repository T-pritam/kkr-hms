import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { normaliseEmployeeBody, validateEmployee, firstError } from '@/lib/employees/validate'
import { EMPLOYEE_SORTS, EMPLOYEE_STATUSES, type EmployeeSort } from '@/lib/employees/constants'
import { pageMeta, parsePaging, safeSearch } from '@/lib/api/query'

/**
 * The employee register.
 *
 * GET grew three things it never had: search, paging and sorting. Without them
 * the details page had to fetch the entire table on every keystroke and filter
 * and slice it in the browser — fine at six staff, not at two hundred.
 *
 * The `status` default stays `'Active'`, so every existing caller behaves
 * exactly as before; `?status=all` is what the new Active/Inactive/All filter
 * sends, and it is the only way a soft-deleted employee can be seen — and
 * therefore restored — through the UI at all.
 */

const LIST_SELECT = `
  id, employee_code, name, designation, base_salary, join_date, status,
  phone, gender, date_of_birth, created_at, updated_at,
  updated_by_user:users!updated_by(id, username)
`

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'employee:read')
    if (auth.response) return auth.response

    const params = request.nextUrl.searchParams
    const status = params.get('status') ?? 'Active'
    const monthYear = params.get('month_year')
    const search = safeSearch(params.get('search'))

    /**
     * `month_year` enriches every employee with their salary record, and the
     * salary screens read the whole list at once. Paging that would silently
     * truncate payroll, so it stays unpaginated exactly as before; paging only
     * applies to the plain register listing.
     */
    const paged = !monthYear && params.has('page')
    const paging = parsePaging(params, 20)

    const supabase = await createClient()

    let query = supabase
      .from('employees')
      .select(monthYear ? '*' : LIST_SELECT, { count: 'exact' })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,employee_code.ilike.%${search}%,` +
        `designation.ilike.%${search}%,phone.ilike.%${search}%`
      )
    }

    const designation = params.get('designation')
    if (designation) query = query.eq('designation', designation)

    const sortKey = (params.get('sort') || 'name') as EmployeeSort
    const column = EMPLOYEE_SORTS[sortKey] ?? EMPLOYEE_SORTS.name
    const ascending = params.get('dir') !== 'desc'

    query = query.order(column, { ascending })

    if (paged) query = query.range(paging.from, paging.to)

    const { data: employees, error: empError, count } = await query

    if (empError) throw empError

    // Unchanged: enrich with the month's salary record when asked.
    if (monthYear && employees) {
      const employeeIds = employees.map((e: any) => e.id)

      const { data: salaryRecords } = await supabase
        .from('salary_payments')
        .select('*')
        .in('employee_id', employeeIds)
        .eq('month_year', monthYear)

      const enriched = employees.map((emp: any) => {
        const salaryRecord = salaryRecords?.find((s: any) => s.employee_id === emp.id)
        return { ...emp, salary_record: salaryRecord || null, has_salary_record: !!salaryRecord }
      })

      return NextResponse.json({ success: true, data: enriched })
    }

    return NextResponse.json({
      success: true,
      data: employees || [],
      ...(paged ? pageMeta(count, paging) : { total: count ?? (employees?.length || 0) }),
    })
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'employee:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const supabase = await createClient()

    const values = normaliseEmployeeBody(body)

    /**
     * The employee code.
     *
     * The form prefills a peeked value so it can be seen and overridden, but an
     * untouched field is sent blank and the real code is allocated here, under
     * a row lock. Two people adding staff at the same moment both saw
     * EMP/26/007 and must not both get it.
     */
    if (!values.employee_code) {
      const { data: issued, error: rpcError } = await supabase.rpc('next_employee_code')
      if (rpcError || !issued) throw rpcError || new Error('Could not issue an employee code')
      values.employee_code = issued
    }

    if (!values.join_date) {
      values.join_date = new Date().toISOString().slice(0, 10)
    }

    const check = validateEmployee(values, 'create')
    if (!check.ok) {
      return NextResponse.json(
        { success: false, error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .insert({
        ...values,
        status: (EMPLOYEE_STATUSES as readonly string[]).includes(values.status)
          ? values.status
          : 'Active',
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: `Employee code ${values.employee_code} is already in use`,
            fieldErrors: { employee_code: 'This code is already in use' },
          },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json(
      { success: true, message: 'Employee created successfully', data: employee },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create employee' },
      { status: 500 }
    )
  }
}
