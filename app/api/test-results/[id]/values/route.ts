import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// POST /api/test-results/:id/values - Bulk create result values
export async function POST(
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
    const { values } = body

    if (!Array.isArray(values) || values.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Values array is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if test result exists and get patient gender
    const { data: testResult, error: testError } = await supabase
      .from('patient_test_results')
      .select(`
        id,
        patient_gender,
        patients (
          gender
        )
      `)
      .eq('id', id)
      .single()

    if (testError || !testResult) {
      return NextResponse.json(
        { success: false, error: 'Test result not found' },
        { status: 404 }
      )
    }

    // Determine patient gender (prefer patient_gender field, fallback to patients table)
    const patientsData = Array.isArray(testResult.patients) ? testResult.patients[0] : testResult.patients
    const patientGender = testResult.patient_gender || patientsData?.gender

    // Get parameter details for each value to calculate flags and reference ranges
    const parameterIds = values.map(v => v.parameter_id)
    const { data: parameters, error: paramsError } = await supabase
      .from('test_parameters')
      .select('*')
      .in('id', parameterIds)

    if (paramsError) {
      throw paramsError
    }

    // Create a map of parameter details
    const parameterMap = new Map()
    parameters?.forEach(p => {
      parameterMap.set(p.id, p)
    })

    // Process each value to calculate flag and reference ranges
    const valuesToInsert = values.map(v => {
      const param = parameterMap.get(v.parameter_id)
      if (!param) {
        throw new Error(`Parameter ${v.parameter_id} not found`)
      }

      let refMin, refMax, flag = 'normal'

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

      // Calculate flag if numeric value is provided
      if (v.value !== undefined && v.value !== null && refMin !== null && refMax !== null) {
        if (v.value < refMin) {
          flag = 'low'
        } else if (v.value > refMax) {
          flag = 'high'
        } else {
          flag = 'normal'
        }
        
        // Check for critical values (example: very high or very low)
        // You can customize this logic based on your requirements
        if (v.value < refMin * 0.5 || v.value > refMax * 1.5) {
          flag = 'critical'
        }
      }

      return {
        result_id: id,
        parameter_id: v.parameter_id,
        value: v.value,
        text_value: v.text_value,
        flag: v.flag || flag,
        unit: param.unit,
        ref_min: refMin,
        ref_max: refMax,
        notes: v.notes
      }
    })

    // Insert all values
    const { data, error } = await supabase
      .from('test_result_values')
      .insert(valuesToInsert)
      .select(`
        *,
        test_parameters (
          id,
          name,
          unit,
          display_order
        )
      `)

    if (error) {
      throw error
    }

    // Update test result status to 'completed' if it was 'processing'
    await supabase
      .from('patient_test_results')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .in('status', ['processing', 'collected'])

    return NextResponse.json({
      success: true,
      message: 'Test result values created successfully',
      data
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating test result values:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create test result values' },
      { status: 500 }
    )
  }
}

// GET /api/test-results/:id/values - Get all values for a test result
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

    const { data, error } = await supabase
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

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: any) {
    console.error('Error fetching test result values:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch test result values' },
      { status: 500 }
    )
  }
}
