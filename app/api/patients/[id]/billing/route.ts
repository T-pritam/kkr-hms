import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { requireBilling } from '@/lib/billing/authz';
import {
  canAmendPayout,
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
        updated_by_user:users!updated_by(id, username),
        referral_commission_set_by_user:users!referral_commission_set_by(id, username),
        referral_status_set_by_user:users!referral_status_set_by(id, username),
        referral_given_by_user:users!referral_given_by_user_id(id, username),
        referral_given_by_set_by_user:users!referral_given_by_set_by(id, username)
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

    // The registration fee on each bill (PRD v2 Q-43, round 8): while it is
    // pending, whatever the catalogue says now — nothing is written until it is
    // collected; once collected, what was taken.
    const billings = billingRecords ?? [];
    const feeItem = billings.length > 0 ? await getRegistrationFeeItem(supabase) : null;
    const collectedByBill = new Map<string, number>();
    if (billings.length > 0) {
      const { data: feePayments } = await supabase
        .from('patient_billing_installments')
        .select('patient_billing_id, amount')
        .eq('kind', 'registration')
        .in('patient_billing_id', billings.map((b: any) => b.id));
      for (const p of feePayments ?? []) {
        collectedByBill.set(p.patient_billing_id, (collectedByBill.get(p.patient_billing_id) ?? 0) + Number(p.amount));
      }
    }

    return NextResponse.json({
      billings: billings.map((b: any) => {
        const collected = collectedByBill.get(b.id);
        const pending = collected === undefined && b.registration_fee_status === 'pending';
        return {
          ...b,
          ...(collected !== undefined && b.registration_fee_status === 'pending'
            ? { registration_fee_status: 'collected' }
            : {}),
          registration_fee_amount: pending ? (feeItem?.amount ?? 0) : (collected ?? 0),
        };
      }),
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

    /**
     * One bill per patient. A returning patient is registered again (Q-74,
     * CR-17 dropped), and every screen reads the one bill — so a second, from a
     * double submit or two tabs, split the payments and charges across two
     * records while the screens showed only one (BUGS #22). A unique index
     * (`20260925000005`) closes the race this check alone cannot.
     */
    const { data: existing, error: existingError } = await supabase
      .from('patient_billing')
      .select('id')
      .eq('patient_id', patientId)
      .limit(1);
    // A failed read must not look like "no bill yet".
    if (existingError) throw existingError;
    if ((existing ?? []).length > 0) {
      return NextResponse.json(
        { error: 'This patient already has a bill', code: 'BILL_EXISTS', billing_id: existing![0].id },
        { status: 409 }
      );
    }

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

    // Two requests racing past the check above meet the unique index here.
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'This patient already has a bill', code: 'BILL_EXISTS' },
        { status: 409 }
      );
    }
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
      .select(
        'id, patient_id, referral_settled, referral_commission_set_by, referral_commission_amount, referral_settlement_notes, referral_settlement_given_by, referral_given_by_user_id, referral_settlement_payment_method, referral_transaction_ref, referral_settlement_date'
      )
      .eq('id', body.billing_id)
      .maybeSingle();

    if (!target || target.patient_id !== patientId) {
      return NextResponse.json(
        { error: 'That billing record does not belong to this patient' },
        { status: 404 }
      );
    }

    const settled = Boolean(target.referral_settled);

    const changingAmount =
      body.referral_commission_amount !== undefined &&
      Number(body.referral_commission_amount) !== Number(target.referral_commission_amount ?? 0);

    // The dialog always sends `referral_id`, so compare it against what the
    // patient actually has rather than treating every save as a change.
    const { data: patientRow } = await supabase
      .from('patients')
      .select('referred_by')
      .eq('id', patientId)
      .maybeSingle();

    const changingReferralPerson =
      body.referral_id !== undefined &&
      (body.referral_id || null) !== (patientRow?.referred_by || null);

    const changingSettledFlag =
      body.referral_settled !== undefined && body.referral_settled !== target.referral_settled;

    /**
     * Every other fact about the payout: its notes, mode, reference, date and
     * who carried the cash. Compared rather than checked for presence, because
     * the dialog resends what it did not change.
     */
    const differs = (field: string, next: unknown) =>
      next !== undefined && String(next ?? '') !== String((target as Record<string, unknown>)[field] ?? '');
    const changingPayoutDetails =
      differs('referral_settlement_notes', body.referral_settlement_notes) ||
      differs('referral_settlement_given_by',
        body.referral_settlement_given_by === undefined ? undefined : body.referral_settlement_given_by?.trim() || null) ||
      differs('referral_given_by_user_id', body.referral_given_by_user_id) ||
      differs('referral_settlement_payment_method', body.referral_settlement_payment_method) ||
      differs('referral_transaction_ref', body.referral_settlement_transaction_ref) ||
      differs('referral_settlement_date', body.referral_settlement_date);

    /**
     * While it is unsettled the commission is the desk's — the amount and the
     * referral person both (client revision, 2026-09-24, replacing Q-20). Once
     * it is settled it is the admin's alone — Q-88: *"reception can do nothing,
     * not even un-settle"* — and that covers every field. This guard used to
     * watch only the amount, the person and the paid flag, so reception could
     * still rewrite who carried a settled commission, or its mode and notes.
     */
    if (
      settled &&
      (changingAmount || changingReferralPerson || changingSettledFlag || changingPayoutDetails)
    ) {
      const allowed = canAmendPayout(authResult.user, { settled: true, noun: 'commission' });
      if (!allowed.ok) {
        return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status });
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
      // Still recorded on every change — it is the audit trail now, not a lock.
      // An admin correcting a settled commission amends it in place; there is no
      // ledger debit to keep in step, because a payout no longer writes one.
      if (changingAmount) {
        updateData.referral_commission_set_by = authResult.user.id;
        updateData.referral_commission_set_at = new Date().toISOString();
      }
    }
    if (body.referral_settlement_notes !== undefined) {
      updateData.referral_settlement_notes = body.referral_settlement_notes;
    }
    // Only when this request is not also settling: a settle routes given-by
    // through the payout path, which records the picked user beside the typed
    // name, and a blind write here afterwards would erase it.
    const settlingNow = body.referral_settled === true && !target.referral_settled;
    if (body.referral_settlement_given_by !== undefined && !settlingNow) {
      updateData.referral_settlement_given_by = body.referral_settlement_given_by?.trim() || null;
      updateData.referral_given_by_user_id = body.referral_given_by_user_id || null;
      updateData.referral_given_by_set_by = authResult.user.id;
      updateData.referral_given_by_set_at = new Date().toISOString();
    }
    if (body.referral_settlement_payment_method !== undefined) {
      updateData.referral_settlement_payment_method = body.referral_settlement_payment_method;
    }
    if (body.referral_settlement_transaction_ref !== undefined) {
      updateData.referral_transaction_ref = body.referral_settlement_transaction_ref;
    }
    if (body.referral_settled !== undefined && body.referral_settled !== target.referral_settled) {
      // Paying is not a flag: it moves money, so it goes through the one payout
      // path, which records who paid it, who carried it and how (CR-13). No
      // ledger entry — the money comes straight from the admin.
      if (body.referral_settled === true) {
        const details = validatePayout({
          payment_method: body.referral_settlement_payment_method,
          transaction_reference: body.referral_settlement_transaction_ref,
          notes: body.referral_settlement_notes,
          given_by_user_id: body.referral_given_by_user_id,
          given_by: body.referral_settlement_given_by,
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
