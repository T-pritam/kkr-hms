import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { payDoctorFee, validatePayout } from '@/lib/billing/payouts';
import { verifyAuth } from '@/lib/auth/verify';
import { requireBilling } from '@/lib/billing/authz';

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
      .from('doctor_visit_settlements')
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        patient:patients(id, patient_id, name),
        created_by_user:users!created_by(id, username),
        updated_by_user:users!updated_by(id, username),
        settled_by_user:users!settled_by(id, username),
        amount_set_by_user:users!amount_set_by(id, username),
        status_set_by_user:users!status_set_by(id, username),
        given_by_user:users!given_by_user_id(id, username),
        given_by_set_by_user:users!given_by_set_by(id, username)
      `)
      .eq('patient_billing_id', billingId)
      // BUGS.md #25 — this listing omitted the filter that sync and the billing
      // roll-up both apply, so a deleted settlement showed in the table and the
      // patient PDF while contributing nothing to the totals beside it.
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching settlements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settlements' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    /**
     * Raising a fee row is desk work: reception prices doctor fees and makes
     * manual rows (Q-19 a–c), and `create-manual`, `merge` and `sync` already
     * say so with `doctor-fee:write`. This route was the one still checking for
     * ADMIN by hand, so the same act was allowed or refused depending on which
     * URL it arrived at.
     */
    const authResult = await requireBilling(request, 'doctor-fee:write');
    if (authResult.response) return authResult.response;

    const supabase = await createClient();
    const { id } = await params;
    const patientId = id;
    const body = await request.json();

    const visitCount = Number(body.visit_count) || 0;
    const perVisit = Number(body.amount_per_visit) || 0;
    const now = new Date().toISOString();

    /**
     * `total_amount` is what the patient's Overview and the pending list read,
     * and it is a plain column — nothing derives it. This route was the one
     * write path still leaving it null (BUGS #26), so a fee priced here counted
     * as nothing. Computed exactly as the pricing route does, and stamped with
     * who set the amount, like every other pricing path.
     */
    const settlementData = {
      patient_billing_id: body.patient_billing_id,
      patient_id: patientId,
      doctor_id: body.doctor_id,
      visit_count: visitCount,
      amount_per_visit: perVisit,
      total_amount: Math.floor(perVisit * visitCount),
      ...(perVisit > 0 ? { amount_set_by: authResult.user.id, amount_set_at: now } : {}),
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .insert(settlementData)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        patient:patients(id, patient_id, name)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating settlement:', error);
    return NextResponse.json(
      { error: 'Failed to create settlement' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Paying out is `payout:write` on every other path (Q-19 f): reception may
    // hand a doctor's fee over as well as an admin.
    const authResult = await requireBilling(request, 'payout:write');
    if (authResult.response) return authResult.response;

    const supabase = await createClient();
    const body = await request.json();

    /**
     * The fourth way to pay a doctor fee, and the last one still setting the
     * flags by hand: it marked a fee settled with no payment mode, no record of
     * who handed the money over, and without making `total_amount` agree with
     * what was actually paid. Nothing in the app calls it, but it answers, so it
     * goes through the one payout path like the other three (CR-13).
     */
    // Scoped to the patient in the URL: any fee's id used to be payable from any
    // patient's address (BUGS #27).
    const { id: patientId } = await params;
    const { data: settlement } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .eq('id', body.settlement_id)
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!settlement) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    const details = validatePayout({
      payment_method: body.payment_method,
      transaction_reference: body.transaction_reference,
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

    const amount =
      body.settlement_amount !== undefined && body.settlement_amount !== null
        ? Number(body.settlement_amount)
        : Number(settlement.total_amount) || 0;

    const paid = await payDoctorFee(supabase, authResult.user, settlement, {
      amount,
      details: details.value,
    });

    if (!paid.ok) {
      return NextResponse.json(
        { error: paid.error, ...(paid.code ? { code: paid.code } : {}) },
        { status: paid.status }
      );
    }

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        patient:patients(id, patient_id, name)
      `)
      .eq('id', body.settlement_id)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error settling payment:', error);
    return NextResponse.json(
      { error: 'Failed to settle payment' },
      { status: 500 }
    );
  }
}
