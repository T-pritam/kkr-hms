import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// GET /api/test-results/:id - Get single test result with values
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const supabase = await createClient()

    // Get test result with all related data
    const { data: testResult, error: resultError } = await supabase
      .from('patient_test_results')
      .select(`
        *,
        lab_tests (
          id,
          name,
          code,
          category,
          sample_type,
          description
        ),
        reference_doctor:users!patient_test_results_reference_doctor_id_fkey (
          id,
          username,
          email
        ),
        conducted_by_user:users!patient_test_results_conducted_by_fkey (
          id,
          username
        ),
        verified_by_user:users!patient_test_results_verified_by_fkey (
          id,
          username
        )
      `)
      .eq('id', id)
      .single()

    if (resultError) {
      if (resultError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Test result not found' },
          { status: 404 }
        )
      }
      throw resultError
    }

    // Get test result values with parameter details
    const { data: values, error: valuesError } = await supabase
      .from('test_result_values')
      .select(`
        *,
        test_parameters (
          id,
          name,
          unit,
          min_value,
          max_value,
          gender_specific,
          male_min,
          male_max,
          female_min,
          female_max,
          display_order
        )
      `)
      .eq('result_id', id)
      .order('test_parameters(display_order)', { ascending: true })

    if (valuesError) {
      throw valuesError
    }

    return NextResponse.json({
      success: true,
      data: {
        ...testResult,
        values: values || []
      }
    })
  } catch (error: any) {
    console.error('Error fetching test result:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch test result' },
      { status: 500 }
    )
  }
}

// PUT /api/test-results/:id - Update test result
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const updateData: any = {}

    // Only include fields that are provided
    if (body.test_date !== undefined) updateData.test_date = body.test_date
    if (body.sample_collected_at !== undefined) updateData.sample_collected_at = body.sample_collected_at
    if (body.result_issued_at !== undefined) updateData.result_issued_at = body.result_issued_at
    if (body.price !== undefined) updateData.price = body.price
    if (body.discount !== undefined) updateData.discount = body.discount
    if (body.status !== undefined) updateData.status = body.status
    if (body.reference_doctor_id !== undefined) updateData.reference_doctor_id = body.reference_doctor_id
    if (body.conducted_by !== undefined) updateData.conducted_by = body.conducted_by
    if (body.verified_by !== undefined) updateData.verified_by = body.verified_by
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.patient_name !== undefined) updateData.patient_name = body.patient_name
    if (body.patient_phone !== undefined) updateData.patient_phone = body.patient_phone
    if (body.patient_age !== undefined) updateData.patient_age = body.patient_age
    if (body.patient_gender !== undefined) updateData.patient_gender = body.patient_gender

    // Recalculate final price if price or discount changed
    if (body.price !== undefined || body.discount !== undefined) {
      const supabase = await createClient()
      const { data: current } = await supabase
        .from('patient_test_results')
        .select('price, discount')
        .eq('id', id)
        .single()

      const newPrice = body.price !== undefined ? body.price : (current?.price || 0)
      const newDiscount = body.discount !== undefined ? body.discount : (current?.discount || 0)
      updateData.final_price = newPrice - newDiscount
    }

    updateData.updated_at = new Date().toISOString()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('patient_test_results')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Test result not found' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test result updated successfully',
      data
    })
  } catch (error: any) {
    console.error('Error updating test result:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update test result' },
      { status: 500 }
    )
  }
}

// DELETE /api/test-results/:id - Delete test result
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const supabase = await createClient()

    // Delete will cascade to test_result_values
    const { error } = await supabase
      .from('patient_test_results')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test result deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting test result:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete test result' },
      { status: 500 }
    )
  }
}
