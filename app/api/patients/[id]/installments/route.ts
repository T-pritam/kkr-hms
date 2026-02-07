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
      .from('patient_billing_installments')
      .select(`
        *,
        users!created_by(id, username)
      `)
      .eq('patient_billing_id', billingId)
      .order('installment_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching installments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch installments' },
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

    // Get next installment number
    const { data: existingInstallments } = await supabase
      .from('patient_billing_installments')
      .select('installment_number')
      .eq('patient_billing_id', body.patient_billing_id)
      .order('installment_number', { ascending: false })
      .limit(1);

    const nextInstallmentNumber = existingInstallments && existingInstallments.length > 0
      ? existingInstallments[0].installment_number + 1
      : 1;

    const installmentData = {
      patient_billing_id: body.patient_billing_id,
      installment_number: nextInstallmentNumber,
      amount: body.amount,
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      payment_method: body.payment_method || 'cash',
      transaction_reference: body.transaction_reference,
      remarks: body.remarks,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_billing_installments')
      .insert(installmentData)
      .select()
      .single();

    if (error) throw error;

    // Update patient_paid_amount in patient_billing
    const { data: allInstallments } = await supabase
      .from('patient_billing_installments')
      .select('amount')
      .eq('patient_billing_id', body.patient_billing_id);

    const totalPaid = allInstallments?.reduce((sum, inst) => sum + Number(inst.amount), 0) || 0;

    await supabase
      .from('patient_billing')
      .update({ patient_paid_amount: totalPaid })
      .eq('id', body.patient_billing_id);

    // Optionally create ledger entry
    if (body.create_ledger_entry) {
      await supabase
        .from('daily_ledger_transactions')
        .insert({
          transaction_date: body.payment_date || new Date().toISOString().split('T')[0],
          transaction_type: 'credit',
          source: 'patient',
          amount: body.amount,
          payment_mode: body.payment_method || 'cash',
          reference_number: body.transaction_reference,
          patient_id: patientId,
          description: `Patient installment payment #${nextInstallmentNumber}`,
          notes: body.remarks,
          status: 'pending',
          created_by: authResult.user.id,
        });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating installment:', error);
    return NextResponse.json(
      { error: 'Failed to create installment' },
      { status: 500 }
    );
  }
}
