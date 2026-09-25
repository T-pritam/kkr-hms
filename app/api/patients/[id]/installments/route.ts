import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireBilling } from '@/lib/billing/authz';
import { isDeskPaymentKind, recordPayment, validatePayment, type PaymentKind } from '@/lib/billing/payments';
import { isLinkedKind } from '@/lib/billing/linked-charge';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read');
    if (auth.response) return auth.response;
    const { user } = auth;

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

    // A payment is locked once its own ledger entry is Closed (§3.2 row 9).
    // Dates no longer lock anything (CR-08), so this is now a property of the
    // one row the payment points at, decorated on here so the tab can hide the
    // actions rather than let them fail.
    const decorated = (data ?? []).map((row) => ({
      ...row,
      entry_closed: row.ledger_transaction?.status === 'closed',
      can_edit:
        row.ledger_transaction?.status !== 'closed' &&
        (user.role === 'ADMIN' || row.created_by === user.id),
    }));

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
 * as the desk picks; registration, for the registration fee's "Collect now"
 * (CR-11, at most once per bill); or lab, for "Add lab test". Those two also
 * write their line in Charges (lib/billing/linked-charge.ts).
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
    if (!isDeskPaymentKind(kind) && !isLinkedKind(kind)) {
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
      userRole: user.role,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
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
