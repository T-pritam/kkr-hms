import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installmentId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { installmentId } = await params;

    // Check if user is admin or created this installment
    const { data: installment } = await supabase
      .from('patient_billing_installments')
      .select('created_by, patient_billing_id')
      .eq('id', installmentId)
      .single();

    if (!installment) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }

    if (authResult.user.role !== 'ADMIN' && installment.created_by !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('patient_billing_installments')
      .delete()
      .eq('id', installmentId);

    if (error) throw error;

    // Recalculate patient_paid_amount
    const { data: allInstallments } = await supabase
      .from('patient_billing_installments')
      .select('amount')
      .eq('patient_billing_id', installment.patient_billing_id);

    const totalPaid = allInstallments?.reduce((sum, inst) => sum + Number(inst.amount), 0) || 0;

    await supabase
      .from('patient_billing')
      .update({ patient_paid_amount: totalPaid })
      .eq('id', installment.patient_billing_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting installment:', error);
    return NextResponse.json(
      { error: 'Failed to delete installment' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installmentId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { installmentId } = await params;
    const body = await request.json();

    // Check if user is admin or created this installment
    const { data: installment } = await supabase
      .from('patient_billing_installments')
      .select('created_by, patient_billing_id')
      .eq('id', installmentId)
      .single();

    if (!installment) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }

    if (authResult.user.role !== 'ADMIN' && installment.created_by !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData = {
      amount: body.amount,
      payment_date: body.payment_date,
      payment_method: body.payment_method,
      transaction_reference: body.transaction_reference,
      remarks: body.remarks,
      updated_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_billing_installments')
      .update(updateData)
      .eq('id', installmentId)
      .select()
      .single();

    if (error) throw error;

    // Recalculate patient_paid_amount
    const { data: allInstallments } = await supabase
      .from('patient_billing_installments')
      .select('amount')
      .eq('patient_billing_id', installment.patient_billing_id);

    const totalPaid = allInstallments?.reduce((sum, inst) => sum + Number(inst.amount), 0) || 0;

    await supabase
      .from('patient_billing')
      .update({ patient_paid_amount: totalPaid })
      .eq('id', installment.patient_billing_id);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating installment:', error);
    return NextResponse.json(
      { error: 'Failed to update installment' },
      { status: 500 }
    );
  }
}
