import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { assertLedgerDateOpen, getActiveClosures } from '@/lib/ledger/closure';
import { createLedgerTransaction } from '@/lib/ledger/transactions';

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
        users!created_by(id, username),
        updated_by_user:users!updated_by(id, username),
        ledger_transaction:daily_ledger_transactions!ledger_transaction_id(status)
      `)
      .eq('patient_billing_id', billingId)
      .order('installment_number', { ascending: true });

    if (error) throw error;

    // A payment can no longer be edited/deleted once either fact is true: its
    // own date has been closed, or an admin has already verified the ledger
    // credit it created — "settled", in the word staff actually use, day to
    // day, well before the whole day gets closed. Neither is a property of the
    // installment row itself, so both are decorated on here rather than left
    // for the client to work out.
    const dates = (data ?? []).map((row) => row.payment_date).filter(Boolean);
    let decorated = data ?? [];

    if (dates.length > 0) {
      const minDate = dates.reduce((a, b) => (a < b ? a : b));
      const maxDate = dates.reduce((a, b) => (a > b ? a : b));
      const closures = await getActiveClosures(supabase, minDate, maxDate);
      decorated = decorated.map((row) => ({
        ...row,
        day_closed: closures.has(row.payment_date),
        ledger_verified: row.ledger_transaction?.status === 'verified',
      }));
    }

    return NextResponse.json(decorated);
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

    const ledgerDate = body.payment_date || new Date().toISOString().split('T')[0];

    // Guard before anything is written. The ledger entry is created after the
    // installment, so refusing it later would leave the payment recorded against
    // the bill with no matching credit in a day that has already been reconciled.
    if (body.create_ledger_entry) {
      const locked = await assertLedgerDateOpen(supabase, ledgerDate, 'create');
      if (locked) return locked;
    }

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

    // Optionally create ledger entry. Routed through lib/ledger so it is subject
    // to the same validation and the same closed-day rule as every other entry —
    // this path used to insert straight into the table and skip both.
    if (body.create_ledger_entry) {
      // The description used to read "Patient installment payment #1" — true,
      // but useless on the ledger, which already says `source: 'patient'` and
      // links the row to this patient. What it actually needs is which patient.
      const { data: patient } = await supabase
        .from('patients')
        .select('patient_id, name')
        .eq('id', patientId)
        .single();

      const result = await createLedgerTransaction(supabase, {
        transaction_date: ledgerDate,
        transaction_type: 'credit',
        source: 'patient',
        amount: body.amount,
        payment_mode: body.payment_method || 'cash',
        reference_number: body.transaction_reference,
        patient_id: patientId,
        description: patient ? `${patient.patient_id} ${patient.name}` : `Patient installment payment #${nextInstallmentNumber}`,
        notes: body.remarks,
        created_by: authResult.user.id,
      });

      if (!result.ok) {
        console.error('Installment ledger entry rejected:', result.error);
        return NextResponse.json(
          { error: result.error, ...(result.code ? { code: result.code } : {}) },
          { status: result.status }
        );
      }

      // Link the two rows so later reads/writes can ask "has this payment been
      // verified" directly, instead of matching by date + amount.
      const ledgerTransactionId = result.rows[0]?.id;
      if (ledgerTransactionId) {
        await supabase
          .from('patient_billing_installments')
          .update({ ledger_transaction_id: ledgerTransactionId })
          .eq('id', data.id);
      }
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
