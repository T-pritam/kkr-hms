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

    // Get patient with referral info
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, referred_by')
      .eq('id', patientId)
      .single();

    if (patientError) throw patientError;

    // Get patient billing records
    const { data: billingRecords, error: billingError } = await supabase
      .from('patient_billing')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (billingError) throw billingError;

    // Get referral details if patient has referred_by
    let referralData = null;
    if (patient?.referred_by) {
      const { data: referral, error: referralError } = await supabase
        .from('referrals')
        .select('id, name, phone, status')
        .eq('id', patient.referred_by)
        .single();

      if (!referralError) {
        referralData = referral;
      }
    }

    return NextResponse.json({
      billings: billingRecords,
      referral: referralData,
    });
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

    // Update patient's referred_by if referral_id is provided
    if (body.referral_id) {
      await supabase
        .from('patients')
        .update({ referred_by: body.referral_id })
        .eq('id', patientId);
    }

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
    const { id } = await params;
    const patientId = id;
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
    if (body.referral_settlement_payment_method !== undefined) {
      updateData.referral_settlement_payment_method = body.referral_settlement_payment_method;
    }
    if (body.referral_settlement_transaction_ref !== undefined) {
      updateData.referral_transaction_ref = body.referral_settlement_transaction_ref;
    }
    if (body.referral_settled !== undefined) {
      updateData.referral_settled = body.referral_settled;
    }
    if (body.referral_settlement_date !== undefined) {
      updateData.referral_settlement_date = body.referral_settlement_date;
    }
    if (body.base_charge !== undefined) {
      updateData.base_charge = body.base_charge;
    }

    const { data, error } = await supabase
      .from('patient_billing')
      .update(updateData)
      .eq('id', body.billing_id)
      .select()
      .single();

    if (error) throw error;

    // Update patient's referred_by if referral_id is provided
    if (body.referral_id !== undefined) {
      await supabase
        .from('patients')
        .update({ referred_by: body.referral_id }) // number OR null
        .eq('id', patientId);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to update patient billing' },
      { status: 500 }
    );
  }
}
