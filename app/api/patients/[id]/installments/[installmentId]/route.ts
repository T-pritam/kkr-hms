import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { assertLedgerDateOpen } from '@/lib/ledger/closure';

/**
 * Refuses when the ledger credit this payment created has already been
 * verified by an admin — staff call this "settled" well before the whole day
 * gets closed, and it is the more common of the two guards in practice
 * because a day is usually only closed at the end of it.
 */
async function assertNotVerified(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ledgerTransactionId: string | null,
): Promise<NextResponse | null> {
  if (!ledgerTransactionId) return null;

  const { data: transaction } = await supabase
    .from('daily_ledger_transactions')
    .select('status')
    .eq('id', ledgerTransactionId)
    .maybeSingle();

  if (transaction?.status !== 'verified') return null;

  return NextResponse.json(
    {
      error:
        'This payment has already been verified in the Daily Ledger and cannot be changed. Ask an admin to unverify it first.',
      code: 'LEDGER_ENTRY_VERIFIED',
    },
    { status: 409 },
  );
}

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
      .select('created_by, patient_billing_id, payment_date, ledger_transaction_id')
      .eq('id', installmentId)
      .single();

    if (!installment) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }

    if (authResult.user.role !== 'ADMIN' && installment.created_by !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Once the ledger day this payment sits on has been closed, its entry is
    // reconciled — deleting the payment would leave that closure disagreeing
    // with reality, so this is the same rule creating a new entry already has.
    const locked = await assertLedgerDateOpen(supabase, installment.payment_date, 'delete');
    if (locked) return locked;

    const verified = await assertNotVerified(supabase, installment.ledger_transaction_id);
    if (verified) return verified;

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
      .select('created_by, patient_billing_id, payment_date, ledger_transaction_id')
      .eq('id', installmentId)
      .single();

    if (!installment) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }

    if (authResult.user.role !== 'ADMIN' && installment.created_by !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Same rule as delete: a payment on an already-closed day is reconciled
    // and must not move. Also guard the date being moved *to*, if this edit
    // changes it, so a closed day can't be backed into either.
    const locked = await assertLedgerDateOpen(supabase, installment.payment_date, 'update');
    if (locked) return locked;

    if (body.payment_date && body.payment_date !== installment.payment_date) {
      const targetLocked = await assertLedgerDateOpen(supabase, body.payment_date, 'update');
      if (targetLocked) return targetLocked;
    }

    const verified = await assertNotVerified(supabase, installment.ledger_transaction_id);
    if (verified) return verified;

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
