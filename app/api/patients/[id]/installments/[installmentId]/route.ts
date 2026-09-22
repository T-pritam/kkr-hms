import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireBilling } from '@/lib/billing/authz';
import { assertLedgerDateOpen } from '@/lib/ledger/closure';
import { deletePayment, updatePayment, validatePayment } from '@/lib/billing/payments';

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

const INSTALLMENT_COLUMNS =
  'id, created_by, patient_billing_id, installment_number, amount, payment_date, payment_method, transaction_reference, remarks, kind, ledger_transaction_id';

/**
 * Delete a payment — and its ledger credit with it (PRD v2 CR-12). Deleting a
 * registration payment puts the registration fee back to "not collected".
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installmentId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'payment:write');
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabase = await createClient();
    const { installmentId } = await params;

    const { data: installment } = await supabase
      .from('patient_billing_installments')
      .select(INSTALLMENT_COLUMNS)
      .eq('id', installmentId)
      .single();

    if (!installment) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }

    if (user.role !== 'ADMIN' && installment.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Once the ledger day this payment sits on has been closed, its entry is
    // reconciled — deleting the payment would leave that closure disagreeing
    // with reality, so this is the same rule creating a new entry already has.
    const locked = await assertLedgerDateOpen(supabase, installment.payment_date, 'delete');
    if (locked) return locked;

    const verified = await assertNotVerified(supabase, installment.ledger_transaction_id);
    if (verified) return verified;

    await deletePayment(supabase, installment);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting installment:', error);
    return NextResponse.json(
      { error: 'Failed to delete installment' },
      { status: 500 }
    );
  }
}

/**
 * Edit a payment — and its ledger credit with it (PRD v2 CR-12). Fields the
 * caller leaves out keep their stored values. A payment's kind never changes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installmentId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'payment:write');
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabase = await createClient();
    const { installmentId } = await params;
    const body = await request.json().catch(() => ({}));

    const { data: installment } = await supabase
      .from('patient_billing_installments')
      .select(INSTALLMENT_COLUMNS)
      .eq('id', installmentId)
      .single();

    if (!installment) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }

    if (user.role !== 'ADMIN' && installment.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const check = validatePayment(body, {
      amount: Number(installment.amount),
      payment_date: installment.payment_date,
      payment_method: installment.payment_method,
      transaction_reference: installment.transaction_reference,
      remarks: installment.remarks,
    });
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, fieldErrors: check.fieldErrors },
        { status: check.status }
      );
    }

    // Same rule as delete: a payment on an already-closed day is reconciled
    // and must not move. Also guard the date being moved *to*, if this edit
    // changes it, so a closed day can't be backed into either.
    const locked = await assertLedgerDateOpen(supabase, installment.payment_date, 'update');
    if (locked) return locked;
    if (check.value.payment_date !== installment.payment_date) {
      const targetLocked = await assertLedgerDateOpen(supabase, check.value.payment_date, 'update');
      if (targetLocked) return targetLocked;
    }

    const verified = await assertNotVerified(supabase, installment.ledger_transaction_id);
    if (verified) return verified;

    const result = await updatePayment(supabase, {
      installment,
      input: check.value,
      userId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status }
      );
    }

    return NextResponse.json(result.installment);
  } catch (error) {
    console.error('Error updating installment:', error);
    return NextResponse.json(
      { error: 'Failed to update installment' },
      { status: 500 }
    );
  }
}
