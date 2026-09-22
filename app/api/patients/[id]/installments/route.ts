import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireBilling } from '@/lib/billing/authz';
import { getActiveClosures } from '@/lib/ledger/closure';
import { isDeskPaymentKind, recordPayment, validatePayment, type PaymentKind } from '@/lib/billing/payments';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read');
    if (auth.response) return auth.response;

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

/**
 * Record a payment. It always comes with its ledger credit — the two are one
 * record now (lib/billing/payments.ts, PRD v2 CR-12).
 *
 * `kind` is the payment's label: regular (default), advance, discharge or misc,
 * as the desk picks; or registration, for the registration fee's "Collect now"
 * (CR-11, at most once per bill). Lab and medicine payments are made from the
 * charge they belong to (…/charges/[chargeId]/lab-medicine), never here.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'payment:write');
    if (auth.response) return auth.response;
    const { user } = auth;

    const { id: patientId } = await params;
    const body = await request.json().catch(() => ({}));

    // 'payment' is what clients sent before labels existed; it means regular.
    const kind: PaymentKind =
      body.kind === undefined || body.kind === null || body.kind === '' || body.kind === 'payment'
        ? 'regular'
        : body.kind;
    if (kind === 'lab' || kind === 'medicine') {
      return NextResponse.json(
        { error: 'Lab and medicine payments are collected from their charge on the Charges tab' },
        { status: 400 }
      );
    }
    if (!isDeskPaymentKind(kind) && kind !== 'registration') {
      return NextResponse.json({ error: 'Invalid payment label' }, { status: 400 });
    }

    // Every rule that can be checked without writing is checked here, before
    // anything is written (G-04: the payment used to be saved first).
    const check = validatePayment(body);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, fieldErrors: check.fieldErrors },
        { status: check.status }
      );
    }

    const supabase = await createClient();

    const result = await recordPayment(supabase, {
      patientId,
      billingId: body.patient_billing_id,
      kind,
      input: check.value,
      userId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
          ...(result.closure ? { closure: result.closure } : {}),
        },
        { status: result.status }
      );
    }

    return NextResponse.json(result.installment);
  } catch (error) {
    console.error('Error creating installment:', error);
    return NextResponse.json(
      { error: 'Failed to create installment' },
      { status: 500 }
    );
  }
}
