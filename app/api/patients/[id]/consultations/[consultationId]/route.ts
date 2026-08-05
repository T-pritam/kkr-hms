import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; consultationId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Check if user has permission to edit (creator or admin)
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', authResult.user.id)
      .single();

    const isAdmin = user?.role === 'ADMIN';
    const isCreator = consultation.created_by === authResult.user.id;

    if (!isAdmin && !isCreator) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this consultation' },
        { status: 403 }
      );
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
      updated_by: authResult.user.id,
      updated_at: new Date().toISOString(),
    };

    // Convert consultation_date to UTC if provided
    if (body.consultation_date !== undefined) {
      const localDate = new Date(body.consultation_date);
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
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Check if user has permission to delete
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', authResult.user.id)
      .single();

    const isAdmin = user?.role === 'ADMIN';
    const isCreator = consultation.created_by === authResult.user.id;

    // Only creator (if they created it) or admin can delete
    if (!isAdmin && !isCreator) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this consultation' },
        { status: 403 }
      );
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
