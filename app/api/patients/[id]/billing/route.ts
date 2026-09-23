import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { canModify } from '@/lib/authz/ownership';
import { requireBilling } from '@/lib/billing/authz';
import {
  payReferralCommission,
  unpayReferralCommission,
  validatePayout,
} from '@/lib/billing/payouts';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';
import { validateBillingHeader } from '@/lib/billing/validate';
import { firstError } from '@/lib/patients/validate';
import { istToday } from '@/lib/dates/ist';
import { getRegistrationFeeItem } from '@/lib/billing/registration-fee';

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
    const { id } = await params;
    const patientId = id;

    // Get patient with referral info
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, referred_by')
      .eq('id', patientId)
      .single();

    if (patientError) throw patientError;

    // Get patient billing records
    const { data: billingRecords, error: billingError } = await supabase
      .from('patient_billing')
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        updated_by_user:users!updated_by(id, username)
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (billingError) throw billingError;

    // Get referral details if patient has referred_by
    let referralData = null;
    if (patient?.referred_by) {
      const { data: referral, error: referralError } = await supabase
        .from('referrals')
        .select('id, name, phone, status')
        .eq('id', patient.referred_by)
        .single();

      if (!referralError) {
        referralData = referral;
      }
    }

    // What the registration fee charged on each bill comes to, so the Payments
    // tab can say "registration fee ₹X not collected" (PRD v2 Q-43) while
    // registration_fee_status is 'pending'.
    const billings = billingRecords ?? [];
    const feeItem = billings.length > 0 ? await getRegistrationFeeItem(supabase) : null;
    const feeByBill = new Map<string, number>();
    if (feeItem) {
      const { data: feeCharges } = await supabase
        .from('patient_charges')
        .select('patient_billing_id, amount, qty')
        .eq('charge_item_id', feeItem.id)
        .in('patient_billing_id', billings.map((b: any) => b.id));
      for (const c of feeCharges ?? []) {
        feeByBill.set(
          c.patient_billing_id,
          (feeByBill.get(c.patient_billing_id) ?? 0) + Number(c.amount) * (Number(c.qty) || 1)
        );
      }
    }

    return NextResponse.json({
      billings: billings.map((b: any) => ({
        ...b,
        registration_fee_amount: feeByBill.get(b.id) ?? 0,
      })),
      referral: referralData,
    });
  } catch (error) {
    console.error('Error fetching patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patient billing' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Creating the bill is what makes charges and payments possible, so it is
    // held to the same capability (G-08: it used to accept any signed-in user).
    const auth = await requireBilling(request, 'charge:write');
    if (auth.response) return auth.response;
    const authResult = { user: auth.user };

    const supabase = await createClient();
    const { id } = await params;
    const patientId = id;
    const body = await request.json();

    // Get patient join date
    const { data: patient } = await supabase
      .from('patients')
      .select('date_of_join')
      .eq('id', patientId)
      .single();

    const joinDate = patient?.date_of_join || istToday();
    const monthYear = String(joinDate).slice(0, 7);

    // No base package any more (PRD v2 CR-15): a new bill never carries one.
    const billingData = {
      patient_id: patientId,
      base_charge: 0,
      referral_commission_amount: body.referral_commission_amount || 0,
      joined_date: joinDate,
      month_year: monthYear,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('patient_billing')
      .insert(billingData)
      .select()
      .single();

    if (error) throw error;

    // Update patient's referred_by if referral_id is provided
    if (body.referral_id) {
      await supabase
        .from('patients')
        .update({ referred_by: body.referral_id })
        .eq('id', patientId);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to create patient billing' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Reception sets the referral person and the commission now (Q-19 e).
    const auth = await requireBilling(request, 'billing:write');
    if (auth.response) return auth.response;
    const authResult = { user: auth.user };

    const supabase = await createClient();
    const { id } = await params;
    const patientId = id;
    const body = await request.json();

    // The billing row named in the body must be this patient's. Without this,
    // any admin could edit any patient's billing by supplying a different id
    // (BUGS.md #24).
    if (!body.billing_id) {
      return NextResponse.json({ error: 'billing_id is required' }, { status: 400 });
    }

    const { data: target } = await supabase
      .from('patient_billing')
      .select('id, patient_id, referral_settled, referral_commission_set_by, referral_ledger_transaction_id, referral_commission_amount')
      .eq('id', body.billing_id)
      .maybeSingle();

    if (!target || target.patient_id !== patientId) {
      return NextResponse.json(
        { error: 'That billing record does not belong to this patient' },
        { status: 404 }
      );
    }

    // Whoever last set the commission owns it (Q-20 = A), and a paid one is
    // locked until it is un-paid — the amount and the debit must agree.
    const changingAmount =
      body.referral_commission_amount !== undefined &&
      Number(body.referral_commission_amount) !== Number(target.referral_commission_amount ?? 0);

    if (changingAmount) {
      const allowed = canModify(authResult.user, {
        created_by: target.referral_commission_set_by ?? authResult.user.id,
        locked: Boolean(target.referral_settled),
        lockReason: 'This commission has been paid. Un-pay it before changing the amount.',
      });
      if (!allowed.ok) {
        return NextResponse.json(
          {
            error:
              allowed.code === 'NOT_YOUR_ENTRY'
                ? 'An admin set this commission, so only an admin can change it'
                : allowed.error,
            code: allowed.code,
          },
          { status: allowed.status }
        );
      }
    }

    const check = validateBillingHeader(body);
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_by: authResult.user.id,
    };

    if (body.referral_commission_amount !== undefined) {
      updateData.referral_commission_amount = body.referral_commission_amount;
      if (changingAmount) updateData.referral_commission_set_by = authResult.user.id;
    }
    if (body.referral_settlement_notes !== undefined) {
      updateData.referral_settlement_notes = body.referral_settlement_notes;
    }
    if (body.referral_settlement_given_by !== undefined) {
      updateData.referral_settlement_given_by = body.referral_settlement_given_by?.trim() || null;
    }
    if (body.referral_settlement_payment_method !== undefined) {
      updateData.referral_settlement_payment_method = body.referral_settlement_payment_method;
    }
    if (body.referral_settlement_transaction_ref !== undefined) {
      updateData.referral_transaction_ref = body.referral_settlement_transaction_ref;
    }
    if (body.referral_settled !== undefined && body.referral_settled !== target.referral_settled) {
      // Paying is not a flag: it moves money, so it goes through the one payout
      // path, which writes (or removes) the ledger OUT (CR-13).
      if (body.referral_settled === true) {
        const details = validatePayout({
          payment_method: body.referral_settlement_payment_method,
          transaction_reference: body.referral_settlement_transaction_ref,
          notes: body.referral_settlement_notes,
        });
        if (!details.ok) {
          return NextResponse.json(
            { error: details.error, fieldErrors: details.fieldErrors },
            { status: details.status }
          );
        }

        const paid = await payReferralCommission(
          supabase,
          authResult.user,
          { ...target, id: body.billing_id, patient_id: patientId },
          { details: details.value }
        );
        if (!paid.ok) {
          return NextResponse.json({ error: paid.error, code: paid.code }, { status: paid.status });
        }
      } else {
        const reversed = await unpayReferralCommission(supabase, authResult.user, {
          ...target,
          id: body.billing_id,
        });
        if (!reversed.ok) {
          return NextResponse.json({ error: reversed.error, code: reversed.code }, { status: reversed.status });
        }
      }
    }
    if (body.referral_settlement_date !== undefined) {
      updateData.referral_settlement_date = body.referral_settlement_date;
    }
    // The base package and its two "included in package" flags are gone (PRD v2
    // CR-15). Older clients may still send them; they are ignored, not stored.

    const { data, error } = await supabase
      .from('patient_billing')
      .update(updateData)
      .eq('id', body.billing_id)
      .select()
      .single();

    if (error) throw error;

    // Update patient's referred_by if referral_id is provided. `''` (the
    // referral picker cleared, or the field untouched while editing other
    // charges) must become null, not be written as-is.
    if (body.referral_id !== undefined) {
      await supabase
        .from('patients')
        .update({ referred_by: body.referral_id || null })
        .eq('id', patientId);
    }

    // Recalculate billing totals if relevant fields changed
    if (body.referral_commission_amount !== undefined) {
      await recalculatePatientBilling(supabase, body.billing_id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating patient billing:', error);
    return NextResponse.json(
      { error: 'Failed to update patient billing' },
      { status: 500 }
    );
  }
}
