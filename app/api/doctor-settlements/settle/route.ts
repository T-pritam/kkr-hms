/**
 * POST /api/doctor-settlements/settle — pay a doctor's fee from the patient's
 * Billing tab (PRD v2, CR-13).
 *
 * This route used to mark fees settled and write **nothing** to the ledger,
 * while the Finances screen's payout wrote the debit. The same payout was money
 * out of the hospital on one screen and invisible on the other (gaps G-09 …
 * G-12). Both now go through lib/billing/payouts.ts: one ledger OUT per payout,
 * carried on the settlement so un-paying can reverse it.
 *
 * Reception pays these too (Q-19 f). Their debit is born Open and waits for the
 * admin's close; an admin's is born Closed (Q-71 = A, Q-25 = A).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireBilling } from '@/lib/billing/authz';
import { payDoctorFee, validatePayout } from '@/lib/billing/payouts';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'payout:write');
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabase = await createClient();
    const body = await request.json();

    const ids: string[] = body.settlement_id
      ? [body.settlement_id]
      : Array.isArray(body.settlement_ids)
        ? body.settlement_ids
        : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'Either settlement_id or settlement_ids must be provided' },
        { status: 400 }
      );
    }

    // One amount per settlement, whether it came as `settlement_amount` for a
    // single fee or `settlement_amount_each` for several.
    const amount = Number(
      body.settlement_id ? body.settlement_amount : body.settlement_amount_each
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'The amount paid must be more than 0' },
        { status: 400 }
      );
    }

    // Look the rows up before checking how it was paid, so "no such settlement"
    // is reported as that rather than as a missing payment mode.
    const { data: settlements } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .in('id', ids)
      .is('deleted_at', null);

    if (!settlements || settlements.length === 0) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    // This route used to record a payout with no mode and no payer at all: it
    // set three flags on the row and stopped (CR-13).
    const details = validatePayout({
      payment_method: body.payment_method,
      transaction_reference: body.transaction_reference,
      // The screens have always called this `settlement_notes`.
      notes: body.settlement_notes,
      given_by_user_id: body.given_by_user_id,
      given_by: body.given_by,
    });
    if (!details.ok) {
      return NextResponse.json(
        { error: details.error, fieldErrors: details.fieldErrors },
        { status: details.status }
      );
    }

    const paid: any[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const settlement of settlements) {
      const result = await payDoctorFee(supabase, user, settlement, {
        amount,
        details: details.value,
        settlementType: body.settlement_type,
      });

      if (result.ok) paid.push(result.settlement);
      else skipped.push({ id: settlement.id, reason: result.error });
    }

    if (paid.length === 0) {
      return NextResponse.json(
        { error: skipped[0]?.reason || 'Nothing could be paid', skipped },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      settled_count: paid.length,
      data: body.settlement_id ? paid[0] : paid,
      skipped,
      message: `Successfully settled ${paid.length} doctor visit(s)`,
    });
  } catch (error) {
    console.error('Error settling doctor visits:', error);
    return NextResponse.json(
      { error: 'Failed to settle doctor visits', details: String(error) },
      { status: 500 }
    );
  }
}
