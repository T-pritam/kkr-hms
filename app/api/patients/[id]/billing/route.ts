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
      .from('patient_billing')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patient billing' },
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

    // Get patient join date
    const { data: patient } = await supabase
      .from('patients')
      .select('date_of_join')
      .eq('id', patientId)
      .single();

    const joinDate = patient?.date_of_join || new Date().toISOString().split('T')[0];
    const monthYear = new Date(joinDate).toISOString().slice(0, 7);

    const billingData = {
      patient_id: patientId,
      base_charge: body.base_charge || 0,
      referral_commission_amount: body.referral_commission_amount || 0,
      joined_date: joinDate,
      month_year: monthYear,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_billing')
      .insert(billingData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to create patient billing' },
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
      return NextResponse.json({ error: 'Only admins can update billing' }, { status: 403 });
    }

    const supabase = await createClient();
    const body = await request.json();

    const updateData: any = {
      updated_by: authResult.user.id,
    };

    if (body.referral_commission_amount !== undefined) {
      updateData.referral_commission_amount = body.referral_commission_amount;
    }
    if (body.referral_settlement_notes !== undefined) {
      updateData.referral_settlement_notes = body.referral_settlement_notes;
    }
    if (body.referral_settled !== undefined) {
      updateData.referral_settled = body.referral_settled;
    }
    if (body.referral_settlement_date !== undefined) {
      updateData.referral_settlement_date = body.referral_settlement_date;
    }

    const { data, error } = await supabase
      .from('patient_billing')
      .update(updateData)
      .eq('id', body.billing_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to update patient billing' },
      { status: 500 }
    );
  }
}
