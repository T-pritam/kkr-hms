import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'

/**
 * GET /api/employees/salary/[id]
 * Get individual salary record by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireEmployee(request, 'salary:read')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: salaryRecord, error } = await supabase
      .from('salary_payments')
      .select(`
        *,
        employee:employees(*)
      `)
      .eq('id', id)
      .single()

    if (error || !salaryRecord) {
      return NextResponse.json(
        { success: false, error: 'Salary record not found' },
        { status: 404 }
      )
    }

    // Get advances for this record
    const { data: advances } = await supabase
      .from('advances')
      .select('*')
      .eq('employee_id', salaryRecord.employee_id)
      .eq('month_year', salaryRecord.month_year)
      .order('date_given', { ascending: false })

    return NextResponse.json({
      success: true,
      data: {
        ...salaryRecord,
        advances: advances || []
      }
    })

  } catch (error: any) {
    console.error('Error fetching salary record:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch salary record' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/employees/salary/[id]
 * Update individual salary record (Admin only)
 * Cannot update settled records
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireEmployee(request, 'salary:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()

    // Check if record exists and is not settled
    const { data: existingRecord, error: fetchError } = await supabase
      .from('salary_payments')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingRecord) {
      return NextResponse.json(
        { error: 'Salary record not found' },
        { status: 404 }
      )
    }

    if (existingRecord.status === 'settled') {
      return NextResponse.json(
        { error: 'Cannot update settled salary records' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { days_present, ot_days, base_salary } = body

    const updateData: any = {}

    // Validate and update days_present
    if (days_present !== undefined) {
      const days = parseInt(days_present)
      if (days < 0 || days > 27) {
        return NextResponse.json(
          { error: 'days_present must be between 0 and 27' },
          { status: 400 }
        )
      }
      updateData.days_present = days
    }

    // Validate and update ot_days
    if (ot_days !== undefined) {
      const ot = parseInt(ot_days)
      if (ot < 0 || ot > 3) {
        return NextResponse.json(
          { error: 'ot_days must be between 0 and 3' },
          { status: 400 }
        )
      }
      
      // Check if days_present is 27 (either from update or existing)
      const finalDaysPresent = updateData.days_present !== undefined 
        ? updateData.days_present 
        : existingRecord.days_present

      if (ot > 0 && finalDaysPresent !== 27) {
        return NextResponse.json(
          { error: 'ot_days can only be set when days_present is 27' },
          { status: 400 }
        )
      }
      updateData.ot_days = ot
    }

    // Update base_salary if provided
    if (base_salary !== undefined) {
      const salary = parseFloat(base_salary)
      if (salary <= 0) {
        return NextResponse.json(
          { error: 'base_salary must be greater than 0' },
          { status: 400 }
        )
      }
      updateData.base_salary = salary
    }

    // Recalculate salary
    const finalBaseSalary = updateData.base_salary || existingRecord.base_salary
    const finalDaysPresent = updateData.days_present !== undefined 
      ? updateData.days_present 
      : existingRecord.days_present
    const finalOtDays = updateData.ot_days !== undefined 
      ? updateData.ot_days 
      : existingRecord.ot_days

    // Ensure OT is 0 if days_present < 27
    const validOtDays = finalDaysPresent === 27 ? finalOtDays : 0

    const dailyRate = finalBaseSalary / 30
    const regularSalary = finalBaseSalary - ((27 - finalDaysPresent) * dailyRate)
    const otSalary = dailyRate * validOtDays
    const calculatedSalary = regularSalary + otSalary

    // Get advances
    const { data: advances } = await supabase
      .from('advances')
      .select('amount')
      .eq('employee_id', existingRecord.employee_id)
      .eq('month_year', existingRecord.month_year)

    const totalAdvance = advances?.reduce((sum: number, adv: any) => sum + parseFloat(adv.amount), 0) || 0
    const finalSalary = calculatedSalary - totalAdvance

    updateData.ot_days = validOtDays
    updateData.calculated_salary = parseFloat(calculatedSalary.toFixed(2))
    updateData.final_salary = parseFloat(finalSalary.toFixed(2))
    updateData.total_advance = totalAdvance
    updateData.updated_by = user.id

    // Update record
    const { data: updatedRecord, error } = await supabase
      .from('salary_payments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Salary record updated successfully',
      data: updatedRecord
    })

  } catch (error: any) {
    console.error('Error updating salary record:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update salary record' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/employees/salary/[id]
 * Delete individual salary record (Admin only)
 * Cannot delete settled records
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireEmployee(request, 'salary:write')
    if (auth.response) return auth.response

    const supabase = await createClient()

    // Check if record exists and is not settled
    const { data: existingRecord, error: fetchError } = await supabase
      .from('salary_payments')
      .select('status')
      .eq('id', id)
      .single()

    if (fetchError || !existingRecord) {
      return NextResponse.json(
        { error: 'Salary record not found' },
        { status: 404 }
      )
    }

    if (existingRecord.status === 'settled') {
      return NextResponse.json(
        { error: 'Cannot delete settled salary records' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('salary_payments')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Salary record deleted successfully'
    })

  } catch (error: any) {
    console.error('Error deleting salary record:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete salary record' },
      { status: 500 }
    )
  }
}
