import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
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
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const search = searchParams.get('search') || ''

    const supabase = await createClient()

    // Build query with search
    let query = supabase
      .from('patients')
      .select('*', { count: 'exact' })

    // Apply search filter if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%,patient_id.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: patients, error, count } = await query
      .order('date_of_join', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      patients: patients || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    })
  } catch (error: any) {
    console.error('Error fetching patients:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patients' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const {
      patient_id,
      name,
      phone,
      gender,
      date_of_birth,
      date_of_join,
      address,
      referred_by,
      emergency_contact_name,
      emergency_contact_phone,
      medical_history,
      allergies,
      current_medications,
    } = body

    // Validate required fields
    if (!patient_id || !name) {
      return NextResponse.json(
        { error: 'Patient ID and name are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if patient_id already exists
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('id')
      .eq('patient_id', patient_id)
      .single()

    if (existingPatient) {
      return NextResponse.json(
        { error: 'Patient ID already exists' },
        { status: 400 }
      )
    }

    // Insert new patient
    const { error } = await supabase.from('patients').insert({
      patient_id,
      name,
      phone: phone || null,
      gender: gender || 'Male',
      date_of_birth: date_of_birth || null,
      date_of_join: date_of_join || new Date().toISOString().split('T')[0],
      address: address || null,
      referred_by: referred_by || null,
      emergency_contact_name: emergency_contact_name || null,
      emergency_contact_phone: emergency_contact_phone || null,
      medical_history: medical_history || null,
      allergies: allergies || null,
      current_medications: current_medications || null,
      status: 'Active',
    })

    if (error) {
      throw error
    }

    return NextResponse.json(
      { message: 'Patient created successfully' },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating patient:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create patient' },
      { status: 500 }
    )
  }
}
