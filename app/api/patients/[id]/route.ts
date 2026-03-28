import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get patient by ID
    const { data: patient, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    return NextResponse.json({ patient })
  } catch (error: any) {
    console.error('Error fetching patient:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patient' },
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
      status,
    } = body

    // Validate required fields
    if (!patient_id || !name) {
      return NextResponse.json(
        { error: 'Patient ID and name are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if patient_id already exists for a different patient
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('id')
      .eq('patient_id', patient_id)
      .neq('id', id)
      .single()

    if (existingPatient) {
      return NextResponse.json(
        { error: 'Patient ID already exists' },
        { status: 400 }
      )
    }

    // Update patient
    const { error } = await supabase
      .from('patients')
      .update({
        patient_id,
        name,
        phone: phone || null,
        gender: gender || 'Male',
        date_of_birth: date_of_birth || null,
        date_of_join: date_of_join || null,
        address: address || null,
        referred_by: referred_by || null,
        emergency_contact_name: emergency_contact_name || null,
        emergency_contact_phone: emergency_contact_phone || null,
        medical_history: medical_history || null,
        allergies: allergies || null,
        current_medications: current_medications || null,
        status: status || 'Active',
      })
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ message: 'Patient updated successfully' })
  } catch (error: any) {
    console.error('Error updating patient:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update patient' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = await createClient()

    // Only update the fields that are provided
    const updateData: Record<string, any> = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.address !== undefined) updateData.address = body.address
    if (body.medical_history !== undefined) updateData.medical_history = body.medical_history
    if (body.allergies !== undefined) updateData.allergies = body.allergies
    if (body.current_medications !== undefined) updateData.current_medications = body.current_medications
    if (body.emergency_contact_name !== undefined) updateData.emergency_contact_name = body.emergency_contact_name
    if (body.emergency_contact_phone !== undefined) updateData.emergency_contact_phone = body.emergency_contact_phone

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Patient updated successfully' })
  } catch (error: any) {
    console.error('Error patching patient:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update patient' },
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

    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const supabase = await createClient()

    // Delete patient
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ message: 'Patient deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting patient:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete patient' },
      { status: 500 }
    )
  }
}
