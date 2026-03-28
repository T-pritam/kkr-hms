import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

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
    const { searchParams } = new URL(request.url);
    const billingId = searchParams.get('billing_id');

    let query = supabase
      .from('patient_charges')
      .select(`
        *,
        users!created_by(id, username)
      `)
      .eq('patient_id', patientId);

    if (billingId) {
      query = query.eq('patient_billing_id', billingId);
    }

    const { data, error } = await query.order('charge_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching charges:', error);
    return NextResponse.json(
      { error: 'Failed to fetch charges' },
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

    const chargeData = {
      patient_id: patientId,
      patient_billing_id: body.patient_billing_id,
      charge_type: body.charge_type,
      description: body.description,
      amount: body.amount,
      charge_date: body.charge_date || new Date().toISOString().split('T')[0],
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_charges')
      .insert(chargeData)
      .select()
      .single();

    if (error) throw error;

    // Recalculate billing totals
    if (body.patient_billing_id) {
      await recalculatePatientBilling(supabase, body.patient_billing_id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating charge:', error);
    return NextResponse.json(
      { error: 'Failed to create charge' },
      { status: 500 }
    );
  }
}
