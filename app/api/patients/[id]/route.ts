import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePatient } from '@/lib/patients/authz'
import { normalisePatientBody, validatePatient, firstError } from '@/lib/patients/validate'

/**
 * A single patient.
 *
 * Every handler here except DELETE previously verified the token and then never
 * looked at the role (BUGS.md #9), and PUT coerced `status || 'Active'`, so
 * editing a discharged patient's phone number quietly re-admitted them
 * (BUGS.md #12).
 */

const DETAIL_SELECT = `
  *,
  updated_by_user:users!updated_by(id, username),
  created_by_user:users!created_by(id, username),
  referral:referrals!referred_by(id, name)
`

/** 409 when the typed ID collides, so the form can mark the field. */
function duplicateIdResponse(patientId: unknown) {
  return NextResponse.json(
    {
      error: `Patient ID ${patientId} is already in use`,
      fieldErrors: { patient_id: 'This ID is already in use' },
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

    const auth = await requirePatient(request, 'patient:read')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: patient, error } = await supabase
      .from('patients')
      .select(DETAIL_SELECT)
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

    const auth = await requirePatient(request, 'patient:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const values = normalisePatientBody(body)

    const check = validatePatient(values, 'update')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // `status` is only written when the caller actually sent one. The old
    // handler defaulted it to 'Active', so any edit un-discharged the patient.
    const { data: patient, error } = await supabase
      .from('patients')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') return duplicateIdResponse(values.patient_id)
      throw error
    }

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Patient updated successfully', patient })
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

    const auth = await requirePatient(request, 'patient:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()

    // Same whitelist as PUT — the previous PATCH kept its own shorter list, so
    // the info tab could fix an address but not a misspelled name.
    const values = normalisePatientBody(body)

    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const check = validatePatient(values, 'patch')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: patient, error } = await supabase
      .from('patients')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') return duplicateIdResponse(values.patient_id)
      throw error
    }

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Patient updated successfully', patient })
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

    // Destroying a patient record takes their billing, charges, consultations,
    // lab orders and discharge summaries with it. Previously any authenticated
    // role could do it, including a lab technician (BUGS.md #9).
    const auth = await requirePatient(request, 'patient:delete')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { error } = await supabase.from('patients').delete().eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Patient deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting patient:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete patient' },
      { status: 500 }
    )
  }
}
