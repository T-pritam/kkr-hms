import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireDoctor } from '@/lib/doctors/authz'

/**
 * Retiring and reinstating a doctor.
 *
 * The replacement for deleting one. An inactive doctor drops out of every
 * picker — /api/doctors/all filters on it — while the consultations, fee
 * settlements, lab orders and discharge summaries that name them stay intact
 * and readable. A signed discharge summary must not lose its consultant because
 * that consultant left the hospital two years later.
 *
 * POST deactivates, DELETE reinstates.
 */

async function setActive(
  request: NextRequest,
  id: string,
  isActive: boolean,
) {
  const auth = await requireDoctor(request, 'doctor:write')
  if (auth.response) return auth.response
  const { user } = auth

  const supabase = await createClient()

  const { data: doctor, error } = await supabase
    .from('doctors')
    .update({ is_active: isActive, updated_by: user.id })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) throw error

  if (!doctor) {
    return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
  }

  return NextResponse.json({
    message: isActive ? 'Doctor reactivated' : 'Doctor deactivated',
    doctor,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    return await setActive(request, id, false)
  } catch (error: any) {
    console.error('Error deactivating doctor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to deactivate doctor' },
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
    return await setActive(request, id, true)
  } catch (error: any) {
    console.error('Error reactivating doctor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reactivate doctor' },
      { status: 500 }
    )
  }
}
