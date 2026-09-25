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
  created_by_user:users!created_by(id, username)
`

/**
 * `referred_by` has no foreign key to `referrals` — it never did, and this
 * table predates the migrations directory. Embedding it via PostgREST
 * (`referral:referrals!referred_by(...)`) fails with PGRST200 for every
 * patient, which the GET handler below turned into a blanket 404, which
 * blanked the Info tab for every role. Looking it up as a second query
 * avoids requiring a schema change, and the UUID guard makes it tolerant of
 * the empty-string values one billing write path can still produce.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function attachReferral(supabase: any, patient: any) {
  if (!UUID_RE.test(patient?.referred_by ?? '')) {
    return { ...patient, referral: null }
  }

  const { data: referral } = await supabase
    .from('referrals')
    .select('id, name')
    .eq('id', patient.referred_by)
    .maybeSingle()

  return { ...patient, referral: referral ?? null }
}

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

    return NextResponse.json({ patient: await attachReferral(supabase, patient) })
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

/** Every table that holds a patient's records, as the delete dialog names them. */
const PATIENT_REFERENCES = [
  // Payments hang off the bill, so the bill's count covers them.
  { table: 'patient_billing', label: 'bill(s)' },
  { table: 'patient_charges', label: 'charge(s)' },
  { table: 'patient_consultations', label: 'doctor visit(s)' },
  { table: 'doctor_visit_settlements', label: 'doctor fee(s)' },
  { table: 'patient_case_sheets', label: 'case sheet(s)' },
  { table: 'lab_orders', label: 'lab order(s)' },
  { table: 'pharmacy_bills', label: 'pharmacy bill(s)' },
  { table: 'daily_ledger_transactions', label: 'ledger entr(ies)' },
  { table: 'charge_sheets', label: 'charge sheet(s)' },
]

async function countPatientReferences(supabase: any, patientId: string) {
  const found: { label: string; count: number }[] = []
  for (const ref of PATIENT_REFERENCES) {
    const { count, error } = await supabase
      .from(ref.table)
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
    // A failed count must not read as "nothing here" and let the delete through.
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

    // Destroying a patient record takes their billing, charges, consultations,
    // lab orders and discharge summaries with it. Previously any authenticated
    // role could do it, including a lab technician (BUGS.md #9).
    const auth = await requirePatient(request, 'patient:delete')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: patient } = await supabase
      .from('patients')
      .select('id, patient_id, name')
      .eq('id', id)
      .maybeSingle()
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    /**
     * Nothing may still point at them (BUGS #9). The database's own rules
     * differ by table: the bill refuses the delete (a bare 500), but case
     * sheets, charges, visits, fees and pharmacy bills would be deleted along
     * with the patient, and lab orders and ledger rows left pointing at
     * nobody. So the route counts first and refuses with the counts — the
     * doctor registry's rule. A patient registered in error is marked
     * Cancelled instead, which keeps every record intact.
     */
    const references = await countPatientReferences(supabase, id)
    if (references.length > 0) {
      return NextResponse.json(
        {
          error:
            `${patient.patient_id} ${patient.name} still has ` +
            references.map(r => `${r.count} ${r.label}`).join(', ') +
            '. Mark the patient Cancelled instead — their records stay intact.',
          code: 'PATIENT_IN_USE',
          references,
        },
        { status: 409 }
      )
    }

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
