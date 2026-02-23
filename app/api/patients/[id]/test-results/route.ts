import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// GET /api/patients/:id/test-results - Get patient's test history
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 100)

    const { id } = await params
    const supabase = await createClient()

    // Check if patient exists
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, name')
      .eq('id', id)
      .single()

    if (patientError || !patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      )
    }

    // Get test results for this patient
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabase
      .from('patient_test_results')
      .select(`
        *,
        lab_tests (
          id,
          name,
          code,
          category,
          sample_type
        ),
        reference_doctor:users!patient_test_results_reference_doctor_id_fkey (
          id,
          username
        ),
        verified_by_user:users!patient_test_results_verified_by_fkey (
          id,
          username
        )
      `, { count: 'exact' })
      .eq('patient_id', id)
      .order('test_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: {
        patient,
        results: data || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize)
        }
      }
    })
  } catch (error: any) {
    console.error('Error fetching patient test results:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch patient test results' },
      { status: 500 }
    )
  }
}
