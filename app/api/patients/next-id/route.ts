import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePatient } from '@/lib/patients/authz'

/**
 * The next patient ID, for prefilling the registration form.
 *
 * This is a *peek*: it does not consume a number. An abandoned registration
 * would otherwise leave a permanent gap in a series the hospital reads out over
 * the phone.
 *
 * The number returned here is therefore a suggestion, not a reservation. Two
 * people opening the form at once both see the same value; the one that is
 * actually issued comes from `next_patient_id()` inside POST /api/patients,
 * which takes a row lock. The form must send the field blank when the user has
 * not edited it, so that allocation happens server-side.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePatient(request, 'patient:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('peek_next_patient_id')

    if (error) throw error

    return NextResponse.json({ success: true, data: { patient_id: data } })
  } catch (error: any) {
    console.error('Error peeking next patient ID:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to read the next patient ID' },
      { status: 500 }
    )
  }
}
