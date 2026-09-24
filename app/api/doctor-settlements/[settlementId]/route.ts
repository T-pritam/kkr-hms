import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireBilling } from '@/lib/billing/authz';
import {
  canAmendPayout,
  payDoctorFee,
  unpayDoctorFee,
  validatePayout,
} from '@/lib/billing/payouts';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

/**
 * A single settlement — reprice it, settle or unsettle it, or remove it.
 *
 * `visit_count` used to be a number an admin could type into either a
 * "per visit" or a "total" pricing form, independent of how many visits actually
 * existed. That's how a settlement's count could drift from reality in the first
 * place. Now that `patient_consultations.settlement_id` records which visits a
 * settlement actually covers (20260809000002), the count is a fact derived from
 * those links, not an input — for a row with a `visit_purpose_id` (i.e., one the
 * sync endpoint created and tracks), only the rate is editable here, and
 * `total_amount` is always `amount_per_visit × the row's own stored visit_count`.
 *
 * A settlement with no `visit_purpose_id` — from `create-manual` or `merge` — was
 * never part of that tracking (it may deliberately span several purposes, or have
 * no linked visits at all), so it keeps the old freely-typed visit count.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'doctor-fee:write');
    if (auth.response) return auth.response;
    const authResult = { user: auth.user };

    const supabase = await createClient();
    const { settlementId } = await params;
    const body = await request.json();

    const { data: currentSettlement, error: fetchError } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    if (fetchError || !currentSettlement) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    // Auto-tracked rows (sync created them) have a purpose and a count that must
    // stay honest against the visits linked to them. Manual/merged rows have
    // neither guarantee to begin with, so they keep the old free-form editing.
    const isAutoTracked = currentSettlement.visit_purpose_id !== null;

    if (isAutoTracked && body.visit_count !== undefined) {
      return NextResponse.json(
        {
          error:
            'This settlement\'s visit count comes from the visits billed under it and cannot be edited directly. Fix it by correcting the visit records and syncing again.',
        },
        { status: 400 }
      );
    }

    const wantsAmountChange = body.amount_per_visit !== undefined || body.total_amount !== undefined;
    const wantsVisitCountChange = !isAutoTracked && body.visit_count !== undefined;
    const isPricingUpdate = wantsAmountChange || wantsVisitCountChange;

    /**
     * While it is unsettled the fee is the desk's: any receptionist or the
     * admin may price it, whoever entered it (client revision, 2026-09-24 —
     * this replaces Q-20's own-row rule). Once it is settled it is the admin's
     * alone. `amount_set_by` is still written on every change; it is the record
     * now, not the lock.
     */
    if (currentSettlement.settled === true && (isPricingUpdate || body.settled !== undefined)) {
      const allowed = canAmendPayout(authResult.user, { settled: true, noun: 'doctor fee' });
      if (!allowed.ok) {
        return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status });
      }
    }

    /**
     * Re-pricing a settled fee no longer un-pays it behind the caller's back.
     * It did: any pricing edit flipped `settled` to false, deleted the ledger
     * debit and asked you to settle again — three steps and a hole in the books
     * for whoever forgot the third. An admin now amends it in place (below),
     * and only an explicit `settled: false` is a real reversal.
     *
     * A reversal can still be refused: sync may have created a newer pending
     * row for the same doctor and purpose, and the partial unique index allows
     * only one live unsettled row per key.
     */
    const wantsToUnsettle = body.settled === false;
    let wasSettled = false;

    if (currentSettlement.settled === true && wantsToUnsettle) {
      wasSettled = true;
      // Un-paying clears the payout from the row that records it, which is what
      // Finances counts money out from (CR-13, AC-13.2).
      const reversed = await unpayDoctorFee(supabase, authResult.user, currentSettlement);

      if (!reversed.ok) {
        return NextResponse.json({ error: reversed.error, code: reversed.code }, { status: reversed.status });
      }
    }

    // An admin correcting what a settled fee cost: the row stays settled and the
    // amount on it is restated. There is no ledger row to keep in step any more
    // — the settlement *is* the record — so this is one write, not two.
    const amendingSettled =
      currentSettlement.settled === true && !wantsToUnsettle && isPricingUpdate;

    const updateData: any = {
      updated_by: authResult.user.id,
      updated_at: new Date().toISOString(),
    };

    // The count this write's total is priced against — the row's own stored
    // count, unless this is a manual row and the caller is changing it.
    let effectiveVisitCount = currentSettlement.visit_count ?? 0;

    if (wantsVisitCountChange) {
      const newCount = parseInt(body.visit_count);
      if (!Number.isInteger(newCount) || newCount < 0) {
        return NextResponse.json({ error: 'visit_count must be a whole number, zero or more' }, { status: 400 });
      }
      updateData.visit_count = newCount;
      effectiveVisitCount = newCount;
    }

    if (wantsAmountChange) {
      let amount: number;

      if (body.amount_per_visit !== undefined) {
        amount = parseFloat(body.amount_per_visit);
      } else {
        // Converting a total needs a count to divide by. A row can legitimately
        // have zero visits (nothing left to bill after sync zeroed it out) — a
        // total makes no sense to price against that, so ask for a per-visit
        // rate instead.
        if (effectiveVisitCount <= 0) {
          return NextResponse.json(
            { error: 'This settlement has no visits to price a total against. Set a per-visit rate instead.' },
            { status: 400 }
          );
        }
        amount = parseFloat(body.total_amount) / effectiveVisitCount;
      }

      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: 'The amount must be a number, zero or more' }, { status: 400 });
      }

      updateData.amount_per_visit = amount;
      updateData.amount_set_by = authResult.user.id;
    }

    // total_amount is a stored column, not derived by the database — every branch
    // above that touches the rate or the count must keep it in sync, or it's
    // exactly the gap that used to leave it null forever (BUGS.md #26).
    if (wantsAmountChange || wantsVisitCountChange) {
      const amt = updateData.amount_per_visit ?? currentSettlement.amount_per_visit ?? 0;
      updateData.total_amount = Math.floor(amt * effectiveVisitCount);
    }

    /**
     * The amendment itself: what was paid becomes the new total. `amount_set_by`
     * is stamped here rather than only on the original pricing, so the name
     * beside the amount is whoever last changed *that number*.
     */
    if (amendingSettled) {
      updateData.settlement_amount = updateData.total_amount;
      updateData.amount_set_by = authResult.user.id;
      updateData.amount_set_at = updateData.updated_at;
    }

    /**
     * Paying is not a flag.
     *
     * This branch used to set `settled`, `settlement_date` and `settled_by`
     * straight onto the row — and write **nothing** to the ledger. So a doctor
     * fee settled from the patient's Billing tab was money the hospital had
     * handed over with no debit to show for it, while the same payout made from
     * the Finances screen booked one. A doctor's fee is deducted directly in
     * the finances (it is not petty cash), so it goes through the one payout
     * path below, exactly like every other way of paying it (CR-13).
     */
    const wantsToSettle = body.settled === true && currentSettlement.settled !== true;

    if (body.settled !== undefined && !wantsToSettle) {
      updateData.settled = body.settled;

      if (body.settled === false) {
        updateData.settlement_date = null;
        updateData.settlement_amount = null;
        updateData.payment_method = null;
        updateData.transaction_reference = null;
        updateData.settled_by = null;
      }
    }

    if (body.settlement_amount !== undefined) {
      updateData.settlement_amount = parseFloat(body.settlement_amount);
    }

    if (body.payment_method !== undefined && body.payment_method !== '') {
      updateData.payment_method = body.payment_method;
    }

    if (body.transaction_reference !== undefined && body.transaction_reference !== '') {
      updateData.transaction_reference = body.transaction_reference;
    }

    if (body.settlement_notes !== undefined && body.settlement_notes !== '') {
      updateData.settlement_notes = body.settlement_notes;
    }

    // Who physically handled the payout — optional, same convention as
    // advances' given_by.
    if (body.given_by !== undefined) {
      updateData.given_by = body.given_by?.trim() || null;
    }

    if (body.settlement_type !== undefined) {
      updateData.settlement_type = body.settlement_type;
    }

    const meaningfulFields = Object.keys(updateData).filter(
      k => k !== 'updated_by' && k !== 'updated_at'
    );

    if (meaningfulFields.length === 0 && !wasSettled) {
      return NextResponse.json(
        { error: 'No data provided to update', data: currentSettlement },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .update(updateData)
      .eq('id', settlementId)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        patient:patients(id, name),
        created_by_user:users!created_by(id, username),
        updated_by_user:users!updated_by(id, username),
        settled_by_user:users!settled_by(id, username)
      `)
      .single();

    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error:
            'There is already a newer pending settlement for this doctor and purpose. Settle or merge that one first before reopening this one.',
        },
        { status: 409 }
      );
    }
    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Settlement not found after update' }, { status: 404 });
    }

    /**
     * Now pay it, if that is what was asked. The pricing above has landed, so
     * `data` carries the amount to hand over unless the caller named one.
     * `payDoctorFee` marks it settled and records who paid it, who handed the
     * money over and how — the same path the Finances screen and the Settle
     * button use. Nothing is written to the ledger: the money comes straight
     * from the admin (client revision, 2026-09-24).
     */
    let settledRow = data;

    if (wantsToSettle) {
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

      const amount = body.settlement_amount !== undefined
        ? Number(body.settlement_amount)
        : Number(data.total_amount) || 0;

      const paid = await payDoctorFee(supabase, authResult.user, data, {
        amount,
        details: details.value,
        settlementType: body.settlement_type,
      });

      if (!paid.ok) {
        return NextResponse.json({ error: paid.error, code: paid.code }, { status: paid.status });
      }

      settledRow = paid.settlement;
    }

    if (settledRow.patient_billing_id) {
      await recalculatePatientBilling(supabase, settledRow.patient_billing_id);
    }

    const message = wantsToSettle
      ? 'Fee marked paid.'
      : amendingSettled
      ? 'Settled fee updated.'
      : wasSettled
        ? 'Payout reversed and the settlement reopened.'
        : 'Settlement updated successfully';

    return NextResponse.json(
      {
        success: true,
        data: settledRow,
        message,
        metadata: {
          wasSettled,
          pricingUpdated: isPricingUpdate,
          updatedFields: meaningfulFields,
          amendedInPlace: amendingSettled,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating settlement:', error);
    return NextResponse.json(
      {
        error: 'Failed to update settlement',
        details: String(error),
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> }
) {
  try {
    const auth = await requireBilling(request, 'doctor-fee:write');
    if (auth.response) return auth.response;
    const authResult = { user: auth.user };

    const supabase = await createClient();
    const { settlementId } = await params;
    // A DELETE carries no body from most callers; demanding one 500'd the
    // request (BUGS.md #46).
    const body = await request.json().catch(() => ({}));

    const { data: settlement } = await supabase
      .from('doctor_visit_settlements')
      .select('patient_billing_id, settled')
      .eq('id', settlementId)
      .maybeSingle();

    if (!settlement) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    // Same rule as editing: a settled fee is the admin's. Deleting one used to
    // be open to anyone with the capability, which let the desk remove a fee
    // that had already been paid and leave its debit behind in the ledger.
    const allowed = canAmendPayout(authResult.user, {
      settled: settlement.settled === true,
      noun: 'doctor fee',
    });
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status });
    }

    const billingId = settlement.patient_billing_id;

    // Release the visits this settlement billed back into the unbilled pool —
    // otherwise they'd be permanently stuck pointing at a row that no longer
    // exists as an active settlement, invisible to every future sync.
    const { error: releaseError } = await supabase
      .from('patient_consultations')
      .update({ settlement_id: null })
      .eq('settlement_id', settlementId);

    if (releaseError) throw releaseError;

    const useSoftDelete = body.soft_delete !== false; // Default to soft delete

    if (useSoftDelete) {
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', settlementId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .delete()
        .eq('id', settlementId);

      if (error) throw error;
    }

    if (billingId) {
      await recalculatePatientBilling(supabase, billingId);
    }

    return NextResponse.json(
      {
        success: true,
        message: useSoftDelete ? 'Settlement soft deleted successfully' : 'Settlement deleted permanently',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting settlement:', error);
    return NextResponse.json(
      { error: 'Failed to delete settlement', details: String(error) },
      { status: 500 }
    );
  }
}
