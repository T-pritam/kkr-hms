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

    // Update consultation
    const updateData: any = {
      doctor_id: body.doctor_id !== undefined ? body.doctor_id : consultation.doctor_id,
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

    // Check if this consultation has related settled settlements
    if (consultation.doctor_id) {
      const { data: settlements } = await supabase
        .from('doctor_visit_settlements')
        .select('id, settled')
        .eq('doctor_id', consultation.doctor_id)
        .eq('patient_id', patientId)
        .eq('settled', true)
        .is('deleted_at', null);

      if (settlements && settlements.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot delete consultation with settled fees',
            message: 'This consultation has been settled. Please unsettled or delete it first or contact an administrator.',
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
