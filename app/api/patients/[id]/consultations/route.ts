import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { requireBilling } from '@/lib/billing/authz';
import { istFields } from '@/lib/consultations/ist';

/** A bulk entry covers at most this many days (a long stay's worth of rounds). */
const MAX_BULK_VISITS = 90

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;
    const patientId = id;

    const { data, error } = await supabase
      .from('patient_consultations')
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        created_by_user:users!created_by(id, username, email),
        updated_by_user:users!updated_by(id, username)
      `)
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('consultation_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching consultations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch consultations' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Recording a visit is desk work, like placing a charge (§3.2 row 6). Any
    // signed-in user could add one before, a lab technician included.
    const auth = await requireBilling(request, 'charge:write');
    if (auth.response) return auth.response;
    const authResult = { user: auth.user };

    const supabase = await createClient();
    const { id } = await params;
    const patientId = id;
    const body = await request.json();

    // A consultation names the doctor who gave it. The old rule admitted a row with notes
    // and no doctor, and those rows are invisible to the settlement sync — it groups by
    // doctor_id and skips the nulls — so the visit was recorded and never billable.
    // Existing doctor-less rows stay readable and editable; only new ones are refused.
    if (!body.doctor_id) {
      return NextResponse.json(
        { error: 'Select the doctor for this consultation' },
        { status: 400 }
      );
    }

    // What the visit was for. Settlement groups on this, so a visit without one
    // would fall into an unpriced bucket alongside every other purposeless visit
    // — which is precisely the "3 visits at one rate" problem this replaces.
    if (!body.visit_purpose_id) {
      return NextResponse.json(
        {
          error: 'Select what this visit was for',
          fieldErrors: { visit_purpose_id: 'Required' },
        },
        { status: 400 }
      );
    }

    const { data: purpose } = await supabase
      .from('visit_purposes')
      .select('id')
      .eq('id', body.visit_purpose_id)
      .maybeSingle();

    if (!purpose) {
      return NextResponse.json(
        { error: 'That is not a known visit purpose', fieldErrors: { visit_purpose_id: 'Unknown' } },
        { status: 400 }
      );
    }

    /**
     * One visit, or several at once (client, 28 Sep: entering a week of ward
     * rounds one by one took too long). `consultation_dates` is the list the
     * form's preview showed; every date is checked before any is written, so a
     * bad day saves none of them.
     */
    const bulk = Array.isArray(body.consultation_dates)
    const instants: string[] = bulk
      ? body.consultation_dates.map((d: unknown) => String(d))
      : [body.consultation_date || new Date().toISOString()];

    if (bulk && (instants.length === 0 || instants.length > MAX_BULK_VISITS)) {
      return NextResponse.json(
        { error: instants.length === 0 ? 'Pick at least one day' : `At most ${MAX_BULK_VISITS} visits at once` },
        { status: 400 }
      );
    }
    if (instants.some(i => Number.isNaN(Date.parse(i)))) {
      return NextResponse.json({ error: 'One of the visit dates is not a valid date' }, { status: 400 });
    }

    // Validate consultation date is after patient join date
    const { data: patient } = await supabase
      .from('patients')
      .select('date_of_join')
      .eq('id', patientId)
      .single();

    if (patient?.date_of_join) {
      // Compare IST calendar days, not instants. `date_of_join` is a bare YYYY-MM-DD and
      // parses as UTC midnight, so a visit entered between 00:00 and 05:29 IST on the
      // admission day is an instant on the *previous* UTC day and was rejected — an error
      // with no way round it from the form, which now defaults to today.
      const joinDay = String(patient.date_of_join).slice(0, 10);
      const early = instants.find(i => istFields(new Date(i)).date < joinDay);

      if (early) {
        return NextResponse.json(
          {
            error: bulk
              ? `${istFields(new Date(early)).date} is before the patient joined (${joinDay}) — nothing was added`
              : 'Consultation date cannot be before patient join date',
          },
          { status: 400 }
        );
      }
    }

    // Visit numbers carry on from this doctor's visits to this patient.
    const { data: existingConsultations } = await supabase
      .from('patient_consultations')
      .select('id', { count: 'exact' })
      .eq('patient_id', patientId)
      .eq('doctor_id', body.doctor_id)
      .is('deleted_at', null);
    const firstNumber = (existingConsultations?.length || 0) + 1;

    // No fee at visit entry — pricing happens at settle time, against the
    // settlement sync creates for this doctor+purpose. price_per_visit is left
    // at its column default.
    const rows = [...instants]
      .sort()
      .map((instant, index) => ({
        patient_id: patientId,
        doctor_id: body.doctor_id || null,
        visit_purpose_id: body.visit_purpose_id,
        consultation_date: new Date(instant).toISOString(),
        visit_number: firstNumber + index,
        notes: body.notes || null,
        billing_id: body.billing_id || null,
        created_by: authResult.user.id,
      }));

    const { data, error } = await supabase
      .from('patient_consultations')
      .insert(rows)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        created_by_user:users!created_by(id, username, email),
        updated_by_user:users!updated_by(id, username)
      `);

    if (error) throw error;

    return NextResponse.json(
      bulk ? { consultations: data, count: data?.length ?? 0 } : (Array.isArray(data) ? data[0] : data)
    );
  } catch (error) {
    console.error('Error creating consultation:', error);
    return NextResponse.json(
      { error: 'Failed to create consultation' },
      { status: 500 }
    );
  }
}
