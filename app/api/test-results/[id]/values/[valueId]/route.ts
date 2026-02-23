import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// PUT /api/test-results/:id/values/:valueId - Update single result value
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; valueId: string }> }
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

    const { id, valueId } = await params
    const body = await request.json()
    const updateData: any = {}

    const supabase = await createClient()

    // Get current value and parameter details
    const { data: currentValue, error: currentError } = await supabase
      .from('test_result_values')
      .select(`
        *,
        test_parameters (
          *
        ),
        patient_test_results (
          patient_gender,
          patients (
            gender
          )
        )
      `)
      .eq('id', valueId)
      .eq('result_id', id)
      .single()

    if (currentError || !currentValue) {
      return NextResponse.json(
        { success: false, error: 'Test result value not found' },
        { status: 404 }
      )
    }

    // Only include fields that are provided
    if (body.value !== undefined) updateData.value = body.value
    if (body.text_value !== undefined) updateData.text_value = body.text_value
    if (body.notes !== undefined) updateData.notes = body.notes

    // Recalculate flag if value changed
    if (body.value !== undefined) {
      const param = currentValue.test_parameters
      const patientGender = currentValue.patient_test_results?.patient_gender || 
                           currentValue.patient_test_results?.patients?.gender

      let refMin, refMax

      // Determine reference range based on gender
      if (param.gender_specific && patientGender) {
        if (patientGender.toLowerCase() === 'male') {
          refMin = param.male_min
          refMax = param.male_max
        } else if (patientGender.toLowerCase() === 'female') {
          refMin = param.female_min
          refMax = param.female_max
        } else {
          refMin = param.min_value
          refMax = param.max_value
        }
      } else {
        refMin = param.min_value
        refMax = param.max_value
      }

      // Calculate flag
      let flag = 'normal'
      if (body.value !== null && refMin !== null && refMax !== null) {
        if (body.value < refMin) {
          flag = 'low'
        } else if (body.value > refMax) {
          flag = 'high'
        } else {
          flag = 'normal'
        }
        
        // Check for critical values
        if (body.value < refMin * 0.5 || body.value > refMax * 1.5) {
          flag = 'critical'
        }
      }

      updateData.flag = body.flag || flag
      updateData.ref_min = refMin
      updateData.ref_max = refMax
    } else if (body.flag !== undefined) {
      updateData.flag = body.flag
    }

    const { data, error } = await supabase
      .from('test_result_values')
      .update(updateData)
      .eq('id', valueId)
      .eq('result_id', id)
      .select(`
        *,
        test_parameters (
          id,
          name,
          unit,
          display_order
        )
      `)
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test result value updated successfully',
      data
    })
  } catch (error: any) {
    console.error('Error updating test result value:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update test result value' },
      { status: 500 }
    )
  }
}

// DELETE /api/test-results/:id/values/:valueId - Delete single result value
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; valueId: string }> }
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

    const { id, valueId } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('test_result_values')
      .delete()
      .eq('id', valueId)
      .eq('result_id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test result value deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting test result value:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete test result value' },
      { status: 500 }
    )
  }
}
