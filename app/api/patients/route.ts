import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePatient } from '@/lib/patients/authz'
import { normalisePatientBody, validatePatient, firstError } from '@/lib/patients/validate'
import { PATIENT_SORTS, PATIENT_STATUSES, type PatientSort } from '@/lib/patients/constants'
import { pageMeta, parsePaging, safeSearch } from '@/lib/api/query'

/**
 * The patient registry.
 *
 * Rewritten from a handler whose entire validation was
 * `if (!patient_id || !name)` and whose only authorisation was a token check —
 * a lab technician could register and edit patients. See lib/patients/authz.ts
 * and lib/patients/validate.ts.
 */

/** Everything the list and detail screens need, and nothing else. */
const LIST_SELECT = `
  id, patient_id, name, gender, phone, alternate_phone, date_of_birth,
  date_of_join, age_years, age_recorded_on, blood_group, email, address,
  status, referred_by, created_at, updated_at,
  updated_by_user:users!updated_by(id, username)
`

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePatient(request, 'patient:read')
    if (auth.response) return auth.response

    const params = request.nextUrl.searchParams
    const paging = parsePaging(params)
    const search = safeSearch(params.get('search'))

    const supabase = await createClient()

    let query = supabase.from('patients').select(LIST_SELECT, { count: 'exact' })

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,patient_id.ilike.%${search}%,phone.ilike.%${search}%`
      )
    }

    const status = params.get('status')
    if (status && (PATIENT_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status)
    }

    // Registered-between, so "everyone who joined this month" is one query.
    const joinedFrom = params.get('joinedFrom')
    const joinedTo = params.get('joinedTo')
    if (joinedFrom) query = query.gte('date_of_join', joinedFrom)
    if (joinedTo) query = query.lte('date_of_join', joinedTo)

    const sortKey = (params.get('sort') || 'date_of_join') as PatientSort
    const column = PATIENT_SORTS[sortKey] ?? PATIENT_SORTS.date_of_join
    const ascending = params.get('dir') === 'asc'

    const { data: patients, error, count } = await query
      .order(column, { ascending })
      // Ties on a date column would otherwise come back in an arbitrary order
      // and rows could shuffle between pages.
      .order('created_at', { ascending: false })
      .range(paging.from, paging.to)

    if (error) throw error

    return NextResponse.json({
      patients: patients || [],
      ...pageMeta(count, paging),
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
    const auth = await requirePatient(request, 'patient:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const supabase = await createClient()

    const values = normalisePatientBody(body)

    /**
     * The patient ID.
     *
     * The form prefills a peeked number so reception can see and override it,
     * but an untouched field is sent as blank and the real number is issued
     * here, from the counter, under a row lock. That is the difference between
     * a preview and an allocation: two people registering at the same moment
     * both saw "5/26" and must not both get it.
     */
    if (!values.patient_id) {
      const { data: issued, error: rpcError } = await supabase.rpc('next_patient_id')
      if (rpcError || !issued) {
        throw rpcError || new Error('Could not issue a patient ID')
      }
      values.patient_id = issued
    }

    // Registration date defaults to today. Computed here rather than in the
    // form so an API client gets the same behaviour.
    if (!values.date_of_join) {
      values.date_of_join = new Date().toISOString().slice(0, 10)
    }

    const check = validatePatient(values, 'create')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        ...values,
        status: values.status || 'Active',
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (patientError) {
      // The UNIQUE index added in 20260803000002 is what actually enforces
      // this; the pre-flight SELECT it replaced could not.
      if (patientError.code === '23505') {
        return NextResponse.json(
          {
            error: `Patient ID ${values.patient_id} is already in use`,
            fieldErrors: { patient_id: 'This ID is already in use' },
          },
          { status: 409 }
        )
      }
      throw patientError
    }

    // Every patient needs a billing row for the charges and payments tabs to
    // have somewhere to write. A failure here is logged rather than thrown: the
    // patient is registered, and the billing row is recreated on demand.
    const { error: billingError } = await supabase.from('patient_billing').insert({
      patient_id: patient.id,
      base_charge: 0,
      total_doctor_fees: 0,
      patient_charges_total: 0,
      patient_paid_amount: 0,
      billing_status: 'pending',
      referral_settled: false,
      created_by: user.id,
    })

    if (billingError) {
      console.error('Error creating billing record:', billingError)
    }

    return NextResponse.json(
      { message: 'Patient created successfully', patient },
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
