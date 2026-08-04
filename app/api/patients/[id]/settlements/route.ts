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
    const { searchParams } = new URL(request.url);
    const billingId = searchParams.get('billing_id');

    if (!billingId) {
      return NextResponse.json(
        { error: 'billing_id is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name),
        created_by_user:users!created_by(id, username),
        updated_by_user:users!updated_by(id, username)
      `)
      .eq('patient_billing_id', billingId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching settlements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settlements' },
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

    const settlementData = {
      patient_billing_id: body.patient_billing_id,
      patient_id: patientId,
      doctor_id: body.doctor_id,
      visit_count: body.visit_count || 0,
      amount_per_visit: body.amount_per_visit || 0,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .insert(settlementData)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating settlement:', error);
    return NextResponse.json(
      { error: 'Failed to create settlement' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can settle payments' }, { status: 403 });
    }

    const supabase = await createClient();
    const body = await request.json();

    const updateData = {
      settled: true,
      settlement_date: body.settlement_date || new Date().toISOString(),
      settlement_amount: body.settlement_amount,
      settlement_notes: body.settlement_notes,
      payment_method: body.payment_method,
      transaction_reference: body.transaction_reference,
      updated_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .update(updateData)
      .eq('id', body.settlement_id)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error settling payment:', error);
    return NextResponse.json(
      { error: 'Failed to settle payment' },
      { status: 500 }
    );
  }
}
