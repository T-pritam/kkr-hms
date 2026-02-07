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
    const updateData = {
      doctor_id: body.doctor_id || consultation.doctor_id,
      consultation_date: body.consultation_date || consultation.consultation_date,
      price_per_visit: body.price_per_visit !== undefined ? body.price_per_visit : consultation.price_per_visit,
      total_price: body.price_per_visit !== undefined ? body.price_per_visit : consultation.total_price,
      notes: body.notes || consultation.notes,
      updated_by: authResult.user.id,
      updated_at: new Date().toISOString(),
    };

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

    // Delete consultation
    const { error: deleteError } = await supabase
      .from('patient_consultations')
      .delete()
      .eq('id', consultationId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: 'Consultation deleted successfully' });
  } catch (error) {
    console.error('Error deleting consultation:', error);
    return NextResponse.json(
      { error: 'Failed to delete consultation' },
      { status: 500 }
    );
  }
}
