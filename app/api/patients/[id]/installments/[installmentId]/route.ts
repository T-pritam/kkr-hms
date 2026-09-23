import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ENTRY_LOCKED } from '@/lib/authz/ownership';
import { requireBilling } from '@/lib/billing/authz';
import { deletePayment, isDeskPaymentKind, updatePayment, validatePayment } from '@/lib/billing/payments';

/**
 * Refuses when the ledger credit this payment created has already been
 * verified by an admin — staff call this "settled" well before the whole day
 * gets closed, and it is the more common of the two guards in practice
 * because a day is usually only closed at the end of it.
 */
async function assertEntryOpen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ledgerTransactionId: string | null,
): Promise<NextResponse | null> {
  if (!ledgerTransactionId) return null;

  const { data: transaction } = await supabase
    .from('daily_ledger_transactions')
    .select('status')
    .eq('id', ledgerTransactionId)
    .maybeSingle();

  if (transaction?.status !== 'closed') return null;

  return NextResponse.json(
    {
      error:
        'This payment is closed in the Daily Ledger and cannot be changed. An admin reopens the entry first.',
      code: ENTRY_LOCKED,
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

    // A payment locks when its own ledger entry is Closed (§3.2 row 9). Dates
    // no longer lock anything, so this is the only lock left.
    const closed = await assertEntryOpen(supabase, installment.ledger_transaction_id);
    if (closed) return closed;

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
 * caller leaves out keep their stored values.
 *
 * The label can move between the desk's own four (regular, advance, discharge,
 * misc). A lab, medicine or registration payment keeps its label, and a lab or
 * medicine payment keeps its amount — that comes from the charge it collected.
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

    const storedKind = installment.kind === 'payment' || !installment.kind ? 'regular' : installment.kind;
    let kind = storedKind;
    if (body.kind !== undefined && body.kind !== storedKind) {
      if (!isDeskPaymentKind(storedKind) || !isDeskPaymentKind(body.kind)) {
        return NextResponse.json(
          { error: 'This payment\'s label is set by the app and cannot be changed' },
          { status: 400 }
        );
      }
      kind = body.kind;
    }

    if (
      (storedKind === 'lab' || storedKind === 'medicine') &&
      body.amount !== undefined &&
      Number(body.amount) !== Number(installment.amount)
    ) {
      return NextResponse.json(
        {
          error:
            'This payment collected a lab/medicine charge, so its amount comes from that charge. Delete the payment and collect the charge again.',
          code: 'LAB_MEDICINE_AMOUNT_FIXED',
        },
        { status: 400 }
      );
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

    // Same rule as delete, and the only one: is this payment's ledger entry
    // closed? Backdating is allowed now (Q-22) — the entry simply stays Open.
    const closed = await assertEntryOpen(supabase, installment.ledger_transaction_id);
    if (closed) return closed;

    const result = await updatePayment(supabase, {
      installment,
      input: check.value,
      userId: user.id,
      kind,
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
