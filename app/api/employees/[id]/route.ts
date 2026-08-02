import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { normaliseEmployeeBody, validateEmployee, firstError } from '@/lib/employees/validate'

/**
 * A single employee.
 *
 * The ~35-line inlined token-refresh block that opened every verb is replaced
 * by `requireEmployee`, which admits exactly the roles the old guard admitted.
 * Validation moves to the shared validator so PUT can no longer accept
 * something POST would have rejected, and the new optional fields are writable
 * without three more hand-written `if (x !== undefined)` branches.
 *
 * DELETE is unchanged in behaviour: it soft-deletes by setting status to
 * Inactive, so salary and advance history survives.
 */

const DETAIL_SELECT = `
  *,
  created_by_user:users!created_by(id, username),
  updated_by_user:users!updated_by(id, username)
`

function duplicateCodeResponse(code: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: `Employee code ${code} is already in use`,
      fieldErrors: { employee_code: 'This code is already in use' },
    },
    { status: 409 }
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireEmployee(request, 'employee:read')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: employee, error } = await supabase
      .from('employees')
      .select(DETAIL_SELECT)
      .eq('id', id)
      .single()

    if (error || !employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: employee })
  } catch (error: any) {
    console.error('Error fetching employee:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch employee' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireEmployee(request, 'employee:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const values = normaliseEmployeeBody(body)

    if (Object.keys(values).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    // `patch` mode: only what was actually submitted is checked, which is what
    // the old handler did with its per-field `!== undefined` branches.
    const check = validateEmployee(values, 'patch')
    if (!check.ok) {
      return NextResponse.json(
        { success: false, error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: employee, error } = await supabase
      .from('employees')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') return duplicateCodeResponse(values.employee_code)
      throw error
    }

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Employee updated successfully',
      data: employee,
    })
  } catch (error: any) {
    console.error('Error updating employee:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update employee' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireEmployee(request, 'employee:delete')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()

    // Soft delete: mark Inactive rather than removing the row, so the salary
    // and advance history hanging off it stays readable. The register's
    // Active/Inactive/All filter is what makes this reversible.
    const { data: employee, error } = await supabase
      .from('employees')
      .update({ status: 'Inactive', updated_by: user.id })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) throw error

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Employee marked as Inactive successfully',
      data: employee,
    })
  } catch (error: any) {
    console.error('Error deleting employee:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete employee' },
      { status: 500 }
    )
  }
}
