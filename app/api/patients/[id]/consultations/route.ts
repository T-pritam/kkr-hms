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

    // Validate consultation date is after patient join date
    const { data: patient } = await supabase
      .from('patients')
      .select('date_of_join')
      .eq('id', patientId)
      .single();

    if (patient?.date_of_join) {
      const consultationDate = new Date(body.consultation_date);
      const joinDate = new Date(patient.date_of_join);
      
      if (consultationDate < joinDate) {
        return NextResponse.json(
          { error: 'Consultation date cannot be before patient join date' },
          { status: 400 }
        );
      }
    }

    // Calculate visit_number: count consultations for this doctor and patient
    const { data: existingConsultations } = await supabase
      .from('patient_consultations')
      .select('id', { count: 'exact' })
      .eq('patient_id', patientId)
      .eq('doctor_id', body.doctor_id);

    const visitNumber = (existingConsultations?.length || 0) + 1;

    const consultationData = {
      patient_id: patientId,
      doctor_id: body.doctor_id,
      consultation_date: body.consultation_date,
      visit_number: visitNumber,
      price_per_visit: body.price_per_visit || 0,
      total_price: body.price_per_visit || 0,
      notes: body.notes,
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
