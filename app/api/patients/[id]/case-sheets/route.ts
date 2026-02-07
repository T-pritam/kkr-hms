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
      .from('patient_case_sheets')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching case sheets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch case sheets' },
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

    const caseSheetData = {
      patient_id: patientId,
      patient_billing_id: body.patient_billing_id,
      discharge_date: body.discharge_date,
      discharge_notes: body.discharge_notes,
      case_sheet_url: body.case_sheet_url,
      case_sheet_filename: body.case_sheet_filename,
      uploaded_at: body.case_sheet_url ? new Date().toISOString() : null,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_case_sheets')
      .insert(caseSheetData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating case sheet:', error);
    return NextResponse.json(
      { error: 'Failed to create case sheet' },
      { status: 500 }
    );
  }
}
