import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

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
        created_by_user:users!created_by(id, username, email)
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
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;
    const patientId = id;
    const body = await request.json();

    // Validate required fields (doctor_id is now optional)
    if (!body.doctor_id && !body.notes) {
      return NextResponse.json(
        { error: 'At least doctor_id or notes must be provided' },
        { status: 400 }
      );
    }

    // Validate consultation date is after patient join date
    const { data: patient } = await supabase
      .from('patients')
      .select('date_of_join')
      .eq('id', patientId)
      .single();

    if (patient?.date_of_join) {
      const consultationDate = new Date(body.consultation_date || new Date());
      const joinDate = new Date(patient.date_of_join);
      
      if (consultationDate < joinDate) {
        return NextResponse.json(
          { error: 'Consultation date cannot be before patient join date' },
          { status: 400 }
        );
      }
    }

    // Calculate visit_number: count consultations for this doctor and patient
    let visitNumber = 1;
    if (body.doctor_id) {
      const { data: existingConsultations } = await supabase
        .from('patient_consultations')
        .select('id', { count: 'exact' })
        .eq('patient_id', patientId)
        .eq('doctor_id', body.doctor_id)
        .is('deleted_at', null);

      visitNumber = (existingConsultations?.length || 0) + 1;
    }

    // Convert consultation_date to UTC if provided
    let consultationDateUTC = new Date().toISOString();
    if (body.consultation_date) {
      // Parse the date string from frontend (which is in local timezone)
      const localDate = new Date(body.consultation_date);
      // Convert to UTC by getting ISO string
      consultationDateUTC = localDate.toISOString();
    }

    const consultationData = {
      patient_id: patientId,
      doctor_id: body.doctor_id || null,
      consultation_date: consultationDateUTC,
      visit_number: visitNumber,
      notes: body.notes || null,
      billing_id: body.billing_id || null,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_consultations')
      .insert(consultationData)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        created_by_user:users!created_by(id, username, email)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating consultation:', error);
    return NextResponse.json(
      { error: 'Failed to create consultation' },
      { status: 500 }
    );
  }
}
