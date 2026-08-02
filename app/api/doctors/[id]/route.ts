import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireDoctor } from '@/lib/doctors/authz'
import { normaliseDoctorBody, validateDoctor } from '@/lib/doctors/validate'
import { DOCTOR_REFERENCES } from '@/lib/doctors/constants'
import { firstError } from '@/lib/patients/validate'

/**
 * A single doctor.
 *
 * PUT and DELETE previously had no role check at all — any authenticated user,
 * a lab technician included, could rename or destroy a consultant — and DELETE
 * was a hard delete with no dependency check while consultations, fee
 * settlements, lab orders and discharge summaries all reference the row
 * (BUGS.md #47/#48).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireDoctor(request, 'doctor:read')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: doctor, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    return NextResponse.json({ doctor })
  } catch (error: any) {
    console.error('Error fetching doctor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch doctor' },
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

    const auth = await requireDoctor(request, 'doctor:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const values = normaliseDoctorBody(body)

    const check = validateDoctor(values, 'update')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: doctor, error } = await supabase
      .from('doctors')
      .update({ ...values, updated_by: user.id })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) throw error

    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Doctor updated successfully', doctor })
  } catch (error: any) {
    console.error('Error updating doctor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update doctor' },
      { status: 500 }
    )
  }
}

/**
 * Counts the records that would be orphaned by a hard delete.
 *
 * Every foreign key here is ON DELETE SET NULL, so deleting a doctor does not
 * fail — it silently blanks the name off consultations, settlements, lab orders
 * and signed discharge summaries. That is the outcome worth preventing.
 */
async function countReferences(supabase: any, doctorId: string) {
  const found: { label: string; count: number }[] = []

  for (const ref of DOCTOR_REFERENCES) {
    const { count, error } = await supabase
      .from(ref.table)
      .select('id', { count: 'exact', head: true })
      .eq(ref.column, doctorId)

    // A missing table or a permission problem must not read as "nothing
    // references this doctor" — that would let the delete through.
    if (error) throw error
    if ((count ?? 0) > 0) found.push({ label: ref.label, count: count as number })
  }

  return found
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const auth = await requireDoctor(request, 'doctor:delete')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, name')
      .eq('id', id)
      .single()

    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    const references = await countReferences(supabase, id)

    if (references.length > 0) {
      return NextResponse.json(
        {
          error:
            `${doctor.name} is referenced by ` +
            references.map(r => `${r.count} ${r.label}`).join(', ') +
            '. Deactivate them instead — their records keep the name.',
          references,
        },
        { status: 409 }
      )
    }

    const { error } = await supabase.from('doctors').delete().eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Doctor deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting doctor:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete doctor' },
      { status: 500 }
    )
  }
}
