import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'

/**
 * GET /api/employees
 * Query params: status (optional), month_year (optional)
 * Returns all employees with optional salary info enrichment
 */
export async function GET(request: NextRequest) {
  try {
    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'Active'
    const monthYear = searchParams.get('month_year')

    const supabase = await createClient()

    let query = supabase
      .from('employees')
      .select('*')
      .order('name', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: employees, error: empError } = await query

    if (empError) throw empError

    // If month_year provided, enrich with salary info
    if (monthYear && employees) {
      const employeeIds = employees.map(e => e.id)

      const { data: salaryRecords } = await supabase
        .from('salary_payments')
        .select('*')
        .in('employee_id', employeeIds)
        .eq('month_year', monthYear)

      const enrichedEmployees = employees.map((emp: any) => {
        const salaryRecord = salaryRecords?.find((s: any) => s.employee_id === emp.id)
        return {
          ...emp,
          salary_record: salaryRecord || null,
          has_salary_record: !!salaryRecord
        }
      })

      return NextResponse.json({
        success: true,
        data: enrichedEmployees
      })
    }

    return NextResponse.json({
      success: true,
      data: employees || []
    })
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to fetch employees' 
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/employees
 * Create new employee (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, designation, base_salary, join_date, status } = body

    // Validation
    if (!name || name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: 'Name must be between 2 and 100 characters' },
        { status: 400 }
      )
    }

    if (!designation || designation.length > 50) {
      return NextResponse.json(
        { error: 'Designation is required and must be max 50 characters' },
        { status: 400 }
      )
    }

    if (!base_salary || parseFloat(base_salary) <= 0) {
      return NextResponse.json(
        { error: 'Base salary must be greater than 0' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: employee, error } = await supabase
      .from('employees')
      .insert({
        name,
        designation,
        base_salary: parseFloat(base_salary),
        join_date: join_date || new Date().toISOString().split('T')[0],
        status: status || 'Active'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      {
        success: true,
        message: 'Employee created successfully',
        data: employee
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to create employee' 
      },
      { status: 500 }
    )
  }
}
