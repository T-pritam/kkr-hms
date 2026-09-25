import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canModify, isAdmin } from '@/lib/authz/ownership';
import { requireBilling } from '@/lib/billing/authz';
import { istFields } from '@/lib/consultations/ist';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; consultationId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:write');
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabase = await createClient();
    const { id: patientId, consultationId } = await params;
    const body = await request.json();

    // Check if consultation exists and verify permissions
    const { data: consultation, error: fetchError } = await supabase
      .from('patient_consultations')
      .select('*')
      .eq('id', consultationId)
      .eq('patient_id', patientId)
      .single();

    if (fetchError || !consultation) {
      return NextResponse.json(
        { error: 'Consultation not found' },
        { status: 404 }
      );
    }

    /**
     * Your own visit, unless you are the admin — and, for the desk, only until
     * its fee is paid (§3.2 row 6: "Doctor visit · own · locks when its fee is
     * paid"). DELETE already refused a paid visit; an edit did not, so
     * reception could move a paid visit to another doctor or purpose, leaving
     * the fee that paid for it describing visits that no longer match.
     */
    let paid = false;
    if (consultation.settlement_id) {
      const { data: settlement } = await supabase
        .from('doctor_visit_settlements')
        .select('settled, deleted_at')
        .eq('id', consultation.settlement_id)
        .maybeSingle();
      paid = settlement?.settled === true && !settlement?.deleted_at;
    }

    // Row 6 locks the visit *for the desk*; the admin may still correct it —
    // the same as a paid fee, which is the admin's alone (Q-88).
    const allowed = canModify(user, {
      created_by: consultation.created_by,
      locked: paid && !isAdmin(user),
      lockReason: "This visit's fee has been paid. Only an admin can change it now.",
    });
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status });
    }

    // An edit must not be able to clear the doctor, now that creating without one is
    // refused. Note `'doctor_id' in body` rather than a bare falsy check: this route's
    // model is "omitted means unchanged", so a bare check would reject every edit that
    // only touches the notes.
    if ('doctor_id' in body && !body.doctor_id) {
      return NextResponse.json(
        { error: 'Select the doctor for this consultation' },
        { status: 400 }
      );
    }

    // Same reasoning as the doctor: an edit must not be able to clear the purpose
    // and drop the visit back into the unpriced bucket.
    if ('visit_purpose_id' in body && !body.visit_purpose_id) {
      return NextResponse.json(
        { error: 'Select what this visit was for' },
        { status: 400 }
      );
    }

    // Update consultation
    const updateData: any = {
      doctor_id: body.doctor_id !== undefined ? body.doctor_id : consultation.doctor_id,
      visit_purpose_id:
        body.visit_purpose_id !== undefined ? body.visit_purpose_id : consultation.visit_purpose_id,
      notes: body.notes !== undefined ? body.notes : consultation.notes,
      billing_id: body.billing_id !== undefined ? body.billing_id : consultation.billing_id,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    // Convert consultation_date to UTC if provided
    if (body.consultation_date !== undefined) {
      const localDate = new Date(body.consultation_date);
      if (Number.isNaN(localDate.getTime())) {
        return NextResponse.json({ error: 'Enter a valid visit date' }, { status: 400 });
      }

      // The same rule as recording a visit: not before the patient joined,
      // compared as IST calendar days. Only creating checked it, so an edit
      // could move a visit to before the admission (BUGS #14).
      const { data: patient } = await supabase
        .from('patients')
        .select('date_of_join')
        .eq('id', patientId)
        .maybeSingle();
      if (patient?.date_of_join && istFields(localDate).date < String(patient.date_of_join).slice(0, 10)) {
        return NextResponse.json(
          { error: 'Consultation date cannot be before patient join date' },
          { status: 400 }
        );
      }

      updateData.consultation_date = localDate.toISOString();
    } else {
      updateData.consultation_date = consultation.consultation_date;
    }

    const { data, error } = await supabase
      .from('patient_consultations')
      .update(updateData)
      .eq('id', consultationId)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        created_by_user:users!created_by(id, username, email)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating consultation:', error);
    return NextResponse.json(
      { error: 'Failed to update consultation' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; consultationId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:write');
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabase = await createClient();
    const { id: patientId, consultationId } = await params;

    // Check if consultation exists
    const { data: consultation, error: fetchError } = await supabase
      .from('patient_consultations')
      .select('*')
      .eq('id', consultationId)
      .eq('patient_id', patientId)
      .single();

    if (fetchError || !consultation) {
      return NextResponse.json(
        { error: 'Consultation not found' },
        { status: 404 }
      );
    }


    // Your own visit, unless you are the admin (§3.2 row 6).
    const allowed = canModify(user, { created_by: consultation.created_by });
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status });
    }

    // Refuse only if *this visit's own* settlement has been settled — not merely
    // because some settlement exists for this doctor and patient. The old check
    // was scoped to (doctor, patient), so settling one visit's fee blocked
    // deleting every other visit with that doctor, settled or not, in any
    // billing cycle. Now that a visit knows which settlement (if any) actually
    // billed it, the guard can be exact.
    if (consultation.settlement_id) {
      const { data: settlement } = await supabase
        .from('doctor_visit_settlements')
        .select('id, settled')
        .eq('id', consultation.settlement_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (settlement?.settled) {
        return NextResponse.json(
          {
            error: 'Cannot delete a visit that has already been billed and paid',
            message: 'This visit has been settled. Unsettle its settlement first, or contact an administrator.',
            settlementFound: true,
          },
          { status: 409 }
        );
      }
    }

    // Soft delete consultation (mark as deleted)
    const { error: deleteError } = await supabase
      .from('patient_consultations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', consultationId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ 
      success: true,
      message: 'Consultation deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting consultation:', error);
    return NextResponse.json(
      { error: 'Failed to delete consultation', details: String(error) },
      { status: 500 }
    );
  }
}
