import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePatient } from '@/lib/patients/authz'

/**
 * Patients currently under care, for the pickers that should not offer someone
 * who has already gone home.
 *
 * This filtered on `.neq('status', 'discharge')` — a value nothing in the app
 * has ever written. The real value is 'Discharged', so the filter matched
 * everything and the endpoint returned discharged patients as active
 * (BUGS.md #13). Now filtering positively on the one status that means "here",
 * which cannot drift the same way: a new status added later is excluded by
 * default rather than silently included.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePatient(request, 'patient:read')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, patient_id, name')
      .eq('status', 'Active')
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: patients || [] })
  } catch (error) {
    console.error('Error fetching active patients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 }
    )
  }
}
